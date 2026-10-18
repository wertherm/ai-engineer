"""Projeto final: agente de atendimento com o modelo customizado num fluxo real — porta de `../agente.js`.
  1. triagem com o LoRA (barato, rápido, local, formato garantido pelo treino)
  2. guardrail: se a saída não for uma categoria válida, cai para "humano" (nunca inventa rota)
  3. resposta ao cliente com o LLM genérico (qwen3.5:4b) usando instruções da categoria
  4. registro de cada atendimento no Postgres (m09.atendimentos_py: sufixo _py para não misturar com o JS)
Pré-requisitos: ../../04-avaliacao-ab/servidor_openai.py no ar, Ollama e Postgres da infra.
Uso (da pasta do módulo): uv run python exemplos/05-projeto-final-triagem/python/agente.py [--sem-resposta]
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from comum_py.config import (  # noqa: E402
    CATEGORIAS, DATABASE_URL, EXTRAS_OLLAMA, LORA_BASE_URL, MODELO_CHAT, SCHEMA, SYSTEM_PROMPT, criar_cliente,
)
from comum_py.numeros import js_round  # noqa: E402

sem_resposta = "--sem-resposta" in sys.argv
lora = criar_cliente(base_url=LORA_BASE_URL, api_key="local")
llm = criar_cliente()
TABELA = f"{SCHEMA}.atendimentos_py"

# Tickets NOVOS (sintéticos, nunca vistos no treino) — os mesmos do JS, para comparar.
tickets = [
    "Oi! Fiz o pagamento por pix ontem e o site ainda diz que estou devendo.",
    "O liquidificador que comprei veio com a jarra rachada.",
]

# O fine-tuning cuidou da TRIAGEM; o tom e a política ficam no prompt (fácil de mudar).
politica = {
    "cobranca": "Peça o comprovante e informe prazo de 2 dias úteis para conferência.",
    "acesso": 'Oriente a redefinir a senha pelo link "Esqueci minha senha" e a checar o spam.',
    "entrega": "Peça o número do pedido e informe que o rastreio será verificado com a transportadora.",
    "defeito": "Ofereça troca ou reembolso e peça uma foto do produto.",
    "cancelamento": "Confirme o pedido a cancelar e informe o prazo de estorno de até 7 dias.",
}


def triar(texto: str) -> str:
    r = lora.chat.completions.create(
        model="smollm2-suporte-lora", max_tokens=8, temperature=0,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": texto}],
    )
    cat = (r.choices[0].message.content or "").strip().lower()
    return cat if cat in CATEGORIAS else "humano"  # guardrail


def responder(texto: str, categoria: str) -> str | None:
    if sem_resposta or categoria == "humano":
        return None
    # No SDK Python, parâmetros fora da assinatura (reasoning_effort no Ollama) vão em extra_body.
    r = llm.chat.completions.create(
        model=MODELO_CHAT, max_tokens=80, temperature=0, extra_body=EXTRAS_OLLAMA,
        messages=[
            {"role": "system", "content": f"Você é o atendente da Loja Exemplo. Responda em 2 frases, em português, cordial. {politica[categoria]}"},
            {"role": "user", "content": texto},
        ],
    )
    return (r.choices[0].message.content or "").strip()


# autocommit=True: cada INSERT fica visível na hora (psycopg 3 abre transação implícita por padrão).
with psycopg.connect(DATABASE_URL, autocommit=True) as db:
    db.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    db.execute(f"""CREATE TABLE IF NOT EXISTS {TABELA} (
      id serial PRIMARY KEY, criado_em timestamptz DEFAULT now(), ticket text NOT NULL,
      categoria text NOT NULL, modelo_triagem text NOT NULL, resposta text, ms_triagem int, ms_resposta int)""")

    for texto in tickets:
        t0 = time.monotonic()
        categoria = triar(texto)
        ms_triagem = js_round((time.monotonic() - t0) * 1000)
        t0 = time.monotonic()
        resposta = responder(texto, categoria)
        ms_resposta = js_round((time.monotonic() - t0) * 1000) if resposta else None
        db.execute(
            f"INSERT INTO {TABELA} (ticket, categoria, modelo_triagem, resposta, ms_triagem, ms_resposta) VALUES (%s,%s,%s,%s,%s,%s)",
            (texto, categoria, "smollm2-suporte-lora", resposta, ms_triagem, ms_resposta),
        )
        print(f"\nticket: {texto}\n  triagem (LoRA): {categoria} em {ms_triagem} ms")
        print(f"  resposta ({MODELO_CHAT}, {js_round(ms_resposta / 1000)} s): {resposta}" if resposta else "  resposta: (pulada)")

    rows = db.execute(f"SELECT categoria, count(*)::int AS n FROM {TABELA} GROUP BY 1 ORDER BY 1").fetchall()
    print(f"\natendimentos registrados em {TABELA}:", [{"categoria": c, "n": n} for c, n in rows])
