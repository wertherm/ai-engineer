// Baixa o modelo de detecção (EfficientDet-Lite0, treinado no COCO) e uma foto de amostra
// das fontes oficiais do MediaPipe, e gera um vídeo curto a partir da foto com ffmpeg.
// O vídeo substitui a câmera: em headless não há webcam, e um arquivo deixa o teste reprodutível.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = join(dirname(fileURLToPath(import.meta.url)), 'assets');
await mkdir(pasta, { recursive: true });

const arquivos = {
  'efficientdet_lite0.tflite':
    'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
  'cats_and_dogs.jpg': 'https://storage.googleapis.com/mediapipe-assets/cats_and_dogs.jpg',
};

for (const [nome, url] of Object.entries(arquivos)) {
  const destino = join(pasta, nome);
  try {
    await access(destino);
    console.log(`já existe: ${nome}`);
    continue;
  } catch {}
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`falha ao baixar ${url}: HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await writeFile(destino, buf);
  console.log(`baixado: ${nome} (${(buf.length / 1024).toFixed(0)} KiB)`);
}

// Vídeo de 4 s, 10 fps, com um "zoom + pan" lento: os objetos se movem no quadro,
// o que permite ver o tracking mantendo o mesmo ID entre frames. VP9/WebM toca em qualquer Chrome.
const video = join(pasta, 'amostra.webm');
try {
  await access(video);
  console.log('já existe: amostra.webm');
} catch {
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-loop', '1', '-i', join(pasta, 'cats_and_dogs.jpg'),
    '-vf', "scale=1280:-2,zoompan=z='1+0.004*on':x='iw/2-(iw/zoom/2)+on*2':y='ih/2-(ih/zoom/2)':d=40:s=640x320:fps=10",
    '-frames:v', '40', '-c:v', 'libvpx-vp9', '-b:v', '600k', video,
  ]);
  console.log('gerado: amostra.webm (40 frames, 10 fps) via ffmpeg');
}
