"""Simulador de entrevista técnica de IA (versão Python do simulador.js).

  --sortear N [--seed S] [--categoria C]    sorteia N perguntas (determinístico com seed)
  --avaliar ID (--resposta "..." | --resposta-arquivo arq) [--llm]
       nota offline pela cobertura dos pontos-chave; com --llm, pede feedback ao LLM local segundo a rubrica.

Lê os MESMOS ../perguntas.json e ../rubrica.md do JS. A mesma seed sorteia as mesmas perguntas do JS.
"""
import argparse
import json
import math
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para achar comum_py

PASTA = Path(__file__).resolve().parent.parent
banco = json.loads((PASTA / "perguntas.json").read_text(encoding="utf-8"))

M32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    """Math.imul do JS: produto de 32 bits (o int do Python não estoura, então mascaramos)."""
    return (a * b) & M32


def mulberry32(seed: int):
    """PRNG mulberry32 com aritmética de 32 bits sem sinal: mesma seed = mesma sequência do JS."""
    a = seed & M32

    def rnd() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = _imul(a ^ (a >> 15), 1 | a)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return rnd


def sortear(n: int, seed: int | None = None, categoria: str | None = None) -> list[dict]:
    rnd = mulberry32(int(time.time() * 1000) if seed is None else seed)
    copia = [p for p in banco if not categoria or p["categoria"] == categoria]
    # Fisher-Yates parcial.
    for i in range(len(copia) - 1, 0, -1):
        j = math.floor(rnd() * (i + 1))
        copia[i], copia[j] = copia[j], copia[i]
    return copia[:n]


def avaliar_offline(pergunta: dict, resposta: str) -> dict:
    """Nota offline: quais pontos-chave a resposta cobre (regex simples; checklist, não juiz)."""
    cobertos = [p for p in pergunta["pontosChave"] if re.search(p["padrao"], resposta, re.IGNORECASE)]
    faltando = [p for p in pergunta["pontosChave"] if p not in cobertos]
    pct = math.floor(len(cobertos) / len(pergunta["pontosChave"]) * 100 + 0.5)  # = Math.round do JS
    return {"pct": pct, "cobertos": cobertos, "faltando": faltando}


def feedback_llm(pergunta: dict, resposta: str) -> dict:
    from comum_py.llm import MODELO_CHAT, chat  # import tardio: sem --llm não precisa do SDK nem da infra

    pontos = "; ".join(p["ponto"] for p in pergunta["pontosChave"])
    messages = [
        {"role": "system", "content": (PASTA / "rubrica.md").read_text(encoding="utf-8")},
        {"role": "user", "content": f"Pergunta: {pergunta['pergunta']}\nPontos-chave esperados: {pontos}\n\nResposta do candidato: {resposta}"},
    ]
    return {**chat(messages, max_tokens=160), "modelo": MODELO_CHAT}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sortear", type=int)
    ap.add_argument("--seed", type=int)
    ap.add_argument("--categoria")
    ap.add_argument("--avaliar")
    ap.add_argument("--resposta")
    ap.add_argument("--resposta-arquivo")
    ap.add_argument("--llm", action="store_true")
    a = ap.parse_args()

    if a.sortear:
        seed = a.seed if a.seed is not None else int(time.time() * 1000)
        print(f"Entrevista simulada (seed {seed}) · {len(banco)} perguntas no banco\n")
        for i, p in enumerate(sortear(a.sortear, seed, a.categoria)):
            print(f"{i + 1}. [{p['categoria']} · {p['nivel']}] {p['pergunta']}")
            print(f'   avaliar: uv run python exemplos/04-simulador-de-entrevista/python/simulador.py --avaliar {p["id"]} --resposta "..."')
    elif a.avaliar:
        p = next((x for x in banco if x["id"] == a.avaliar), None)
        if p is None:
            sys.exit(f"pergunta {a.avaliar} não existe; ids: {', '.join(x['id'] for x in banco)}")
        resposta = a.resposta if a.resposta is not None else Path(a.resposta_arquivo).read_text(encoding="utf-8").strip()
        off = avaliar_offline(p, resposta)
        print(f"Pergunta: {p['pergunta']}\nResposta: {resposta}\n")
        print(f"Cobertura dos pontos-chave: {off['pct']}%")
        for x in off["cobertos"]:
            print(f"  [x] {x['ponto']}")
        for x in off["faltando"]:
            print(f"  [ ] {x['ponto']}")
        print(f"\nArmadilhas comuns: {' · '.join(p['armadilhas'])}")
        if a.llm:
            print("\nPedindo feedback ao LLM (pode levar alguns minutos em CPU)...", flush=True)
            r = feedback_llm(p, resposta)
            tokens = r["usage"].completion_tokens if r["usage"] else "?"
            print(f"\nFeedback ({r['modelo']}, {r['ms'] / 1000:.0f} s, {tokens} tokens):\n{r['texto'].strip()}")
        print(f"\nResposta-modelo:\n{p['respostaModelo']}")
    else:
        print('Use --sortear N [--seed S] ou --avaliar ID --resposta "..." [--llm]')


if __name__ == "__main__":
    main()
