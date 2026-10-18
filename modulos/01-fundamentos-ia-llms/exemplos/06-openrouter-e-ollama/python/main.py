"""Exemplo 06 (Python) — Open-source local (Ollama) x catálogo multi-modelo (OpenRouter), mesmo código.

Parte 1 (executa sempre): modelos locais no Ollama + catálogo PÚBLICO do OpenRouter (GET sem chave).
Parte 2 (só com OPENROUTER_API_KEY): a mesma pergunta em vários modelos, com fallback.
"""

import os
import sys
import time
from pathlib import Path

import httpx
from openai import OpenAI

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para importar comum_py
from comum_py.llm import BASE_URL, MODELO_CHAT, chat

# ---------- 1a. Ollama: o que está rodando localmente (API nativa /api/tags) ----------
ollama_raiz = BASE_URL.removesuffix("/").removesuffix("/v1")
modelos = httpx.get(f"{ollama_raiz}/api/tags").raise_for_status().json()["models"]
print("Modelos locais no Ollama (pesos abertos, rodando na SUA máquina):")
for m in modelos:
    d = m["details"]
    print(f"  {m['name']:<22} {d['parameter_size']:>8} params | {d['quantization_level']} | {m['size'] / 1e9:.1f} GB")

pergunta = "Em uma frase: o que é um embedding?"
local = chat([{"role": "user", "content": pergunta}], max_tokens=60)
print(f"\n[ollama {MODELO_CHAT}] {local.texto.strip()}")
print(f"  -> {local.completion_tokens} tokens em {local.ms / 1000:.1f}s | custo: R$ 0 (energia da sua máquina)")

# ---------- 1b. OpenRouter: catálogo público, sem chave ----------
catalogo = httpx.get("https://openrouter.ai/api/v1/models", timeout=30).raise_for_status().json()["data"]
gratis = [m for m in catalogo if m["id"].endswith(":free")]
print(f"\nOpenRouter: {len(catalogo)} modelos no catálogo, {len(gratis)} com variante :free")
por_id = {m["id"]: m for m in catalogo}
for id_ in ["anthropic/claude-haiku-5.5", "google/gemini-3.5-flash-lite", "deepseek/deepseek-v4.1-flash", "google/gemma-4-31b-it"]:
    if m := por_id.get(id_):
        entrada = float(m["pricing"]["prompt"]) * 1e6  # preço vem em US$ por token
        saida = float(m["pricing"]["completion"]) * 1e6
        print(f"  {id_:<30} entrada US$ {entrada:.2f}/M tok | saída US$ {saida:.2f}/M tok | contexto {m['context_length']}")

# ---------- 2. Mesma pergunta em vários modelos via OpenRouter ----------
if not os.environ.get("OPENROUTER_API_KEY"):
    print("\n[parte 2 pulada] defina OPENROUTER_API_KEY para comparar modelos remotos (não executado localmente).")
else:
    openrouter = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"])
    alvos = os.environ.get(
        "OPENROUTER_MODELOS", "google/gemma-4-31b-it,deepseek/deepseek-v4.1-flash,anthropic/claude-haiku-5.5"
    ).split(",")
    for model in alvos:
        t0 = time.perf_counter()
        r = openrouter.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": pergunta}],
            max_tokens=60,
            temperature=0,
            # `models` é extensão do OpenRouter (fora da API da OpenAI): vai no corpo via extra_body.
            extra_body={"models": [model, "deepseek/deepseek-v4.1-flash"]},
        )
        ms = (time.perf_counter() - t0) * 1000
        print(f"\n[{r.model}] {r.choices[0].message.content.strip()} ({ms:.0f} ms, {r.usage.total_tokens} tok)")
