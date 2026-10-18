"""Custo e cache com números reais (versão Python): (A) tokens de um prompt prolixo vs enxuto — contados
localmente com tiktoken e conferidos com o `usage` —, (B) reuso de contexto (cache de prefixo do servidor,
`cached_tokens`) e (C) cache de respostas no Postgres.
"""

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para importar comum_py
from comum_py.config import CACHE, MODELO_CHAT, PADRAO, criar_cliente

# O tiktoken baixa o arquivo do encoding na 1ª vez; guardamos em .venv/cache-modelos/ (precisa vir ANTES do import).
os.environ.setdefault("TIKTOKEN_CACHE_DIR", str(CACHE / "tiktoken"))
import tiktoken  # noqa: E402

from cache_respostas import abrir_cache, chave_de, com_cache  # noqa: E402

cliente = criar_cliente()

# Preços ILUSTRATIVOS em US$ por 1 milhão de tokens (os mesmos do JS). O modelo local custa US$ 0 por token.
PRECO = {"entrada": 0.4, "entrada_em_cache": 0.1, "saida": 1.6}


def em_cache(u) -> int:
    return (u.prompt_tokens_details.cached_tokens or 0) if u.prompt_tokens_details else 0


def custo(u) -> float:
    c = em_cache(u)
    return ((u.prompt_tokens - c) * PRECO["entrada"] + c * PRECO["entrada_em_cache"] + u.completion_tokens * PRECO["saida"]) / 1e6


def fmt(u) -> str:
    return f"entrada={u.prompt_tokens} (cache={em_cache(u)}) saida={u.completion_tokens} custo=US$ {custo(u):.6f}"


def chamar(messages: list[dict], max_tokens: int) -> dict:
    inicio = time.perf_counter()
    r = cliente.chat.completions.create(**PADRAO, model=MODELO_CHAT, max_tokens=max_tokens, messages=messages)
    return {"texto": (r.choices[0].message.content or "").strip(), "usage": r.usage, "ms": round((time.perf_counter() - inicio) * 1000)}


# --- A) Redução de tokens: mesma tarefa, dois prompts. -------------------------------------------
# tiktoken conta ANTES de chamar (orçamento, corte de contexto). O encoding o200k_base é o dos modelos
# atuais da OpenAI; o qwen tem outro tokenizador, então a contagem local é uma ESTIMATIVA e o `usage`
# devolvido pelo servidor é a verdade que entra na fatura.
enc = tiktoken.get_encoding("o200k_base")
print("A) Prompt prolixo vs enxuto (tiktoken local vs usage real com max_tokens=1)")
prolixo = (
    "Olá! Espero que você esteja bem. Eu gostaria muito, se possível, que você pudesse por gentileza me ajudar "
    "com uma tarefa bem simples que eu tenho aqui. Preciso que você leia com bastante atenção a frase que vou "
    "colocar logo abaixo e, depois de pensar com calma, me diga se o sentimento dela é positivo, negativo ou neutro. "
    "Muito obrigado desde já pela ajuda!\nFrase: 'O produto chegou quebrado.'"
)
enxuto = "Sentimento (positivo/negativo/neutro) de: 'O produto chegou quebrado.'"
for nome, p in [("prolixo", prolixo), ("enxuto", enxuto)]:
    r = chamar([{"role": "user", "content": p}], 1)
    print(f"   {nome:<8} tiktoken={len(enc.encode(p)):>3} · {fmt(r['usage'])}")

# --- B) Reuso de contexto: prefixo fixo primeiro, parte variável no fim. --------------------------
print("\nB) Reuso de contexto (mesmo system prompt, perguntas diferentes)")
politicas = "\n".join(
    f"Política {i + 1}: trocas em até {7 + i} dias para a categoria {i + 1}, com nota fiscal." for i in range(30)
)
system = f"Você é o suporte da Loja Exemplo. Responda com no máximo 10 palavras.\n{politicas}"
for pergunta in ["Prazo de troca da categoria 3?", "Prazo de troca da categoria 9?"]:
    r = chamar([{"role": "system", "content": system}, {"role": "user", "content": pergunta}], 15)
    print(f"   {pergunta} → {r['ms']} ms · {fmt(r['usage'])}")

# --- C) Cache de respostas no Postgres. -----------------------------------------------------------
print("\nC) Cache de respostas (Postgres, m02.cache_respostas_py)")
db = abrir_cache()
requisicao = {
    **PADRAO,
    "model": MODELO_CHAT,
    "max_tokens": 20,
    "messages": [{"role": "user", "content": "Capital do Brasil? Responda só o nome."}],
}
# Limpa a chave desta demo para a 1ª chamada sempre ser um "miss".
db.execute("DELETE FROM m02.cache_respostas_py WHERE chave = %s", (chave_de(requisicao),))


def chamar_llm(req: dict) -> dict:
    r = cliente.chat.completions.create(**req)
    return {"texto": r.choices[0].message.content.strip(), "usage": r.usage.model_dump()}


for i in (1, 2):
    inicio = time.perf_counter()
    resposta, hit = com_cache(db, requisicao, chamar_llm)
    tokens = 0 if hit else resposta["usage"]["total_tokens"]
    ms = round((time.perf_counter() - inicio) * 1000)
    print(f'   chamada {i}: {"HIT " if hit else "MISS"} {ms} ms · tokens cobrados={tokens} · "{resposta["texto"]}"')
db.close()
