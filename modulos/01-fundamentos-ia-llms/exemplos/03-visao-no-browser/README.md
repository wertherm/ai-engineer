# Exemplo 03 · ML com vídeo no browser: detecção, tracking e filtro

**Conceito novo:** inferência de Deep Learning **dentro do navegador** (WASM, sem servidor de IA): um detector
de objetos pré-treinado (EfficientDet-Lite0, dataset COCO) via MediaPipe Tasks Vision, rodando frame a frame
num vídeo, com um tracker simples por IoU (mantém o mesmo ID entre frames) e um filtro de canvas (fundo em
cinza, objetos coloridos).

**Pré-requisito:** [exemplo 02](../02-primeira-rede-neural/) (o que é treino x inferência), Google Chrome
instalado (o `playwright-core` usa o Chrome do sistema) e `ffmpeg` (só para gerar o vídeo de amostra).

**Câmera:** em headless não há webcam, então o vídeo vem de um arquivo gerado a partir de uma foto oficial do
MediaPipe (`cats_and_dogs.jpg`) com zoom e pan. Para usar a webcam, troque o `src` do `<video>` por
`video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true })`: o resto do código é igual.

## Como rodar

```bash
cd modulos/01-fundamentos-ia-llms
npm run ex03:assets   # baixa modelo (7 MB) + foto e gera assets/amostra.webm com ffmpeg (1 vez)
npm run ex03          # sobe servidor na porta 30100, abre Chrome headless, processa o vídeo e imprime
# Para ver no seu navegador:
node exemplos/03-visao-no-browser/servidor.js   # e abra http://127.0.0.1:30100
```

## Saída esperada

Saída real do `npm run ex03`:

```text
frames processados: 7 | inferência média: 631.2 ms/frame (WASM, CPU)
primeiro frame: #1 dog, #2 dog, #3 cat, #4 cat
último frame:   #1 dog, #2 dog, #4 cat, #3 cat
trilhas (id rótulo -> em quantos frames apareceu):
  #1 dog     7
  #2 dog     7
  #3 cat     7
  #4 cat     7
screenshot do canvas: exemplos/03-visao-no-browser/assets/resultado.png
```

O screenshot mostra 4 caixas (`#1 dog 71%`, `#2 dog 59%`, `#3 cat 61%`, `#4 cat 69%`) sobre o fundo em cinza.
Os 4 IDs se mantêm do primeiro ao último frame: é o tracking funcionando enquanto o quadro se move.

**Por que só 7 de 40 frames?** O vídeo toca em tempo real (10 fps = 100 ms por frame) e cada inferência
levou ~600 ms nesta máquina (CPU compartilhada com outros processos). Enquanto o detector trabalha, os frames
seguintes passam e são descartados: é o comportamento correto para câmera ao vivo (melhor pular frames do que
acumular atraso). Testamos `delegate: 'GPU'`: no headless sem GPU real o WebGL é emulado em software e ficou
~19 s por frame, por isso o exemplo usa `'CPU'`.

## Experimente

1. Mude `scoreThreshold` de `0.4` para `0.7` e veja quais detecções somem (menos falsos positivos, mais falsos negativos).
2. Em `index.html`, faça `video.playbackRate = 0.1` antes do `play()` para processar quase todos os frames.
3. Troque o filtro: em vez de `grayscale`, pixele os objetos (desenhe a região em 1/10 do tamanho e amplie) para anonimizar pessoas.
