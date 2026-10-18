"""Dois caminhos para "ler" um documento (versão Python de extrair.js):
  OCR (RapidOCR) → texto → LLM de texto estrutura em JSON    (barato, rápido, local)
  Visão (LLM multimodal) → imagem em base64 → JSON direto     (entende layout, mais caro)
"""

import base64
from typing import Annotated

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from comum_py.estruturado import chamar_estruturado
from ocr import ocr

# Dinheiro como TEXTO copiado do documento ("25,90"), convertido depois pelo código: o LLM é bom em
# COPIAR, ruim em converter número. Aceita o "R$ " opcional (o modelo de visão costuma copiar o símbolo).
Dinheiro = Annotated[str, Field(pattern=r"^(R\$\s?)?\d{1,3}(\.\d{3})*,\d{2}$", description="copie o valor como no documento, ex.: 1.234,56")]


def para_numero(brl: str) -> float:
    return float(brl.replace("R$", "").strip().replace(".", "").replace(",", "."))


class Item(BaseModel):
    model_config = ConfigDict(extra="forbid")
    descricao: str
    quantidade: int
    valor_unitario: Dinheiro


class NotaFiscal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    emitente: str
    cnpj: str
    numero: str
    data_emissao: str = Field(description="formato AAAA-MM-DD")
    itens: list[Item]
    total: Dinheiro


INSTRUCAO = (
    "Extraia os campos da nota fiscal. Copie textos e valores exatamente como aparecem (ex.: 25,90). "
    "Data em AAAA-MM-DD. Não invente campos ausentes."
)


def via_ocr(cliente: OpenAI, caminho: str, log) -> dict:
    lido = ocr(caminho)
    r = chamar_estruturado(
        cliente, nome="nota_ocr", modelo=NotaFiscal, max_tokens=300, log=log,
        messages=[
            {"role": "system", "content": INSTRUCAO},
            {"role": "user", "content": f"Texto extraído por OCR:\n{lido['texto']}"},
        ],
    )
    return {"dados": r["dados"], **lido}


def imagem_data_uri(caminho: str) -> str:
    # O Ollama só aceita imagem como data URI base64 (não aceita URL http).
    return "data:image/png;base64," + base64.b64encode(open(caminho, "rb").read()).decode()


def via_visao(cliente: OpenAI, caminho: str, log) -> dict:
    r = chamar_estruturado(
        cliente, nome="nota_visao", modelo=NotaFiscal, max_tokens=300, log=log,
        messages=[
            {"role": "system", "content": INSTRUCAO},
            {"role": "user", "content": [
                {"type": "text", "text": "Extraia os campos desta nota fiscal."},
                {"type": "image_url", "image_url": {"url": imagem_data_uri(caminho)}},
            ]},
        ],
    )
    return {"dados": r["dados"]}


def comparar(d: NotaFiscal, gabarito: dict) -> dict:
    """Compara com o gabarito campo a campo: "acurácia" de extração é métrica, não impressão."""
    def norm(s) -> str:
        return str(s).strip().lower()

    total = para_numero(d.total)
    r = {c: norm(getattr(d, c)) == norm(gabarito[c]) for c in ("emitente", "cnpj", "numero", "data_emissao")}
    r["total"] = abs(total - gabarito["total"]) < 0.005
    r["itens"] = len(d.itens) == len(gabarito["itens"]) and all(
        i.quantidade == g["quantidade"] and abs(para_numero(i.valor_unitario) - g["valor_unitario"]) < 0.005
        for i, g in zip(d.itens, gabarito["itens"])
    )
    # Consistência interna (soma dos itens = total): pega alucinação numérica mesmo SEM gabarito.
    r["soma_confere"] = abs(sum(i.quantidade * para_numero(i.valor_unitario) for i in d.itens) - total) < 0.01
    return r
