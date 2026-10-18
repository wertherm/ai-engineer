"""Adaptador do LLM (versão Python de llm.js): a API não conhece o SDK, só a interface `resumir(texto)`.

É isso que permite trocar o provedor e, nos testes, trocar o LLM por um dublê via dependency override.
"""

from openai import OpenAI

from comum_py.config import MODELO_CHAT, PADRAO, criar_cliente


class LlmResumidor:
    def __init__(self, cliente: OpenAI | None = None) -> None:
        self.cliente = cliente or criar_cliente()
        self.modelo = MODELO_CHAT

    def resumir(self, texto: str) -> dict:
        r = self.cliente.chat.completions.create(
            **PADRAO,
            model=MODELO_CHAT,
            max_tokens=60,
            messages=[
                {"role": "system", "content": "Resuma o texto do usuário em UMA frase curta, em português."},
                {"role": "user", "content": texto},
            ],
        )
        return {"resumo": r.choices[0].message.content.strip(), "tokens": r.usage.total_tokens if r.usage else 0}
