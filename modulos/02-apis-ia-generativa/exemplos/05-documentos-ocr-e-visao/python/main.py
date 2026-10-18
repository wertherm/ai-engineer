"""OCR inteligente (versão Python): extrai os campos de uma nota fiscal fictícia por OCR+LLM e por visão,
valida com pydantic e mede contra o gabarito. Uso: python main.py [ocr|visao|ambos]
Reaproveita os PNGs gerados pelo JS (../nota-fiscal.png e ../nota-fiscal-pequena.png).
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para importar comum_py
from comum_py.config import criar_cliente
from extrair import comparar, via_ocr, via_visao
from gabarito import GABARITO

modo = sys.argv[1] if len(sys.argv) > 1 else "ambos"
pasta = Path(__file__).resolve().parent.parent
cliente = criar_cliente()


def log(e: dict) -> None:
    print("  ·", json.dumps(e, ensure_ascii=False), flush=True)


def relatorio(nome: str, dados, s: float) -> None:
    r = comparar(dados, GABARITO)
    print(f"  {nome}: {s:.1f} s · {sum(r.values())}/{len(r)} checagens ok")
    print("  ", json.dumps(r))
    print("  ", dados.model_dump_json())


if modo != "visao":
    print("[OCR + LLM] nota-fiscal.png (800px)")
    t = time.perf_counter()
    lido = via_ocr(cliente, str(pasta / "nota-fiscal.png"), log)
    print(f"  confiança do OCR: média {lido['confianca']}% · pior linha {lido['confianca_min']}% · {len(lido['texto'])} caracteres")
    relatorio("ocr+llm", lido["dados"], time.perf_counter() - t)
if modo != "ocr":
    print("[Visão] nota-fiscal-pequena.png (480px)")
    t = time.perf_counter()
    relatorio("visao", via_visao(cliente, str(pasta / "nota-fiscal-pequena.png"), log)["dados"], time.perf_counter() - t)
