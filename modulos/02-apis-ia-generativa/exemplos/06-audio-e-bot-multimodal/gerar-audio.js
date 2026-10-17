// Gera um WAV de teste com voz sintética LOCAL (modelo MMS-TTS de português, via
// @huggingface/transformers). Não há espeak/pico2wave nesta máquina, e assim o exemplo
// não depende de áudio baixado da internet. O modelo (~37 MB em q8) é baixado uma vez para .cache/.
import { writeFileSync } from "node:fs";
import { env, pipeline } from "@huggingface/transformers";
import wavefile from "wavefile";

env.cacheDir = new URL("../../.cache/hf/", import.meta.url).pathname;

const FRASE = process.argv[2] ?? "Olá, eu gostaria de saber qual é o prazo para trocar um fone de ouvido.";
const saida = new URL("./pergunta.wav", import.meta.url).pathname;

const tts = await pipeline("text-to-speech", "Xenova/mms-tts-por", { dtype: "q8" });
const { audio, sampling_rate } = await tts(FRASE);

const wav = new wavefile.WaveFile();
wav.fromScratch(1, sampling_rate, "32f", audio); // mono, float32
writeFileSync(saida, wav.toBuffer());
console.log(`gerado: pergunta.wav · ${sampling_rate} Hz · ${(audio.length / sampling_rate).toFixed(1)} s · "${FRASE}"`);
