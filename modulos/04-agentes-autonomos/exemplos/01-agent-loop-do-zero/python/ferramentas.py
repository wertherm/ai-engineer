"""Toolbox: cada ferramenta = schema JSON (o que o modelo vê) + handler (o que o código executa).

O modelo NUNCA executa nada: ele só devolve um pedido {name, arguments} e o nosso código decide.
"""

from comum_py.llm import calcular_seguro

ESTOQUE = {"teclado": 40, "mouse": 7, "monitor": 3}

FERRAMENTAS = {
    "consultar_estoque": {
        "schema": {
            "type": "function",
            "function": {
                "name": "consultar_estoque",
                "description": "Retorna a quantidade em estoque de um produto.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "produto": {"type": "string", "enum": list(ESTOQUE), "description": "Nome do produto, no singular"},
                    },
                    "required": ["produto"],
                    "additionalProperties": False,
                },
            },
        },
        "handler": lambda produto: {"produto": produto, "quantidade": ESTOQUE.get(produto)},
    },
    "calcular": {
        "schema": {
            "type": "function",
            "function": {
                "name": "calcular",
                "description": 'Avalia uma expressão aritmética (ex.: "40 - 3*12").',
                "parameters": {
                    "type": "object",
                    "properties": {"expressao": {"type": "string"}},
                    "required": ["expressao"],
                    "additionalProperties": False,
                },
            },
        },
        "handler": lambda expressao: {"expressao": expressao, "resultado": calcular_seguro(expressao)},
    },
}


def validar_args(schema: dict, args: dict) -> str | None:
    """Validação mínima contra o schema: campos obrigatórios, tipos simples e enum."""
    params = schema["function"]["parameters"]
    props, required = params.get("properties", {}), params.get("required", [])
    for campo in required:
        if campo not in args:
            return f"campo obrigatório ausente: {campo}"
    for campo, valor in args.items():
        regra = props.get(campo)
        if regra is None:
            return f"campo desconhecido: {campo}"
        if regra.get("type") == "string" and not isinstance(valor, str):
            return f"{campo} deve ser string"
        if "enum" in regra and valor not in regra["enum"]:
            return f"{campo} deve ser um de: {', '.join(regra['enum'])}"
    return None
