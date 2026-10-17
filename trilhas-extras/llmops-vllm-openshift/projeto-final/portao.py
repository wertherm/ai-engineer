"""Portão de promoção LLMOps: decide se uma versão (modelo + prompt + parâmetros) vai para produção.

Etapas, na ordem em que um pipeline de CI/CD rodaria:
  1. saúde     -> o servidor responde?
  2. avaliação -> os casos obrigatórios passam? (qualidade)
  3. carga     -> sob concorrência, cumpre o SLO? (desempenho, medido pelo /metrics do próprio vLLM)
  4. veredito  -> relatorio.md + código de saída 0 (promover) ou 1 (barrar)

Uso: uv run python projeto-final/portao.py
"""
import asyncio
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx
import yaml
from openai import AsyncOpenAI, OpenAI

AQUI = Path(__file__).parent
URL = os.getenv("VLLM_URL", "http://localhost:8000")
MODELO = "qwen-mini"
SLO = yaml.safe_load((AQUI / "slo.yaml").read_text())
CASOS = yaml.safe_load((AQUI / "casos.yaml").read_text())
LINHA = re.compile(r'^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(\S+)$')


# ---------- 1. saúde ----------
def saude() -> tuple[bool, str]:
    try:
        httpx.get(f"{URL}/health", timeout=5).raise_for_status()
        versao = httpx.get(f"{URL}/version", timeout=5).json()["version"]
        return True, f"vLLM {versao} no ar"
    except httpx.HTTPError as erro:
        return False, f"servidor indisponível: {erro}"


# ---------- 2. avaliação ----------
def avaliar_caso(client: OpenAI, caso: dict) -> tuple[bool, str]:
    r = client.chat.completions.create(
        model=MODELO,
        messages=[{"role": "system", "content": CASOS["prompt_sistema"]}, {"role": "user", "content": caso["pergunta"]}],
        temperature=0,
        max_tokens=80,
    )
    resposta = r.choices[0].message.content
    baixa = resposta.lower()
    if any(t.lower() not in baixa for t in caso.get("deve_conter", [])):
        return False, resposta
    if any(t.lower() in baixa for t in caso.get("nao_deve_conter", [])):
        return False, resposta
    if caso.get("formato") == "json":
        try:
            dados = json.loads(resposta.strip().removeprefix("```json").removeprefix("```").removesuffix("```"))
        except json.JSONDecodeError:
            return False, resposta
        if not all(chave in dados for chave in caso["chaves"]):
            return False, resposta
    return True, resposta


def avaliacao() -> tuple[bool, str, list]:
    client = OpenAI(base_url=URL + "/v1", api_key="local")
    resultados = [(c["id"], *avaliar_caso(client, c)) for c in CASOS["casos"]]
    taxa = sum(ok for _, ok, _ in resultados) / len(resultados)
    aprovado = taxa >= SLO["avaliacao"]["taxa_minima_aprovacao"]
    return aprovado, f"{taxa:.0%} dos casos passaram (mínimo {SLO['avaliacao']['taxa_minima_aprovacao']:.0%})", resultados


# ---------- 3. carga + métricas ----------
def foto() -> dict:
    dados = {}
    for linha in httpx.get(f"{URL}/metrics", timeout=10).text.splitlines():
        m = LINHA.match(linha)
        if m and m[1].startswith("vllm:"):
            dados[(m[1], m[2] or "")] = float(m[3])
    return dados


def delta(antes: dict, depois: dict, nome: str) -> float:
    return sum(v - antes.get(k, 0.0) for k, v in depois.items() if k[0] == nome)


def p95_histograma(antes: dict, depois: dict, base: str) -> float:
    buckets = sorted(
        (float(re.search(r'le="([^"]+)"', k[1])[1]), v - antes.get(k, 0.0))
        for k, v in depois.items() if k[0] == f"{base}_bucket"
    )
    total = buckets[-1][1]
    return next(limite for limite, acumulado in buckets if acumulado >= 0.95 * total)


async def gerar_carga() -> float:
    cfg = SLO["carga"]
    client = AsyncOpenAI(base_url=URL + "/v1", api_key="local")
    semaforo = asyncio.Semaphore(cfg["concorrencia"])

    async def uma(i: int):
        async with semaforo:
            await client.completions.create(
                model=MODELO, prompt=f"Carga {i}: explique o que é um pod.", max_tokens=cfg["tokens_saida"],
                temperature=0, extra_body={"ignore_eos": True},
            )

    inicio = time.perf_counter()
    await asyncio.gather(*(uma(i) for i in range(cfg["requisicoes"])))
    return time.perf_counter() - inicio


def carga() -> tuple[bool, str, dict]:
    antes = foto()
    duracao = asyncio.run(gerar_carga())
    depois = foto()
    lim = SLO["limites"]
    medidas = {
        "ttft_p95_ms": p95_histograma(antes, depois, "vllm:time_to_first_token_seconds") * 1000,
        "itl_medio_ms": delta(antes, depois, "vllm:inter_token_latency_seconds_sum")
        / delta(antes, depois, "vllm:inter_token_latency_seconds_count") * 1000,
        "throughput_tok_s": delta(antes, depois, "vllm:generation_tokens_total") / duracao,
    }
    checagens = {
        "ttft_p95_ms": medidas["ttft_p95_ms"] <= lim["ttft_p95_ms"],
        "itl_medio_ms": medidas["itl_medio_ms"] <= lim["itl_medio_ms"],
        "throughput_tok_s": medidas["throughput_tok_s"] >= lim["throughput_min_tok_s"],
    }
    resumo = (f"TTFT p95 <= {medidas['ttft_p95_ms']:.0f} ms (limite {lim['ttft_p95_ms']}) · "
              f"ITL {medidas['itl_medio_ms']:.0f} ms (limite {lim['itl_medio_ms']}) · "
              f"{medidas['throughput_tok_s']:.1f} tok/s (mínimo {lim['throughput_min_tok_s']})")
    return all(checagens.values()), resumo, medidas


# ---------- 4. veredito ----------
def main() -> int:
    linhas = [f"# Relatório do portão de promoção — {datetime.now():%Y-%m-%d %H:%M}", ""]
    etapas = []

    ok, msg = saude()
    etapas.append(("Saúde", ok, msg))
    if ok:
        ok_av, msg_av, resultados = avaliacao()
        etapas.append(("Avaliação", ok_av, msg_av))
        ok_cg, msg_cg, _ = carga()
        etapas.append(("Carga / SLO", ok_cg, msg_cg))

    promovido = all(ok for _, ok, _ in etapas) and len(etapas) == 3
    linhas += ["| Etapa | Resultado | Detalhe |", "|---|---|---|"]
    linhas += [f"| {nome} | {'✅' if ok else '❌'} | {msg} |" for nome, ok, msg in etapas]
    if len(etapas) == 3:
        linhas += ["", "## Casos de avaliação", "", "| Caso | Passou | Resposta |", "|---|---|---|"]
        linhas += [f"| {cid} | {'✅' if ok else '❌'} | {resp.strip()[:80].replace('|', '/').replace(chr(10), ' ')} |"
                   for cid, ok, resp in resultados]
    linhas += ["", f"**Veredito: {'PROMOVER ✅' if promovido else 'BARRAR ❌'}**", ""]

    relatorio = "\n".join(linhas)
    (AQUI / "relatorio.md").write_text(relatorio)
    print(relatorio)
    return 0 if promovido else 1


if __name__ == "__main__":
    sys.exit(main())
