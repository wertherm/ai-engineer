// Dois caminhos para "ler" um documento:
//   OCR (tesseract.js) → texto → LLM de texto estrutura em JSON    (barato, rápido, local)
//   Visão (LLM multimodal) → imagem em base64 → JSON direto          (entende layout, mais caro)
import { mkdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import { createWorker } from "tesseract.js";
import { chamarEstruturado } from "../../comum/estruturado.js";

// Dinheiro como TEXTO copiado do documento ("25,90"), convertido depois pelo código.
// Na 1ª versão os valores eram z.number() e o modelo devolveu 2.5900000000000003e-15 no lugar
// de 25,90: o LLM é bom em COPIAR, ruim em converter número. Deixe a conversão para o código.
// Aceita o "R$ " opcional: o modelo de visão costuma copiar o símbolo junto.
const Dinheiro = z.string().regex(/^(R\$\s?)?\d{1,3}(\.\d{3})*,\d{2}$/, "copie o valor como no documento, ex.: 1.234,56");
export const paraNumero = (brl) => Number(brl.replace(/R\$\s?/, "").replace(/\./g, "").replace(",", "."));

export const NotaFiscal = z.object({
  emitente: z.string(),
  cnpj: z.string(),
  numero: z.string(),
  data_emissao: z.string().describe("formato AAAA-MM-DD"),
  itens: z.array(z.object({ descricao: z.string(), quantidade: z.number().int(), valor_unitario: Dinheiro })),
  total: Dinheiro,
});

const INSTRUCAO =
  "Extraia os campos da nota fiscal. Copie textos e valores exatamente como aparecem (ex.: 25,90). " +
  "Data em AAAA-MM-DD. Não invente campos ausentes.";

const CACHE = new URL("../../.cache/", import.meta.url).pathname;

export async function ocr(caminho) {
  // 'por' = modelo de português; o arquivo de idioma é baixado uma vez e fica em .cache/.
  // O tesseract.js NÃO cria a pasta: sem ela, falha em silêncio e baixa o idioma a cada execução.
  mkdirSync(CACHE, { recursive: true });
  const worker = await createWorker("por", 1, { cachePath: CACHE });
  const { data } = await worker.recognize(caminho);
  await worker.terminate();
  return { texto: data.text, confianca: data.confidence };
}

export async function viaOcr(cliente, caminho, log) {
  const { texto, confianca } = await ocr(caminho);
  const { dados } = await chamarEstruturado(cliente, {
    nome: "nota_ocr",
    schema: NotaFiscal,
    maxTokens: 300,
    messages: [
      { role: "system", content: INSTRUCAO },
      { role: "user", content: `Texto extraído por OCR:\n${texto}` },
    ],
    log,
  });
  return { dados, confianca, texto };
}

export async function viaVisao(cliente, caminho, log) {
  // O Ollama só aceita imagem como data URI base64 (não aceita URL http).
  const b64 = readFileSync(caminho).toString("base64");
  const { dados } = await chamarEstruturado(cliente, {
    nome: "nota_visao",
    schema: NotaFiscal,
    maxTokens: 300,
    messages: [
      { role: "system", content: INSTRUCAO },
      {
        role: "user",
        content: [
          { type: "text", text: "Extraia os campos desta nota fiscal." },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      },
    ],
    log,
  });
  return { dados };
}

// Compara com o gabarito campo a campo: "acurácia" de extração é métrica, não impressão.
export function comparar(dados, gabarito) {
  const norm = (s) => String(s).trim().toLowerCase();
  const total = paraNumero(dados.total);
  const campos = ["emitente", "cnpj", "numero", "data_emissao"].map((c) => [c, norm(dados[c]) === norm(gabarito[c])]);
  campos.push(["total", Math.abs(total - gabarito.total) < 0.005]);
  const itensOk =
    dados.itens.length === gabarito.itens.length &&
    gabarito.itens.every((g, i) => dados.itens[i]?.quantidade === g.quantidade && Math.abs(paraNumero(dados.itens[i].valor_unitario) - g.valor_unitario) < 0.005);
  campos.push(["itens", itensOk]);
  // Checagem de consistência interna: soma dos itens bate com o total? Pega alucinação numérica
  // mesmo SEM gabarito — é a que você consegue rodar em produção.
  const soma = dados.itens.reduce((s, i) => s + i.quantidade * paraNumero(i.valor_unitario), 0);
  campos.push(["soma_confere", Math.abs(soma - total) < 0.01]);
  return Object.fromEntries(campos);
}
