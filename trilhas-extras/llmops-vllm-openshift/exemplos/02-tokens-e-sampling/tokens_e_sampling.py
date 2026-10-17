"""Tokens e sampling: o que você paga e o que controla a "criatividade".

1. /tokenize mostra como o texto vira tokens (a unidade de custo e de limite de contexto).
2. temperature=0 repete a resposta; temperature alta varia.
3. max_tokens corta a resposta -> finish_reason == "length".
"""
import os

import httpx
from openai import OpenAI

URL = os.getenv("VLLM_URL", "http://localhost:8000")
client = OpenAI(base_url=URL + "/v1", api_key="local")


def tokenizar(texto: str) -> list[str]:
    # /tokenize é um endpoint extra do vLLM (não existe na API da OpenAI).
    ids = httpx.post(f"{URL}/tokenize", json={"model": "qwen-mini", "prompt": texto}).json()["tokens"]
    # /detokenize de cada id isolado mostra o "pedaço" de texto que ele representa.
    return [httpx.post(f"{URL}/detokenize", json={"model": "qwen-mini", "tokens": [i]}).json()["prompt"] for i in ids]


def completar(temperature: float, max_tokens: int = 25, seed: int | None = None):
    r = client.chat.completions.create(
        model="qwen-mini",
        messages=[{"role": "user", "content": "Invente um nome para um gato."}],
        temperature=temperature,
        max_tokens=max_tokens,
        seed=seed,
    )
    return r.choices[0].message.content.strip().replace("\n", " "), r.choices[0].finish_reason


print("== 1. Tokens ==")
for texto in ["Kubernetes", "OpenShift orquestra containers.", "paralelepípedo"]:
    pedacos = tokenizar(texto)
    print(f"{texto!r} -> {len(pedacos)} tokens: {pedacos}")

print("\n== 2. temperature=0 (3 vezes) ==")
for _ in range(3):
    print("  ", completar(0.0)[0])

print("\n== 2. temperature=1.2 (3 vezes) ==")
for i in range(3):
    print("  ", completar(1.2, seed=i)[0])  # seed fixa só para o exemplo ser reprodutível

print("\n== 3. max_tokens=5 ==")
texto, motivo = completar(0.0, max_tokens=5)
print(f"   {texto!r}  finish_reason={motivo}")
