import { criarCliente } from "../../../comum/config.js";
import { decidir, extrair, redigir } from "./reembolso.js";

const cliente = criarCliente();
const pedidos = [
  "Oi, aqui é a Marina Souza. Almocei com um cliente em 03/10 e gastei R$ 62,40. Pode reembolsar?",
  "Sou o Pedro Lima, peguei um táxi do aeroporto até o hotel no dia 12/10, deu 187 reais.",
];
for (const texto of pedidos) {
  console.log(`\n> ${texto}`);
  const ext = await extrair(cliente, texto, { log: (e) => console.log("  ·", JSON.stringify(e)) });
  if (!ext.ok) {
    console.log("  → revisão humana:", ext.erro);
    continue;
  }
  const dec = decidir(ext.dados);
  console.log("  dados:", JSON.stringify(ext.dados));
  console.log("  decisão (código):", JSON.stringify(dec));
  console.log("  resposta (LLM):", await redigir(cliente, ext.dados, dec));
}
