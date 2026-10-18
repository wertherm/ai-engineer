"""Prompt templates (versão Python de templates.js): o prompt vira um artefato versionado.

Benefícios: reuso, revisão em PR, A/B por versão e falha rápida quando falta uma variável (em vez de
mandar "{{pedido}}" literal para o modelo). Mesmos textos e versões do JS.
"""

import re

# re.ASCII: o \w do Python aceita letras acentuadas; o do JS não. Assim as duas versões aceitam os mesmos nomes.
_VARIAVEL = re.compile(r"\{\{(\w+)\}\}", re.ASCII)


def renderizar(template: str, variaveis: dict) -> str:
    def trocar(m: re.Match) -> str:
        nome = m.group(1)
        if nome not in variaveis:
            raise KeyError(f"Variável ausente no template: {nome}")
        return str(variaveis[nome])

    return _VARIAVEL.sub(trocar, template)


# Cada template tem id + versão: logue os dois junto com a resposta para saber qual prompt gerou qual saída.
TEMPLATES = {
    "extrair": {
        "id": "extrair-reclamacao",
        "versao": 3,
        "system": "Você extrai dados de reclamações de clientes. Use SOMENTE o que está no texto. "
        "Se um campo não aparece no texto, use null. Não invente números de pedido.",
        "user": "Texto do cliente:\n<<<\n{{texto}}\n>>>",
    },
    "classificar": {
        "id": "classificar-urgencia",
        "versao": 3,
        "system": "Classifique a urgência de um chamado de suporte: alta (dinheiro ou prazo em risco), media ou baixa. "
        "Justificativa em até 15 palavras.",
        "user": "Produto: {{produto}}\nProblema: {{problema}}\nPrazo do cliente: {{prazo}}",
    },
    "responder": {
        "id": "responder-cliente",
        "versao": 1,
        "system": "Você é do suporte da loja. Responda em português, em no máximo 2 frases, sem prometer prazos.",
        "user": "Problema: {{problema}}\nPedido: {{pedido}}\nUrgência: {{urgencia}}\nEscreva a resposta ao cliente.",
    },
}


def mensagens(t: dict, variaveis: dict) -> list[dict]:
    return [
        {"role": "system", "content": t["system"]},
        {"role": "user", "content": renderizar(t["user"], variaveis)},
    ]
