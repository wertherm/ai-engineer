"""Chamada com saída estruturada (JSON Schema) + validação com pydantic + nova tentativa com feedback.

Espelha comum/estruturado.js. Por que validar se o servidor já força o schema? Porque nem todo
provedor/modelo garante o schema (o Ollama faz "best effort" via gramática) e porque o pydantic checa
regras que o JSON Schema não expressa bem (validadores, "pedido precisa existir no texto").

Por que não `client.chat.completions.parse(response_format=Modelo)`? Ele faz o mesmo envio de schema e
valida com pydantic, mas, se a validação falha, levanta a exceção e você perde o texto bruto — e é o texto
bruto que precisamos devolver ao modelo como feedback na 2ª tentativa. Aqui o schema vai pelo `create` e a
validação é nossa.
"""

import json
import time
from collections.abc import Callable

from openai import OpenAI
from pydantic import BaseModel, ValidationError

from comum_py.config import MODELO_CHAT, PADRAO


def response_format_de(modelo: type[BaseModel], nome: str) -> dict:
    """JSON Schema do modelo pydantic no formato `response_format` da API de chat."""
    return {
        "type": "json_schema",
        "json_schema": {"name": nome, "schema": modelo.model_json_schema(), "strict": True},
    }


def descrever_erros(erro: ValidationError) -> str:
    """Erros do pydantic em uma linha, COM o valor recebido: sem isso, depurar é adivinhação."""
    return "; ".join(
        f"{'.'.join(map(str, e['loc'])) or '(raiz)'}: {e['msg']} (recebido: {json.dumps(e.get('input'), ensure_ascii=False)})"
        for e in erro.errors()
    )


def chamar_estruturado(
    cliente: OpenAI,
    *,
    messages: list[dict],
    modelo: type[BaseModel],
    nome: str,
    max_tokens: int = 150,
    tentativas: int = 2,
    log: Callable[[dict], None] = lambda _e: None,
) -> dict:
    """Devolve {"dados": instância do modelo, "usage", "tentativas"} ou levanta RuntimeError."""
    historico = list(messages)
    ultimo_erro = ""
    for tentativa in range(1, tentativas + 1):
        inicio = time.perf_counter()
        resp = cliente.chat.completions.create(
            **PADRAO,
            model=MODELO_CHAT,
            max_tokens=max_tokens,
            messages=historico,
            response_format=response_format_de(modelo, nome),
        )
        texto = resp.choices[0].message.content or ""
        base = {
            "etapa": nome,
            "tentativa": tentativa,
            "ms": round((time.perf_counter() - inicio) * 1000),
            "tokens": resp.usage.total_tokens if resp.usage else None,
        }
        try:
            dados = modelo.model_validate_json(texto)
            log(base)
            return {"dados": dados, "usage": resp.usage, "tentativas": tentativa}
        except ValidationError as e:
            # JSON quebrado também chega aqui (erro do tipo json_invalid), com o texto recebido.
            ultimo_erro = descrever_erros(e)
        log({**base, "erro": ultimo_erro})
        # Devolve o erro ao modelo: ele costuma corrigir na 2ª tentativa sem precisar de prompt novo.
        historico += [
            {"role": "assistant", "content": texto},
            {"role": "user", "content": f"Sua resposta não passou na validação ({ultimo_erro}). Corrija e responda só o JSON."},
        ]
    raise RuntimeError(f"Saída estruturada inválida após {tentativas} tentativas: {ultimo_erro}")
