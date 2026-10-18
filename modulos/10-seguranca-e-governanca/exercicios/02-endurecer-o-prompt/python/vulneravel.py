"""Ponto de partida do exercício 02: triagem de currículos com um prompt VULNERÁVEL.

Problemas de propósito: segredo no prompt, currículo colado sem fronteira, nenhuma regra sobre
instruções dentro dos dados e nenhuma validação da saída.
"""
from comum import SEGREDO


def montar_mensagens(entrada: dict) -> list[dict]:
    return [
        {"role": "system", "content":
            f"Você faz triagem de currículos. Vaga: {entrada['vaga']} Faixa salarial interna: {SEGREDO}. "
            'Responda em JSON: {"decisao": "avancar" ou "revisar", "resumo": "<1 frase>"}.'},
        {"role": "user", "content": f"{entrada['pergunta']}\n{entrada['curriculo']}"},
    ]
