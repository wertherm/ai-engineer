"""Solução do exercício 02 em Python: extrator de recibos com roteamento por custo.

  1) OCR local (RapidOCR, grátis, ~1 s). Se a confiança >= LIMIAR, um LLM de TEXTO estrutura o resultado.
  2) Senão — ou se o JSON do caminho OCR não validar — cai para o LLM com VISÃO (mais caro).
Reaproveita o OCR do exemplo 05 (python/ocr.py), a chamada estruturada com retry do comum_py e os mesmos
PNGs gerados pelo JS (../recibo-nitido.png e ../recibo-ruim.png).
Uso: python extrator.py [recibo.png ...]
"""

import json
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[3]
sys.path.insert(0, str(RAIZ))  # raiz do módulo, para importar comum_py
sys.path.insert(0, str(RAIZ / "exemplos" / "05-documentos-ocr-e-visao" / "python"))  # ocr.py e extrair.py
from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from comum_py.config import criar_cliente
from comum_py.estruturado import chamar_estruturado
from extrair import imagem_data_uri
from ocr import ocr

# Limiar CALIBRADO para o RapidOCR, sobre a PIOR linha (não a média). O JS usa 70 sobre a confiança média
# do tesseract (0–100 por palavra); aqui cada linha tem score 0–1 e até o recibo ruim tem média 94.
# Medido nos dois recibos: nítido → pior linha 98; ruim → pior linha 92 (e "Carlos Angrade" na linha
# do pagador!). Trocou o motor de OCR? Recalibre o limiar com amostras rotuladas.
LIMIAR_CONFIANCA = 95
GABARITO = {"pagador": "Carlos Andrade", "valor": 1850.0, "referencia": "2026-09", "recebedor": "Imobiliaria Modelo"}


class Recibo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pagador: str = Field(min_length=3)
    recebedor: str = Field(min_length=3)
    valor: float = Field(gt=0)
    referencia: str = Field(pattern=r"^\d{4}-\d{2}$", description="use AAAA-MM (mês de referência)")


INSTRUCAO = (
    "Extraia os dados do recibo de aluguel. valor como número com ponto decimal (1.850,00 → 1850). "
    "referencia é o mês do aluguel em AAAA-MM. Copie os nomes como aparecem."
)


def por_ocr(cliente: OpenAI, caminho: str, log) -> dict:
    lido = ocr(caminho)
    log({"passo": "ocr", "confianca": lido["confianca"], "pior_linha": lido["confianca_min"]})
    if lido["confianca_min"] < LIMIAR_CONFIANCA:
        return {"motivo": f"pior linha do OCR {lido['confianca_min']} < {LIMIAR_CONFIANCA}"}
    try:
        r = chamar_estruturado(
            cliente, nome="recibo_ocr", modelo=Recibo, max_tokens=120, log=log,
            messages=[{"role": "system", "content": INSTRUCAO}, {"role": "user", "content": lido["texto"]}],
        )
        return {"dados": r["dados"]}
    except RuntimeError as e:
        return {"motivo": f"validação falhou no caminho OCR: {e}"}


def por_visao(cliente: OpenAI, caminho: str, log) -> dict:
    r = chamar_estruturado(
        cliente, nome="recibo_visao", modelo=Recibo, max_tokens=120, log=log,
        messages=[
            {"role": "system", "content": INSTRUCAO},
            {"role": "user", "content": [
                {"type": "text", "text": "Extraia os dados deste recibo."},
                {"type": "image_url", "image_url": {"url": imagem_data_uri(caminho)}},
            ]},
        ],
    )
    return {"dados": r["dados"]}


def extrair_recibo(cliente: OpenAI, caminho: str, log=lambda _e: None) -> dict:
    r = por_ocr(cliente, caminho, log)
    if "dados" in r:
        return {"via": "ocr", "dados": r["dados"]}
    log({"passo": "fallback", "motivo": r["motivo"]})
    return {"via": "visao", **por_visao(cliente, caminho, log)}


if __name__ == "__main__":
    cliente = criar_cliente()
    for nome in sys.argv[1:] or ["recibo-nitido.png", "recibo-ruim.png"]:
        print(f"\n[{nome}]")
        t = time.perf_counter()
        r = extrair_recibo(cliente, str(AQUI.parent / nome), lambda e: print("  ·", json.dumps(e, ensure_ascii=False), flush=True))
        dados = r["dados"].model_dump()
        certos = [k for k in GABARITO if str(dados[k]).lower() == str(GABARITO[k]).lower()]
        print(f"  via={r['via']} · {time.perf_counter() - t:.1f} s · {len(certos)}/4 campos certos")
        print("  ", json.dumps(dados, ensure_ascii=False), flush=True)
