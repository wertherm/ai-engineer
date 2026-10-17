// OCR inteligente: extrai os campos de uma nota fiscal fictícia por OCR+LLM e por visão,
// valida com zod e mede contra o gabarito. Uso: node main.js [ocr|visao|ambos]
import { criarCliente } from "../../comum/config.js";
import { GABARITO } from "./gerar-nota.js";
import { comparar, viaOcr, viaVisao } from "./extrair.js";

const modo = process.argv[2] ?? "ambos";
const dir = new URL(".", import.meta.url).pathname;
const cliente = criarCliente();
const log = (e) => console.log("  ·", JSON.stringify(e));

function relatorio(nome, dados, ms) {
  const r = comparar(dados, GABARITO);
  const acertos = Object.values(r).filter(Boolean).length;
  console.log(`  ${nome}: ${(ms / 1000).toFixed(1)} s · ${acertos}/${Object.keys(r).length} checagens ok`);
  console.log("  ", JSON.stringify(r));
  console.log("  ", JSON.stringify(dados));
}

if (modo !== "visao") {
  console.log("[OCR + LLM] nota-fiscal.png (800px)");
  const t = Date.now();
  const { dados, confianca, texto } = await viaOcr(cliente, `${dir}nota-fiscal.png`, log);
  console.log(`  confiança do OCR: ${confianca}% · ${texto.length} caracteres`);
  relatorio("ocr+llm", dados, Date.now() - t);
}
if (modo !== "ocr") {
  console.log("[Visão] nota-fiscal-pequena.png (480px)");
  const t = Date.now();
  const { dados } = await viaVisao(cliente, `${dir}nota-fiscal-pequena.png`, log);
  relatorio("visao", dados, Date.now() - t);
}
