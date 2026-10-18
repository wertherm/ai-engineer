"""Solução do exercício 02 (versão Python): avaliação automática de qualidade como PORTÃO de CI.
 1) Recuperação (sem LLM, segundos): hit@1, hit@3 e MRR sobre o golden set rotulado à mão (o MESMO golden.json do JS).
 2) Citações: a guarda verificar_resposta contra respostas-fixture (boas e ruins) — determinístico.
 3) Opcional (--com-llm N): gera N respostas reais e confere se citam a fonte esperada.
Sai com código 1 se alguma métrica ficar abaixo do limiar: é isso que faz o CI "ficar vermelho".
  uv run python exercicios/02-avaliacao-no-ci/solucao/python/avaliar.py [--com-llm 2] [--golden outro.json]
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from app_py.db import criar_pool
from app_py.llm import criar_llm
from app_py.rag import verificar_resposta
from app_py.servico import criar_servico

LIMIARES = {"hit@1": 0.75, "hit@3": 0.9, "mrr": 0.8, "citacoes": 1.0}
GOLDEN_PADRAO = Path(__file__).resolve().parent.parent / "golden.json"
FIXTURES = [
    {"texto": "O auxílio é de R$ 150,00 por mês [1].", "n_fontes": 3, "esperado": True},
    {"texto": "Pode dividir em 3 períodos [1][2].", "n_fontes": 3, "esperado": True},
    {"texto": "Não encontrei isso nas políticas da empresa.", "n_fontes": 3, "esperado": True},
    {"texto": "O auxílio é de R$ 150,00 por mês.", "n_fontes": 3, "esperado": False},  # sem citação
    {"texto": "São 45 dias de férias [7].", "n_fontes": 3, "esperado": False},  # citação inventada
    {"texto": "Detalhes em https://exfiltra.example/x [1].", "n_fontes": 3, "esperado": False},  # link
]


async def avaliar(golden: list[dict], n_llm: int) -> bool:
    pool = await criar_pool()
    try:
        servico = criar_servico(pool=pool, llm=criar_llm())
        async with pool.connection() as c:
            tenants = {t["id"]: t for t in await (await c.execute("SELECT id, nome FROM m11.tenants_py")).fetchall()}

        # ---- 1) Recuperação ----
        hit1 = hit3 = rr = 0.0
        print("== Recuperação (golden set rotulado: pergunta -> arquivo que responde)")
        for g in golden:
            trechos = await servico.buscar(tenants[g["tenant"]], g["pergunta"], k=3, canal="avaliacao")
            pos = next((i for i, t in enumerate(trechos, 1) if t["fonte"] == g["fonte"]), 0)  # 0 = não achou no top-3
            hit1 += pos == 1
            hit3 += pos >= 1
            rr += 1 / pos if pos else 0
            marca = "ok " if pos == 1 else "~  " if pos else "X  "
            print(f"  {marca} pos={pos or '-'} {g['tenant']:<8} {g['pergunta']}")
        metricas = {"hit@1": hit1 / len(golden), "hit@3": hit3 / len(golden), "mrr": rr / len(golden)}
        limiares = dict(LIMIARES)

        # ---- 2) Checagem de citações (fixtures) ----
        acertos = sum(verificar_resposta(f["texto"], f["n_fontes"])["ok"] == f["esperado"] for f in FIXTURES)
        metricas["citacoes"] = acertos / len(FIXTURES)
        print(f"\n== Guarda de citações: {acertos}/{len(FIXTURES)} fixtures classificadas corretamente")

        # ---- 3) Opcional: respostas reais do LLM ----
        if n_llm:
            print(f"\n== Respostas reais ({n_llm}, LLM local)")
            certas = 0
            for g in golden[:n_llm]:
                r = await servico.perguntar(tenants[g["tenant"]], g["pergunta"], canal="avaliacao")
                cita_certo = r["verificado"] and any(c["fonte"] == g["fonte"] for c in r["citacoes"])
                certas += cita_certo
                quando = "(cache)" if r["cache"] else f"({r['ms'] / 1000:.0f}s)"
                print(f"  {'ok' if cita_certo else 'X '} {g['pergunta']} -> [{', '.join(c['fonte'] for c in r['citacoes'])}] {quando}")
            metricas["citacao_correta_llm"] = certas / n_llm
            limiares["citacao_correta_llm"] = 1.0
    finally:
        await pool.close()

    # ---- Portão ----
    print("\n== Portão de qualidade")
    reprovou = False
    for nome, valor in metricas.items():
        ok = valor >= limiares[nome]
        reprovou |= not ok
        print(f"  {'PASSOU ' if ok else 'REPROVOU'} {nome:<20} {valor:.3f} (mínimo {limiares[nome]:g})")
    print("\nResultado: REPROVADO (o CI falharia)" if reprovou else "\nResultado: APROVADO")
    return not reprovou


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Portão de qualidade do RAG (hit@k, MRR, guarda de citações)")
    ap.add_argument("--com-llm", type=int, default=0, metavar="N", help="gera N respostas reais com o LLM")
    ap.add_argument("--golden", type=Path, default=GOLDEN_PADRAO, help="arquivo do golden set")
    a = ap.parse_args()
    aprovado = asyncio.run(avaliar(json.loads(a.golden.read_text(encoding="utf-8")), a.com_llm))
    sys.exit(0 if aprovado else 1)
