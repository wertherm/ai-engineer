"""Exemplo 03 (Python) — detecção, tracking e filtro em vídeo com MediaPipe Tasks (Python) + OpenCV.

O JS roda o detector DENTRO do navegador (WASM). Aqui é o mesmo modelo (EfficientDet-Lite0, COCO),
o mesmo vídeo e o mesmo tracker por IoU, mas rodando localmente em Python: útil para processar vídeo
gravado em lote (servidor, notebook), onde não existe browser. Não há tempo real: TODOS os frames
são processados (no browser, frames chegam enquanto o detector trabalha e são descartados).
"""

import subprocess
import time
from pathlib import Path

import cv2
import httpx
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

ASSETS = Path(__file__).resolve().parents[1] / "assets"  # os mesmos assets do JS
URLS = {
    "efficientdet_lite0.tflite": "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
    "cats_and_dogs.jpg": "https://storage.googleapis.com/mediapipe-assets/cats_and_dogs.jpg",
}


def garantir_assets() -> None:
    """Baixa modelo + foto e gera o vídeo (igual ao baixar-assets.js), só se ainda não existirem."""
    ASSETS.mkdir(exist_ok=True)
    for nome, url in URLS.items():
        if not (ASSETS / nome).exists():
            (ASSETS / nome).write_bytes(httpx.get(url, follow_redirects=True).raise_for_status().content)
            print(f"baixado: {nome}")
    if not (ASSETS / "amostra.webm").exists():
        filtro = "scale=1280:-2,zoompan=z='1+0.004*on':x='iw/2-(iw/zoom/2)+on*2':y='ih/2-(ih/zoom/2)':d=40:s=640x320:fps=10"
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-loop", "1", "-i", str(ASSETS / "cats_and_dogs.jpg"), "-vf", filtro,
             "-frames:v", "40", "-c:v", "libvpx-vp9", "-b:v", "600k", str(ASSETS / "amostra.webm")],
            check=True,
        )
        print("gerado: amostra.webm (40 frames, 10 fps) via ffmpeg")


# ---- Tracking simples por IoU (mesma lógica do index.html) ----
def iou(a, b) -> float:
    x1, y1 = max(a.origin_x, b.origin_x), max(a.origin_y, b.origin_y)
    x2 = min(a.origin_x + a.width, b.origin_x + b.width)
    y2 = min(a.origin_y + a.height, b.origin_y + b.height)
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    return inter / (a.width * a.height + b.width * b.height - inter)


class Tracker:
    """Associa cada detecção à trilha anterior de mesma classe com maior IoU (> 0,3); senão, ID novo."""

    def __init__(self):
        self.proximo_id = 1
        self.trilhas: list[dict] = []

    def rastrear(self, deteccoes) -> list[dict]:
        livres = list(self.trilhas)
        novas = []
        for d in deteccoes:
            cat = d.categories[0]
            melhor, melhor_iou = None, 0.3
            for t in livres:
                v = iou(t["box"], d.bounding_box) if t["label"] == cat.category_name else 0
                if v > melhor_iou:
                    melhor, melhor_iou = t, v
            if melhor:
                livres.remove(melhor)
                id_ = melhor["id"]
            else:
                id_, self.proximo_id = self.proximo_id, self.proximo_id + 1
            novas.append({"id": id_, "label": cat.category_name, "score": cat.score, "box": d.bounding_box})
        self.trilhas = novas
        return novas


def desenhar(frame_bgr: np.ndarray, objs: list[dict]) -> np.ndarray:
    """Filtro: fundo em cinza escurecido, objetos detectados coloridos, caixa + rótulo."""
    cinza = cv2.cvtColor(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    saida = (cinza * 0.7).astype(np.uint8)
    for o in objs:
        b = o["box"]
        x, y, w, h = max(0, b.origin_x), max(0, b.origin_y), b.width, b.height  # caixa pode "vazar" do quadro
        saida[y : y + h, x : x + w] = frame_bgr[y : y + h, x : x + w]  # recorta a região original (colorida)
        cv2.rectangle(saida, (x, y), (x + w, y + h), (80, 185, 63), 2)
        cv2.putText(saida, f"#{o['id']} {o['label']} {o['score'] * 100:.0f}%", (x + 4, y + 16),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (80, 185, 63), 1)
    return saida


def main() -> None:
    garantir_assets()
    opcoes = vision.ObjectDetectorOptions(
        base_options=BaseOptions(model_asset_path=str(ASSETS / "efficientdet_lite0.tflite")),
        running_mode=vision.RunningMode.VIDEO,  # VIDEO: detect_for_video(frame, timestamp) — timestamps crescentes
        score_threshold=0.4,
        max_results=6,
    )
    tracker = Tracker()
    por_frame, ids, ultimo = [], {}, None
    cap = cv2.VideoCapture(str(ASSETS / "amostra.webm"))
    fps = cap.get(cv2.CAP_PROP_FPS) or 10
    with vision.ObjectDetector.create_from_options(opcoes) as detector:
        n = 0
        while True:
            ok, frame = cap.read()  # OpenCV entrega BGR; o MediaPipe espera RGB
            if not ok:
                break
            imagem = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            t0 = time.perf_counter()
            resultado = detector.detect_for_video(imagem, int(n * 1000 / fps) + 1)
            ms = (time.perf_counter() - t0) * 1000
            objs = tracker.rastrear(resultado.detections)
            ultimo = desenhar(frame, objs)
            rotulos = [f"#{o['id']} {o['label']}" for o in objs]
            por_frame.append({"ms": ms, "objs": rotulos})
            for r in rotulos:
                ids[r] = ids.get(r, 0) + 1
            n += 1
    cap.release()

    print(f"frames processados: {len(por_frame)} | inferência média: "
          f"{sum(f['ms'] for f in por_frame) / len(por_frame):.1f} ms/frame (TFLite, CPU)")
    print("primeiro frame:", ", ".join(por_frame[0]["objs"]))
    print("último frame:  ", ", ".join(por_frame[-1]["objs"]))
    print("trilhas (id rótulo -> em quantos frames apareceu):")
    for k, v in sorted(ids.items(), key=lambda kv: -kv[1]):
        print(f"  {k:<10} {v}")
    destino = ASSETS / "resultado_py.png"
    cv2.imwrite(str(destino), ultimo)
    print("imagem do último frame: exemplos/03-visao-no-browser/assets/resultado_py.png")


if __name__ == "__main__":
    main()
