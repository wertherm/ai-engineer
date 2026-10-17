// Solução do exercício 01: chain de 2 elos para pedidos de reembolso.
//   elo 1 (LLM): texto livre → JSON validado com zod, com até 3 tentativas e feedback do erro
//   regra (código): decide aprovar/negar pelo limite da categoria — decisão NUNCA é do LLM
//   elo 2 (LLM): redige a resposta ao colaborador a partir da decisão já tomada
// O cliente OpenAI é injetado: o teste troca por um dublê e verifica o retry sem rede.
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { MODELO_CHAT, PADRAO } from "../../../comum/config.js";

export const Reembolso = z.object({
  colaborador: z.string().min(2),
  valor: z.number().positive(),
  categoria: z.enum(["alimentacao", "transporte", "hospedagem", "outros"]),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD"),
});

export const LIMITES = { alimentacao: 80, transporte: 150, hospedagem: 400, outros: 50 };

const SYSTEM_EXTRAIR =
  "Extraia o pedido de reembolso. Use só o que está no texto. valor em reais como número (ex.: 42.5). " +
  "data em AAAA-MM-DD; se o ano não for citado, use 2026.";

// Converte "R$ 1.234,56" / "62,40" / "62.4" do texto em número para a checagem de grounding.
function numerosDoTexto(texto) {
  return [...texto.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => {
    const s = m[0];
    return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  });
}

export async function extrair(cliente, texto, { tentativas = 3, log = () => {} } = {}) {
  let messages = [
    { role: "system", content: SYSTEM_EXTRAIR },
    { role: "user", content: texto },
  ];
  let erro = "";
  for (let i = 1; i <= tentativas; i++) {
    const r = await cliente.chat.completions.create({
      ...PADRAO,
      model: MODELO_CHAT,
      max_tokens: 100,
      messages,
      response_format: zodResponseFormat(Reembolso, "reembolso"),
    });
    const bruto = r.choices[0].message.content ?? "";
    try {
      const dados = Reembolso.parse(JSON.parse(bruto));
      // Grounding: o valor precisa estar escrito no texto. Pega o clássico "inventou um número".
      if (!numerosDoTexto(texto).some((n) => Math.abs(n - dados.valor) < 0.005)) {
        throw new Error(`valor ${dados.valor} não aparece no texto`);
      }
      log({ tentativa: i, ok: true });
      return { ok: true, dados, tentativas: i };
    } catch (e) {
      erro = e instanceof z.ZodError ? e.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") : e.message;
      log({ tentativa: i, ok: false, erro });
      messages = [
        ...messages,
        { role: "assistant", content: bruto },
        { role: "user", content: `Inválido: ${erro}. Corrija e responda só o JSON.` },
      ];
    }
  }
  // Esgotou: não chuta. Manda para um humano com o motivo.
  return { ok: false, status: "revisao_humana", erro, tentativas };
}

export function decidir(d) {
  const limite = LIMITES[d.categoria];
  return d.valor <= limite
    ? { decisao: "aprovado", motivo: `dentro do limite de R$ ${limite} para ${d.categoria}` }
    : { decisao: "negado", motivo: `acima do limite de R$ ${limite} para ${d.categoria}` };
}

export async function redigir(cliente, d, dec) {
  const r = await cliente.chat.completions.create({
    ...PADRAO,
    model: MODELO_CHAT,
    max_tokens: 70,
    messages: [
      { role: "system", content: "Escreva 1 frase cordial ao colaborador comunicando a decisão. Não mude a decisão." },
      { role: "user", content: `Colaborador: ${d.colaborador}. Valor: R$ ${d.valor}. Decisão: ${dec.decisao} (${dec.motivo}).` },
    ],
  });
  return r.choices[0].message.content.trim();
}
