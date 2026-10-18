"""Exemplo 05 (Python) · Model Router + Model Tiering + Semantic Cache + Response Streaming,
com relatório de custo/latência."""

import json
import os
import sys
import time
from types import SimpleNamespace

from cache import CacheSemantico
from roteador import TIERS, rotear

from comum_py.llm import PRECOS, chat, chat_stream, conectar, custo_usd, fixo, ms_desde, tabela

PEDIDOS = [
    "O que é CDI?",
    "Compare antecipação de recebíveis e empréstimo com CCB para um lojista, com prós e contras.",
    "o que significa CDI?",
    "Me explique rapidinho o que é o CDI",
    "O que é CDB?",  # parecido com "CDI" no texto, mas é OUTRA pergunta: o limiar precisa barrar
    "Compare a antecipação de recebíveis com um empréstimo via CCB para lojistas: prós e contras",
]

with conectar() as conn:
    cache = CacheSemantico(conn, limiar=float(os.environ.get("LIMIAR", 0.9)))
    cache.iniciar()

    linhas = []
    custo_real = custo_sem_otimizacao = 0.0
    for pergunta in PEDIDOS:
        t0 = time.perf_counter()
        c = cache.buscar(pergunta)
        if c["hit"]:
            ms = ms_desde(t0)
            viz = c["vizinho"]
            # Contrafactual: quanto teria custado gerar de novo no tier caro (um sistema sem roteador).
            custo_sem_otimizacao += custo_usd("caro", SimpleNamespace(prompt_tokens=viz["prompt_tokens"],
                                                                       completion_tokens=viz["completion_tokens"]))
            linhas.append({"pergunta": pergunta[:38], "rota": f"cache ({viz['tier']})", "sim": fixo(c["sim"], 3),
                           "ms": ms, "ttft": ms, "tokens": 0, "US$": "0"})
            continue
        tier, motivo = rotear(pergunta)
        msgs = [{"role": "system", "content": TIERS[tier]["sistema"]}, {"role": "user", "content": pergunta}]
        if tier == "caro":
            # Response Streaming: a resposta longa começa a aparecer no TTFT, não no fim. O custo é o mesmo;
            # muda a latência PERCEBIDA.
            print(f"\n[stream {tier}] ", end="", flush=True)
            r = chat_stream(msgs, max_tokens=TIERS[tier]["max_tokens"],
                            on_token=lambda t: (sys.stdout.write(t), sys.stdout.flush()))
            print()
        else:
            r = chat(msgs, max_tokens=TIERS[tier]["max_tokens"])
            r["ttft"] = r["ms"]  # sem streaming, o usuário só vê algo no fim
            print(f"\n[{tier}] {r['texto']}", flush=True)
        u = r["usage"]
        cache.gravar(pergunta, c["emb"], r["texto"], tier, u)
        usd = custo_usd(tier, u)
        custo_real += usd
        custo_sem_otimizacao += custo_usd("caro", u)
        cached = getattr(getattr(u, "prompt_tokens_details", None), "cached_tokens", None) if u else None
        linhas.append({
            "pergunta": pergunta[:38], "rota": f"{tier} ({motivo})", "sim": fixo(c["sim"], 3),
            "ms": ms_desde(t0), "ttft": r["ttft"],
            "tokens": f"{u.prompt_tokens}+{u.completion_tokens}" + (f" ({cached} em prompt cache)" if cached else ""),
            "US$": fixo(usd, 6),
        })

print("\n" + tabela(linhas))
print(f"\nPreços de tabela (US$/1M tokens in/out): {json.dumps(PRECOS, separators=(',', ':'))}")
print(f"Custo real (roteador + cache):        US$ {fixo(custo_real, 6)}")
print(f"Custo sem otimização (tudo no caro):  US$ {fixo(custo_sem_otimizacao, 6)}")
print(f"Economia: {fixo(100 * (1 - custo_real / custo_sem_otimizacao), 0)}%")
