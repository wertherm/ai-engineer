"""OCR local em Python SEM binário de sistema: RapidOCR (modelos PaddleOCR em ONNX, roda no onnxruntime).

Por que não pytesseract? Ele é só um wrapper do executável `tesseract`, que não está instalado (e não há
sudo). O RapidOCR é 100% pip (wheels para Python 3.14), baixa ~16 MB de modelos ONNX para `.venv/cache-modelos/rapidocr`
na 1ª execução e lê português com o reconhecedor "latin" do PP-OCRv5.

A confiança NÃO é comparável à do tesseract: aqui cada LINHA tem um score de 0 a 1 (média ~0,99 em
documento nítido). Devolvemos a média e a pior linha em escala 0–100; qualquer limiar precisa ser
recalibrado ao trocar de motor de OCR.
"""

import math
from functools import cache

from rapidocr import LangRec, ModelType, OCRVersion, RapidOCR

from comum_py.config import CACHE


@cache
def _motor() -> RapidOCR:
    return RapidOCR(params={
        "Global.model_root_dir": str(CACHE / "rapidocr"),
        "Global.log_level": "warning",
        "Rec.lang_type": LangRec.LATIN,  # alfabeto latino com acentos (o padrão "ch" erra o português)
        "Rec.ocr_version": OCRVersion.PPOCRV5,
        "Rec.model_type": ModelType.MOBILE,
    })


def ocr(caminho: str) -> dict:
    r = _motor()(caminho)
    scores = list(r.scores or [0.0])
    return {
        "texto": "\n".join(r.txts or []),
        # floor(x + 0,5) = Math.round do JS (o round() do Python arredonda o empate para o par).
        "confianca": math.floor(100 * sum(scores) / len(scores) + 0.5),
        "confianca_min": math.floor(100 * min(scores) + 0.5),
    }
