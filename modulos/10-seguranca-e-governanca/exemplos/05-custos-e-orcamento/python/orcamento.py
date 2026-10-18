"""Orçamento de IA com alerta e corte (OWASP LLM10 "Unbounded Consumption" + FinOps).

Cada chamada ao LLM vira uma linha em m10.uso_llm_py; antes de chamar, consultamos o gasto do dia.
Uso: uv run python exemplos/05-custos-e-orcamento/python/orcamento.py [--com-cota]
(Tabela com sufixo _py para não colidir com a m10.uso_llm do JS.)
"""
import os
import sys

import psycopg

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://ia:ia@localhost:5433/ia")

# Preço por milhão de tokens (hipotético, mesmo do premissas.json) e orçamento diário por feature.
PRECO = {"entrada": 1.0, "saida": 4.0}
ORCAMENTO_DIA_USD = {"suporte": 5.0, "resumo": 2.0}
ALERTA = 0.8  # avisa em 80%, corta em 100%
COTA_USUARIO_DIA_USD = 0.25  # sem cota por usuário, UM abusador derruba a feature para todos

DDL = """
CREATE SCHEMA IF NOT EXISTS m10;
DROP TABLE IF EXISTS m10.uso_llm_py;
CREATE TABLE m10.uso_llm_py (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  feature text NOT NULL,
  usuario text NOT NULL,
  tokens_entrada int NOT NULL,
  tokens_saida int NOT NULL,
  custo_usd numeric(12,6) NOT NULL
);
CREATE INDEX ON m10.uso_llm_py (feature, ts);
"""


def verificar_orcamento(db, feature):
    """Consulta o gasto do dia e decide: liberar, liberar com alerta, ou bloquear."""
    (gasto,) = db.execute(
        "SELECT coalesce(sum(custo_usd), 0)::float FROM m10.uso_llm_py "
        "WHERE feature = %s AND ts >= date_trunc('day', now())", (feature,)).fetchone()
    fracao = gasto / ORCAMENTO_DIA_USD[feature]
    estado = "BLOQUEADO" if fracao >= 1 else "ALERTA" if fracao >= ALERTA else "ok"
    return {"gasto": gasto, "fracao": fracao, "estado": estado}


def gasto_do_usuario(db, usuario):
    (gasto,) = db.execute(
        "SELECT coalesce(sum(custo_usd), 0)::float FROM m10.uso_llm_py "
        "WHERE usuario = %s AND ts >= date_trunc('day', now())", (usuario,)).fetchone()
    return gasto


def registrar(db, feature, usuario, tokens_entrada, tokens_saida):
    custo = (tokens_entrada * PRECO["entrada"] + tokens_saida * PRECO["saida"]) / 1e6
    db.execute(
        "INSERT INTO m10.uso_llm_py (feature, usuario, tokens_entrada, tokens_saida, custo_usd) "
        "VALUES (%s, %s, %s, %s, %s)", (feature, usuario, tokens_entrada, tokens_saida, custo))


def main(argv):
    com_cota = "--com-cota" in argv
    # autocommit: cada INSERT fica visível na hora, como no `pg` do Node (sem transação implícita).
    with psycopg.connect(DATABASE_URL, autocommit=True) as db:
        db.execute(DDL)

        # Simulação determinística: o "suporte" recebe tráfego normal e, a partir da chamada 1200,
        # um usuário entra em loop (agente mal configurado ou abuso) mandando prompts enormes, misturado
        # ao tráfego legítimo (1 em cada 3 chamadas continua sendo de clientes normais).
        print(f"Cenário: orçamento por feature{' + cota por usuário' if com_cota else ' (sem cota por usuário)'}")
        estado_anterior = "ok"
        bloqueadas = legitimas_bloqueadas = barradas_por_cota = 0
        for i in range(1, 2001):
            em_loop = i >= 1200 and i % 3 != 0
            usuario = "u-loop" if em_loop else f"u-{i % 50}"
            v = verificar_orcamento(db, "suporte")
            if v["estado"] != estado_anterior:
                print(f"chamada {i:>4}: {v['estado']:<9} gasto US$ {v['gasto']:.4f} ({100 * v['fracao']:.0f}% do orçamento)")
                estado_anterior = v["estado"]
            if v["estado"] == "BLOQUEADO":
                bloqueadas += 1
                if not em_loop:
                    legitimas_bloqueadas += 1  # resposta degradada: "tente mais tarde" ou fila para humano
                continue
            if com_cota and gasto_do_usuario(db, usuario) >= COTA_USUARIO_DIA_USD:
                barradas_por_cota += 1  # só este usuário é barrado; os outros seguem atendidos
                continue
            registrar(db, "suporte", usuario, 8000 if em_loop else 1500, 600 if em_loop else 250)
        registrar(db, "resumo", "u-1", 3000, 400)

        print(f"\nChamadas bloqueadas pelo orçamento da feature: {bloqueadas} ({legitimas_bloqueadas} de clientes "
              f"legítimos) · barradas pela cota do usuário: {barradas_por_cota}")
        linhas = db.execute("""
            SELECT feature, usuario, count(*)::int, sum(custo_usd)::float
            FROM m10.uso_llm_py WHERE ts >= date_trunc('day', now())
            GROUP BY feature, usuario ORDER BY 4 DESC LIMIT 3""").fetchall()
        print("Quem mais gastou hoje (por feature e usuário):")
        for feature, usuario, chamadas, usd in linhas:
            print(f"  {feature:<8} {usuario:<7} {chamadas:>5} chamadas  US$ {usd:.4f}")
        for f, limite in ORCAMENTO_DIA_USD.items():
            v = verificar_orcamento(db, f)
            print(f"Orçamento {f:<8}: US$ {v['gasto']:.4f} de {limite:.2f} -> {v['estado']}")


if __name__ == "__main__":
    main(sys.argv[1:])
