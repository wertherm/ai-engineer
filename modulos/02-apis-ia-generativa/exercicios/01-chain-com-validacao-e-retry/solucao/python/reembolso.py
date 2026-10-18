"""Solução do exercício 01 em Python: chain de 2 elos para pedidos de reembolso.

  elo 1 (LLM): texto livre → JSON validado com pydantic, com até 3 tentativas e feedback do erro
  regra (código): decide aprovar/negar pelo limite da categoria — decisão NUNCA é do LLM
  elo 2 (LLM): redige a resposta ao colaborador a partir da decisão já tomada
O cliente OpenAI é injetado: o teste troca por um dublê (Mock) e verifica o retry sem rede.
"""

import re
from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from comum_py.config import MODELO_CHAT, PADRAO
from comum_py.estruturado import descrever_erros, response_format_de


class Reembolso(BaseModel):
    model_config = ConfigDict(extra="forbid")
    colaborador: str = Field(min_length=2)
    valor: float = Field(gt=0)
    categoria: Literal["alimentacao", "transporte", "hospedagem", "outros"]
    data: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="use AAAA-MM-DD")


LIMITES = {"alimentacao": 80, "transporte": 150, "hospedagem": 400, "outros": 50}

SYSTEM_EXTRAIR = (
    "Extraia o pedido de reembolso. Use só o que está no texto. valor em reais como número (ex.: 42.5). "
    "data em AAAA-MM-DD; se o ano não for citado, use 2026."
)


class NaoAterrado(ValueError):
    """O valor extraído não aparece no texto (o modelo inventou um número)."""


def numeros_do_texto(texto: str) -> list[float]:
    """Converte "R$ 1.234,56" / "62,40" / "62.4" do texto em número para a checagem de grounding."""
    nums = []
    for s in re.findall(r"\d+(?:[.,]\d+)*", texto, re.ASCII):
        nums.append(float(s.replace(".", "").replace(",", ".") if "," in s else s))
    return nums


def extrair(cliente, texto: str, *, tentativas: int = 3, log: Callable[[dict], None] = lambda _e: None) -> dict:
    messages = [{"role": "system", "content": SYSTEM_EXTRAIR}, {"role": "user", "content": texto}]
    erro = ""
    for i in range(1, tentativas + 1):
        r = cliente.chat.completions.create(
            **PADRAO,
            model=MODELO_CHAT,
            max_tokens=100,
            messages=messages,
            response_format=response_format_de(Reembolso, "reembolso"),
        )
        bruto = r.choices[0].message.content or ""
        try:
            dados = Reembolso.model_validate_json(bruto)  # JSON quebrado também vira ValidationError
            # Grounding: o valor precisa estar escrito no texto. Pega o clássico "inventou um número".
            if not any(abs(n - dados.valor) < 0.005 for n in numeros_do_texto(texto)):
                raise NaoAterrado(f"valor {dados.valor:g} não aparece no texto")
            log({"tentativa": i, "ok": True})
            return {"ok": True, "dados": dados, "tentativas": i}
        except (ValidationError, NaoAterrado) as e:
            erro = descrever_erros(e) if isinstance(e, ValidationError) else str(e)
            log({"tentativa": i, "ok": False, "erro": erro})
            messages = [
                *messages,
                {"role": "assistant", "content": bruto},
                {"role": "user", "content": f"Inválido: {erro}. Corrija e responda só o JSON."},
            ]
    # Esgotou: não chuta. Manda para um humano com o motivo.
    return {"ok": False, "status": "revisao_humana", "erro": erro, "tentativas": tentativas}


def decidir(d: Reembolso) -> dict:
    limite = LIMITES[d.categoria]
    if d.valor <= limite:
        return {"decisao": "aprovado", "motivo": f"dentro do limite de R$ {limite} para {d.categoria}"}
    return {"decisao": "negado", "motivo": f"acima do limite de R$ {limite} para {d.categoria}"}


def redigir(cliente, d: Reembolso, dec: dict) -> str:
    r = cliente.chat.completions.create(
        **PADRAO,
        model=MODELO_CHAT,
        max_tokens=70,
        messages=[
            {"role": "system", "content": "Escreva 1 frase cordial ao colaborador comunicando a decisão. Não mude a decisão."},
            {"role": "user", "content": f"Colaborador: {d.colaborador}. Valor: R$ {d.valor:g}. Decisão: {dec['decisao']} ({dec['motivo']})."},
        ],
    )
    return r.choices[0].message.content.strip()
