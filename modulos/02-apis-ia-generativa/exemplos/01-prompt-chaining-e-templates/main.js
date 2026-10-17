// Prompt chaining: um problema grande vira 3 chamadas pequenas e verificáveis.
//   1) extrair (JSON validado) → 2) classificar (JSON validado) → 3) redigir (texto livre)
// Cada elo recebe só o que precisa do anterior: prompts curtos, mais baratos e fáceis de testar.
import { z } from "zod";
import { criarCliente, MODELO_CHAT, PADRAO } from "../../comum/config.js";
import { chamarEstruturado } from "../../comum/estruturado.js";
import { TEMPLATES, mensagens } from "./templates.js";

const cliente = criarCliente();
const log = (e) => console.log("  ·", JSON.stringify(e));

const texto =
  process.argv[2] ??
  "Comprei um fone Bluetooth (pedido 48213) e ele chegou sem o cabo de carga. Preciso dele para uma viagem na sexta!";

// Schemas zod: o contrato de cada elo da corrente.
const Extracao = z.object({
  produto: z.string().min(2),
  problema: z.string().min(5),
  pedido: z.string().nullable(),
  // v3 do template: sem este campo, o elo 2 nunca soube da "viagem na sexta" e classificou
  // a urgência como baixa. Em chaining, o que um elo não repassa, o próximo não sabe.
  prazo: z.string().nullable().describe("prazo ou data que o cliente mencionou"),
});
const Classificacao = z.object({
  urgencia: z.enum(["alta", "media", "baixa"]),
  justificativa: z.string().max(160),
});

console.log(`Entrada: ${texto}\n`);

// Elo 1 — extrair.
console.log(`[1] ${TEMPLATES.extrair.id} v${TEMPLATES.extrair.versao}`);
const { dados: ext } = await chamarEstruturado(cliente, {
  nome: "extracao",
  schema: Extracao,
  messages: mensagens(TEMPLATES.extrair, { texto }),
  log,
});
// Anti-alucinação determinística: um número de pedido que não aparece no texto é inventado.
// Checagem barata no código vale mais que "por favor não invente" no prompt.
if (ext.pedido && !texto.includes(ext.pedido)) {
  console.log(`  ! pedido "${ext.pedido}" não está no texto: descartado`);
  ext.pedido = null;
}
console.log("  →", JSON.stringify(ext));

// Elo 2 — classificar (recebe só produto, problema e prazo, não o texto inteiro).
console.log(`[2] ${TEMPLATES.classificar.id} v${TEMPLATES.classificar.versao}`);
const { dados: cls } = await chamarEstruturado(cliente, {
  nome: "classificacao",
  schema: Classificacao,
  messages: mensagens(TEMPLATES.classificar, { ...ext, prazo: ext.prazo ?? "não informado" }),
  log,
});
console.log("  →", JSON.stringify(cls));

// Elo 3 — redigir (texto livre: aqui não há schema, só limite de tokens).
console.log(`[3] ${TEMPLATES.responder.id} v${TEMPLATES.responder.versao}`);
const resp = await cliente.chat.completions.create({
  ...PADRAO,
  model: MODELO_CHAT,
  max_tokens: 90,
  messages: mensagens(TEMPLATES.responder, {
    problema: ext.problema,
    pedido: ext.pedido ?? "não informado",
    urgencia: cls.urgencia,
  }),
});
console.log("  →", resp.choices[0].message.content.trim());
