"""Solução do exercício 01: classificador de sentimento com prompt de sistema + few-shot.

Técnicas que fazem um modelo pequeno acertar mais:
- prompt de sistema curto e com as saídas permitidas listadas;
- exemplos (few-shot) no formato exato da resposta esperada;
- temperature=0 e max_tokens baixo (só cabe o rótulo);
- normalização da saída, com um rótulo de fallback quando o modelo foge do formato.
"""
import os

from openai import OpenAI

client = OpenAI(base_url=os.getenv("VLLM_URL", "http://localhost:8000") + "/v1", api_key="local")
ROTULOS = ("positivo", "negativo", "neutro")

# Iterações medidas nos 6 casos do test_classificar.py (Qwen2.5-0.5B, temperature=0, 2026-10-13):
#   v1 zero-shot com a lista de rótulos ............................ 4/6 (erra os neutros)
#   v2 + definição de cada rótulo + 1 exemplo de cada ............... 4/6 (ainda puxa fatos para "positivo")
#   v3 + "na dúvida, neutro" + 3 exemplos neutros no FIM do few-shot  5/6 (versão abaixo)
# Tentativa descartada: perguntar antes "tem opinião? sim/não" -> o modelo respondeu "sim" para tudo.
SISTEMA = (
    "Classifique o sentimento da frase. "
    "positivo = elogio ou satisfação; negativo = reclamação ou insatisfação; "
    "neutro = informa um fato (horário, data, quantidade) sem opinião. Na dúvida, responda neutro. "
    "Responda com UMA palavra: positivo, negativo ou neutro."
)
EXEMPLOS = [  # few-shot: o modelo imita o formato; os neutros ficam por último (modelos pequenos pesam mais o fim)
    ("Adorei o atendimento, resolveram tudo rápido!", "positivo"),
    ("O produto chegou quebrado e ninguém responde.", "negativo"),
    ("O pedido foi entregue na terça-feira.", "neutro"),
    ("A fatura tem vencimento no dia 5.", "neutro"),
    ("O escritório fica no terceiro andar.", "neutro"),
]


def classificar(frase: str) -> str:
    mensagens = [{"role": "system", "content": SISTEMA}]
    for exemplo, rotulo in EXEMPLOS:
        mensagens += [{"role": "user", "content": exemplo}, {"role": "assistant", "content": rotulo}]
    mensagens.append({"role": "user", "content": frase})

    r = client.chat.completions.create(model="qwen-mini", messages=mensagens, temperature=0, max_tokens=3)
    saida = r.choices[0].message.content.strip().lower()
    # o modelo às vezes devolve "Positivo." ou "positivo!": procuramos o rótulo dentro da saída
    return next((rotulo for rotulo in ROTULOS if rotulo in saida), "neutro")


if __name__ == "__main__":
    for frase in ["Que serviço excelente!", "Péssimo, nunca mais compro.", "A loja abre às 9h."]:
        print(f"{classificar(frase):>8}  <- {frase}")
