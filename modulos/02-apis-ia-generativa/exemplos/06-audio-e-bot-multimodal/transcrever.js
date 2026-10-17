// Transcrição local com Whisper (ONNX via @huggingface/transformers), sem enviar áudio a ninguém.
// O Whisper espera áudio mono a 16 kHz em Float32: convertemos o WAV com o wavefile.
import { readFileSync } from "node:fs";
import { env, pipeline } from "@huggingface/transformers";
import wavefile from "wavefile";

env.cacheDir = new URL("../../.cache/hf/", import.meta.url).pathname;

export function lerWav16k(caminho) {
  const wav = new wavefile.WaveFile(readFileSync(caminho));
  wav.toBitDepth("32f");
  wav.toSampleRate(16000);
  let amostras = wav.getSamples(); // Float64Array (mono) ou array de canais
  if (Array.isArray(amostras)) amostras = amostras[0]; // estéreo → usa o 1º canal
  return new Float32Array(amostras);
}

let asr;
export async function transcrever(caminho, modelo = process.env.MODELO_WHISPER ?? "onnx-community/whisper-base") {
  asr ??= await pipeline("automatic-speech-recognition", modelo, { dtype: "q8" });
  const { text } = await asr(lerWav16k(caminho), { language: "portuguese", task: "transcribe" });
  return text.trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arquivo = process.argv[2] ?? new URL("./pergunta.wav", import.meta.url).pathname;
  const t = Date.now();
  const texto = await transcrever(arquivo);
  console.log(`transcrição (${((Date.now() - t) / 1000).toFixed(1)} s): ${texto}`);
}
