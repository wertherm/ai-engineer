"""Transcrição local com Whisper em Python (faster-whisper = Whisper no CTranslate2, int8 em CPU),
sem enviar áudio a ninguém. Versão Python de transcrever.js.

Diferente do JS, não precisamos converter o WAV à mão para 16 kHz Float32: o faster-whisper decodifica e
reamostra o arquivo com o PyAV (FFmpeg embutido na wheel — nada de ffmpeg no sistema).
O modelo (~145 MB, "Systran/faster-whisper-base") é baixado uma vez para .venv/cache-modelos/faster-whisper.
Uso: python transcrever.py [arquivo.wav]
"""

import os
import sys
import time
from functools import cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para importar comum_py
from faster_whisper import WhisperModel

from comum_py.config import CACHE


@cache
def _modelo(nome: str) -> WhisperModel:
    # int8: quantizado, ~4× menos memória que float32 e bem mais rápido em CPU.
    opcoes = {"device": "cpu", "compute_type": "int8", "download_root": str(CACHE / "faster-whisper")}
    try:
        # Já baixado? Carrega sem consultar o Hugging Face (mais rápido e funciona offline).
        return WhisperModel(nome, local_files_only=True, **opcoes)
    except Exception:
        return WhisperModel(nome, **opcoes)  # 1ª execução: baixa o modelo


def transcrever(caminho: str, modelo: str = os.environ.get("MODELO_WHISPER", "base")) -> str:
    segmentos, _info = _modelo(modelo).transcribe(caminho, language="pt", task="transcribe", beam_size=1)
    # `segmentos` é um GERADOR: a transcrição só acontece quando você itera.
    return " ".join(s.text.strip() for s in segmentos)


if __name__ == "__main__":
    arquivo = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parent.parent / "pergunta.wav")
    _modelo(os.environ.get("MODELO_WHISPER", "base"))  # carrega antes, para medir só a transcrição
    t = time.perf_counter()
    texto = transcrever(arquivo)
    print(f"transcrição ({time.perf_counter() - t:.1f} s): {texto}")
