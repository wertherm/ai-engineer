# Exemplo 06 · Áudio local (TTS + Whisper) e bot multimodal

**Conceito novo:** transformar áudio em texto **localmente** com Whisper (ONNX, `@huggingface/transformers`)
e montar um **bot multimodal** que roteia a entrada pela modalidade: texto vai direto, áudio é transcrito,
imagem vai para o modelo com visão. A resposta é sempre texto.

**Pré-requisito:** [exemplo 05](../05-documentos-ocr-e-visao/) (imagem em base64) e o [doc 04](../../docs/04-multimodal-e-aplicacoes.md).

| Arquivo | Papel |
|---|---|
| [`gerar-audio.js`](gerar-audio.js) | gera `pergunta.wav` com voz sintética local (MMS-TTS português) |
| [`transcrever.js`](transcrever.js) | WAV → 16 kHz mono Float32 → Whisper base → texto |
| [`bot.js`](bot.js) | roteador texto / áudio / imagem + resposta com as políticas da loja no prompt |

Sobre o áudio de teste: esta máquina não tem `espeak-ng` nem `pico2wave`, então a voz é gerada pelo modelo
**MMS-TTS** (`Xenova/mms-tts-por`, ~37 MB na versão q8) rodando no próprio Node — nada é baixado além dos modelos, e o
`pergunta.wav` já vem versionado no repositório. Os modelos ficam em `.cache/hf/` (ignorado pelo git).

## Como rodar

```bash
cd modulos/02-apis-ia-generativa
npm run ex06:audio                    # (opcional) regenera pergunta.wav — 1ª vez baixa o modelo de TTS
npm run ex06:transcrever              # só a transcrição — 1ª vez baixa o whisper-base (~76 MB em q8)
npm run ex06:bot                      # áudio → texto → resposta
node exemplos/06-audio-e-bot-multimodal/bot.js exemplos/05-documentos-ocr-e-visao/nota-fiscal-pequena.png "Qual é o valor total desta nota? Responda só o valor."
node exemplos/06-audio-e-bot-multimodal/bot.js "Vocês abrem no domingo?"
```

## Saída esperada

Saídas reais:

```
$ npm run ex06:audio
gerado: pergunta.wav · 16000 Hz · 5.1 s · "Olá, eu gostaria de saber qual é o prazo para trocar um fone de ouvido."

$ npm run ex06:transcrever
transcrição (10.3 s): Olá, eu gostaria de saber qual é o prazo para trocar um fone de ouvido.

$ npm run ex06:bot
[áudio → texto em 10.7 s] Olá, eu gostaria de saber qual é o prazo para trocar um fone de ouvido.
[audio] resposta (109.1 s, 265 tokens de entrada): O prazo para troca do seu fone de ouvido é de 7 dias após o recebimento, pois se trata de um eletrônico.

$ node .../bot.js .../nota-fiscal-pequena.png "Qual é o valor total desta nota? Responda só o valor."
[imagem] nota-fiscal-pequena.png + "Qual é o valor total desta nota? Responda só o valor."
[imagem] resposta (75.0 s, 418 tokens de entrada): R$ 225,80

$ node .../bot.js "Vocês abrem no domingo?"
[texto] resposta (75.6 s, 254 tokens de entrada): Não, nosso atendimento ao chat não funciona aos domingos, operando apenas de segunda a sexta das 8h às 20h e aos sábados das 9h às 13h.
```

Repare nos **tokens de entrada**: a mesma pergunta custa ~254 tokens como texto e ~265 como áudio
transcrito (a transcrição é local e não entra na conta), mas a imagem de 480 px já soma ~164 tokens a mais.
Transcrição perfeita de voz sintética é o caso fácil; áudio real (ruído, sotaque, várias pessoas) erra mais.

## Experimente

1. `MODELO_WHISPER=onnx-community/whisper-tiny npm run ex06:transcrever`: mais rápido e menor — compare a qualidade.
2. Gere outra frase (`node exemplos/06-audio-e-bot-multimodal/gerar-audio.js "Quero cancelar meu pedido."`) e
   passe ao bot: a resposta deve citar a política de cancelamento.
3. Grave um áudio seu (WAV), rode a transcrição e compare com a voz sintética.
