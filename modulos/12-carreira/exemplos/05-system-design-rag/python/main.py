"""System design: assistente RAG corporativo para 10 mil funcionários (versão Python do main.js).

Todas as premissas ficam explícitas aqui em cima: numa entrevista, dizer a premissa em voz alta vale
tanto quanto a conta.
"""
import json
import math
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para achar comum_py
from capacidade import PRECOS_ILUSTRATIVOS, Premissas, armazenamento, custo_indexacao, estimar  # noqa: E402
from comum_py.formato import fmt  # noqa: E402

PREMISSAS = Premissas(
    usuarios=10_000,
    ativosDia=0.3,               # 30% usam num dia útil (premissa; valide com o cliente)
    requisicoesPorAtivo=8,
    chamadasLLM=1,               # RAG simples: 1 chamada de geração por pergunta
    tokensEntrada=400 + 5 * 300 + 300 + 50,  # sistema + 5 trechos de ~300 + histórico + pergunta = 2250
    tokensSaida=250,
    fracaoCacheada=0.15,         # prefixo fixo (instruções) servido do cache de prompt
    horasUteis=10,
    fatorPico=3,
    latenciaS=6,
    diasMes=22,
)

BASE = {"documentos": 50_000, "trechosPorDoc": 8, "dimensoes": 1024, "bytesTextoPorTrecho": 1500, "tokensPorTrecho": 300}

# Medido de verdade neste repo: vLLM 0.31.0 em CPU com Qwen2.5-0.5B (projeto final da trilha LLMOps).
TOKENS_S_CPU_MEDIDO = 29.5


def main() -> None:
    e = estimar(PREMISSAS)
    arm = armazenamento(**BASE)
    print("== Volume e capacidade ==")
    print(f"requisições/dia: {fmt(e['req_dia'])} · RPS médio {fmt(e['rps_medio'], 2)} · RPS pico {fmt(e['rps_pico'], 2)}")
    print(f"concorrência no pico (Little): {fmt(e['concorrencia_pico'], 1)} requisições simultâneas")
    print(f"geração no pico: {fmt(e['tokens_saida_por_segundo_pico'])} tokens/s de saída")
    print(f"tokens/mês: {fmt(e['tokens_mes']['entrada'] / 1e6)} M de entrada · {fmt(e['tokens_mes']['saida'] / 1e6)} M de saída")

    # separators=(",", ":") reproduz o JSON.stringify do JS (sem espaços).
    print(f"\n== Custo via API (preços ILUSTRATIVOS, US$/1M tokens: {json.dumps(PRECOS_ILUSTRATIVOS, separators=(',', ':'))}) ==")
    print(f"LLM: US$ {fmt(e['custo_mes'])} /mês · US$ {fmt(e['custo_por_requisicao'], 4)} por pergunta")
    print(f"indexação completa ({fmt(arm['trechos'])} trechos): US$ {fmt(custo_indexacao(arm['trechos'], BASE['tokensPorTrecho']), 2)}")

    print("\n== Armazenamento vetorial ==")
    print(f"{fmt(arm['trechos'])} vetores de {BASE['dimensoes']} dims: {fmt(arm['gb_vetores'], 2)} GB (float32) + {fmt(arm['gb_texto'], 2)} GB de texto, antes do índice HNSW")

    print("\n== Sensibilidade (o que mais mexe no custo?) ==")
    cenarios = {
        "base": {},
        "cache de prompt 50%": {"fracaoCacheada": 0.5},
        "3 trechos em vez de 5": {"tokensEntrada": 400 + 3 * 300 + 300 + 50},
        "agente com 4 chamadas/pergunta": {"chamadasLLM": 4},
        "adoção dobra (60% ativos)": {"ativosDia": 0.6},
    }
    for nome, delta in cenarios.items():
        c = estimar(replace(PREMISSAS, **delta))
        print(f"{nome:<32} US$ {fmt(c['custo_mes']):>6} /mês · pico {fmt(c['tokens_saida_por_segundo_pico']):>5} tok/s")

    print("\n== Self-host: quantas réplicas do servidor medido neste repo? ==")
    tps = e["tokens_saida_por_segundo_pico"]
    print(f"no pico: {fmt(tps)} tok/s ÷ {TOKENS_S_CPU_MEDIDO} tok/s (vLLM CPU, modelo 0,5B) = {math.ceil(tps / TOKENS_S_CPU_MEDIDO)} réplicas")
    print("-> CPU não fecha a conta e um modelo de 0,5B não tem a qualidade necessária: API ou GPU (meça o tok/s da sua GPU).")


if __name__ == "__main__":
    main()
