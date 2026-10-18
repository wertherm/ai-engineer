"""PONTO DE PARTIDA do exercício 02 (Python): agente LINEAR (uma função atrás da outra).
Problema: se a API de frete cair, tudo explode; não há retry, fallback nem visibilidade dos passos."""

from comum_py.llm import chat, extrair_json


class FreteIndisponivel(ConnectionError):
    """504 da API de frete. Subclasse de ConnectionError: o RetryPolicy padrão do LangGraph reexecuta esse tipo."""


def api_frete(cep: str, *, falhar: bool = False) -> int:
    if falhar:
        raise FreteIndisponivel("504 Gateway Timeout (simulado)")
    return 25 if cep.startswith("0") else 40


def agente_linear(pedido: str, **opcoes) -> str:
    r = chat([{"role": "system", "content": 'Extraia do pedido. Devolva só JSON {"produto":"...","quantidade":n,"cep":"somente dígitos"}.'},
              {"role": "user", "content": pedido}], max_tokens=50)
    dados = extrair_json(r.msg.get("content"))
    frete = api_frete(dados["cep"], **opcoes)  # <- ponto único de falha
    return f"{dados['quantidade']}x {dados['produto']}, frete R$ {frete}"


if __name__ == "__main__":
    print(agente_linear("Quero 2 cadeiras entregues no CEP 01310-100"))
