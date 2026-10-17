// Bot multimodal: aceita texto, imagem ou áudio e responde em texto.
// Roteamento por modalidade, do mais barato para o mais caro:
//   texto  → direto para o LLM
//   áudio  → Whisper local transcreve → vira texto (o LLM nunca "ouve")
//   imagem → LLM com visão (a imagem vai em base64 junto da pergunta)
// Uso: node bot.js <arquivo.wav|arquivo.png|"texto"> ["pergunta sobre a imagem"]
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { criarCliente, MODELO_CHAT, PADRAO } from "../../comum/config.js";
import { DOCUMENTOS } from "../03-rag-langchain-observabilidade/corpus.js";
import { transcrever } from "./transcrever.js";

const entrada = process.argv[2] ?? new URL("./pergunta.wav", import.meta.url).pathname;
const perguntaImagem = process.argv[3] ?? "O que é este documento? Responda em 1 frase.";
const cliente = criarCliente();

// Base pequena (6 políticas) cabe inteira no prompt: aqui RAG seria exagero.
const SYSTEM =
  "Você é o assistente da Loja Exemplo. Responda em 1 frase, usando as políticas abaixo quando forem relevantes.\n" +
  DOCUMENTOS.map((d) => d.texto).join("\n");

function modalidade(x) {
  if (!existsSync(x)) return "texto";
  const ext = extname(x).toLowerCase();
  if ([".wav"].includes(ext)) return "audio";
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return "imagem";
  throw new Error(`Extensão não suportada: ${ext}`);
}

const tipo = modalidade(entrada);
const t = Date.now();
let conteudo;
if (tipo === "texto") {
  conteudo = entrada;
} else if (tipo === "audio") {
  conteudo = await transcrever(entrada);
  console.log(`[áudio → texto em ${((Date.now() - t) / 1000).toFixed(1)} s] ${conteudo}`);
} else {
  const mime = extname(entrada) === ".png" ? "image/png" : "image/jpeg";
  conteudo = [
    { type: "text", text: perguntaImagem },
    { type: "image_url", image_url: { url: `data:${mime};base64,${readFileSync(entrada).toString("base64")}` } },
  ];
  console.log(`[imagem] ${entrada.split("/").pop()} + "${perguntaImagem}"`);
}

const r = await cliente.chat.completions.create({
  ...PADRAO,
  model: MODELO_CHAT,
  max_tokens: 70,
  messages: [
    { role: "system", content: SYSTEM },
    { role: "user", content: conteudo },
  ],
});
console.log(`[${tipo}] resposta (${((Date.now() - t) / 1000).toFixed(1)} s, ${r.usage.prompt_tokens} tokens de entrada): ${r.choices[0].message.content.trim()}`);
