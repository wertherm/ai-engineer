"""Calculadora de custo total de uma feature de IA: API x self-hosting, com cache, retentativas e guardrails.

Uso: uv run python exemplos/05-custos-e-orcamento/python/custos.py [premissas.json]
Lê o MESMO premissas.json do JS (pasta acima) e imprime os mesmos números.
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo (comum_py)

from comum_py.formato import fmt as fmt_br, to_fixed  # noqa: E402

M = 1e6


def custo_api(p: dict) -> dict:
    """Custo mensal via API, separado por componente (o que não se mede não se otimiza)."""
    uso, guardrails, api = p["uso"], p["guardrails"], p["api"]
    req = uso["requisicoes_por_dia"] * uso["dias_por_mes"] * (1 + uso["taxa_retentativa"])
    entrada_cache = req * uso["tokens_entrada_por_req"] * uso["fracao_entrada_em_cache"]
    entrada_cheia = req * uso["tokens_entrada_por_req"] - entrada_cache
    componentes = {
        "entrada (sem cache)": entrada_cheia / M * api["usd_por_milhao_entrada"],
        "entrada (cache)": entrada_cache / M * api["usd_por_milhao_entrada_cache"],
        "saida": req * uso["tokens_saida_por_req"] / M * api["usd_por_milhao_saida"],
        "guardrails": (
            req * guardrails["tokens_entrada_classificador"] / M * api["usd_por_milhao_entrada_classificador"]
            + req * guardrails["tokens_saida_classificador"] / M * api["usd_por_milhao_saida_classificador"]
        ) if guardrails["chamada_classificador_por_req"] else 0,
    }
    return {"req": req, "componentes": componentes, "total": sum(componentes.values())}


def custo_self_hosting(p: dict) -> dict:
    """Self-hosting: paga a GPU ligada, use ou não. A capacidade limita o volume."""
    uso, s = p["uso"], p["self_hosting"]
    total = s["gpus"] * s["usd_por_gpu_hora"] * s["horas_por_mes"] + s["custo_fixo_mensal_usd"]
    capacidade_saida = s["gpus"] * s["tokens_saida_por_segundo_por_gpu"] * 3600 * s["horas_por_mes"]
    demanda_saida = (uso["requisicoes_por_dia"] * uso["dias_por_mes"] * (1 + uso["taxa_retentativa"])
                     * uso["tokens_saida_por_req"])
    return {"total": total, "utilizacao": demanda_saida / capacidade_saida}


def js_round(x: float) -> int:
    """Math.round do JS (empate sobe); o round() do Python arredonda empate para o par."""
    return math.floor(x + 0.5)


def main(argv):
    arquivo = Path(argv[0]) if argv else Path(__file__).resolve().parent.parent / "premissas.json"
    p = json.loads(arquivo.read_text(encoding="utf-8"))

    def fmt(usd):
        return f"US$ {to_fixed(usd, 2):>10}  (R$ {to_fixed(usd * p['cambio_brl_por_usd'], 0)})"

    api = custo_api(p)
    self_ = custo_self_hosting(p)
    print(f"Feature: {p['feature']} · {fmt_br(js_round(api['req']))} chamadas/mês (com retentativas)")
    print("\nAPI (pago por token):")
    for k, v in api["componentes"].items():
        print(f"  {k:<20} {fmt(v)}")
    print(f"  {'TOTAL':<20} {fmt(api['total'])}   -> {to_fixed(api['total'] / api['req'] * 1000, 3)} US$/mil chamadas")

    sem_cache = custo_api({**p, "uso": {**p["uso"], "fracao_entrada_em_cache": 0}})
    print(f"  (sem cache seria {fmt(sem_cache['total'])}: o cache economiza "
          f"{to_fixed(100 * (1 - api['total'] / sem_cache['total']), 0)}%)")

    print("\nSelf-hosting (pago por hora de GPU):")
    print(f"  {'TOTAL':<20} {fmt(self_['total'])}   utilização da capacidade: {to_fixed(100 * self_['utilizacao'], 1)}%")

    # Ponto de equilíbrio: a partir de quantas chamadas/dia o self-hosting fica mais barato?
    # (custo da API cresce linear com o volume; o do self-hosting é ~fixo até lotar as GPUs)
    custo_por_req_api = api["total"] / (p["uso"]["requisicoes_por_dia"] * p["uso"]["dias_por_mes"])
    equilibrio = self_["total"] / p["uso"]["dias_por_mes"] / custo_por_req_api
    print(f"\nPonto de equilíbrio: ~{fmt_br(js_round(equilibrio))} chamadas/dia "
          f"({to_fixed(equilibrio / p['uso']['requisicoes_por_dia'], 1)}x o volume atual).")
    print("Hoje: API sai mais barato." if api["total"] < self_["total"] else "Hoje: self-hosting sai mais barato.")


if __name__ == "__main__":
    main(sys.argv[1:])
