// Solução do exercício 02: extrator de recibos com roteamento por custo.
//   1) OCR local (grátis, ~4 s). Se a confiança >= LIMIAR, um LLM de TEXTO estrutura o resultado.
//   2) Senão — ou se o JSON do caminho OCR não validar — cai para o LLM com VISÃO (mais caro).
// Reaproveita o OCR do exemplo 05 e a chamada estruturada com retry do comum/.
import { readFileSync } from "node:fs";
import { z } from "zod";
import { criarCliente } from "../../../comum/config.js";
import { chamarEstruturado } from "../../../comum/estruturado.js";
import { ocr } from "../../../exemplos/05-documentos-ocr-e-visao/extrair.js";
import { GABARITO } from "./gerar-recibos.js";

export const LIMIAR_CONFIANCA = 70;

const Recibo = z.object({
  pagador: z.string().min(3),
  recebedor: z.string().min(3),
  valor: z.number().positive(),
  referencia: z.string().regex(/^\d{4}-\d{2}$/, "use AAAA-MM (mês de referência)"),
});
const INSTRUCAO =
  "Extraia os dados do recibo de aluguel. valor como número com ponto decimal (1.850,00 → 1850). " +
  "referencia é o mês do aluguel em AAAA-MM. Copie os nomes como aparecem.";

async function porOcr(cliente, caminho, log) {
  const { texto, confianca } = await ocr(caminho);
  log({ passo: "ocr", confianca });
  if (confianca < LIMIAR_CONFIANCA) return { motivo: `confiança do OCR ${confianca} < ${LIMIAR_CONFIANCA}` };
  try {
    const { dados } = await chamarEstruturado(cliente, {
      nome: "recibo_ocr", schema: Recibo, maxTokens: 120, log,
      messages: [{ role: "system", content: INSTRUCAO }, { role: "user", content: texto }],
    });
    return { dados };
  } catch (e) {
    return { motivo: `validação falhou no caminho OCR: ${e.message}` };
  }
}

async function porVisao(cliente, caminho, log) {
  const b64 = readFileSync(caminho).toString("base64");
  const { dados } = await chamarEstruturado(cliente, {
    nome: "recibo_visao", schema: Recibo, maxTokens: 120, log,
    messages: [
      { role: "system", content: INSTRUCAO },
      { role: "user", content: [
        { type: "text", text: "Extraia os dados deste recibo." },
        { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
      ] },
    ],
  });
  return { dados };
}

export async function extrairRecibo(cliente, caminho, log = () => {}) {
  const r = await porOcr(cliente, caminho, log);
  if (r.dados) return { via: "ocr", dados: r.dados };
  log({ passo: "fallback", motivo: r.motivo });
  return { via: "visao", ...(await porVisao(cliente, caminho, log)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cliente = criarCliente();
  const dir = new URL(".", import.meta.url).pathname;
  for (const nome of process.argv.slice(2).length ? process.argv.slice(2) : ["recibo-nitido.png", "recibo-ruim.png"]) {
    console.log(`\n[${nome}]`);
    const t = Date.now();
    const { via, dados } = await extrairRecibo(cliente, `${dir}${nome}`, (e) => console.log("  ·", JSON.stringify(e)));
    const certos = Object.keys(GABARITO).filter((k) => String(dados[k]).toLowerCase() === String(GABARITO[k]).toLowerCase());
    console.log(`  via=${via} · ${((Date.now() - t) / 1000).toFixed(1)} s · ${certos.length}/4 campos certos`);
    console.log("  ", JSON.stringify(dados));
  }
}
