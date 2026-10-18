"""Ferramentas compartilhadas pelas três estratégias. Cada uma devolve {"valor": número} para que o
plano (Plan-and-Execute) possa referenciar resultados anteriores (#E1, #E2...)."""

from comum_py.llm import calcular_seguro

ESTOQUE = {"teclado": 40, "mouse": 7, "monitor": 3}
PRECO = {"teclado": 120, "mouse": 50, "monitor": 900}

PRODUTO_PARAM = {
    "type": "object",
    "properties": {"produto": {"type": "string", "enum": list(ESTOQUE)}},
    "required": ["produto"],
    "additionalProperties": False,
}

FERRAMENTAS = {
    "consultar_estoque": {"description": "Quantidade em estoque de um produto.", "parameters": PRODUTO_PARAM,
                          "handler": lambda produto: {"valor": ESTOQUE[produto]}},
    "consultar_preco": {"description": "Preço unitário de compra (R$) de um produto.", "parameters": PRODUTO_PARAM,
                        "handler": lambda produto: {"valor": PRECO[produto]}},
    "calcular": {
        "description": 'Avalia uma expressão aritmética, ex.: "(10-7)*50".',
        "parameters": {"type": "object", "properties": {"expressao": {"type": "string"}},
                       "required": ["expressao"], "additionalProperties": False},
        "handler": lambda expressao: {"valor": calcular_seguro(expressao)},
    },
}

SCHEMAS_OPENAI = [{"type": "function", "function": {"name": n, "description": f["description"], "parameters": f["parameters"]}}
                  for n, f in FERRAMENTAS.items()]


def executar_ferramenta(nome: str, args: dict) -> dict:
    f = FERRAMENTAS.get(nome)
    if f is None:
        return {"erro": f"ferramenta inexistente: {nome}"}
    try:
        return f["handler"](**args)
    except Exception as e:  # KeyError de produto, TypeError de argumento, ValueError da expressão
        return {"erro": str(e)}


TAREFA = "Quanto custa (R$) comprar só o que falta para mouse e monitor chegarem a 10 unidades em estoque cada?"
RESPOSTA_CERTA = (10 - 7) * 50 + (10 - 3) * 900  # 6450


def acertou(resposta) -> bool:
    import re
    return str(RESPOSTA_CERTA) in re.sub(r"[.\s]", "", str(resposta or ""))
