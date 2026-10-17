// Gera uma nota fiscal FICTÍCIA em PNG (dados inventados, CNPJ inválido de propósito).
// Ter o gabarito (os valores que desenhamos) permite MEDIR a extração, campo a campo.
import { writeFileSync } from "node:fs";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

GlobalFonts.registerFromPath("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVu");

export const GABARITO = {
  emitente: "Papelaria Exemplo Ltda",
  cnpj: "00.000.000/0001-00",
  numero: "000123",
  data_emissao: "2026-10-14",
  itens: [
    { descricao: "Caderno universitario", quantidade: 2, valor_unitario: 25.9 },
    { descricao: "Caneta azul", quantidade: 10, valor_unitario: 2.5 },
    { descricao: "Mochila escolar", quantidade: 1, valor_unitario: 149.0 },
  ],
  total: 225.8,
};

const brl = (v) => v.toFixed(2).replace(".", ",");

export function desenhar(largura = 800) {
  const escala = largura / 800;
  const c = createCanvas(largura, Math.round(520 * escala));
  const g = c.getContext("2d");
  g.scale(escala, escala);
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 800, 520);
  g.fillStyle = "#000";
  g.strokeRect(20, 20, 760, 480);
  g.font = "bold 26px DejaVu";
  g.fillText("NOTA FISCAL (FICTICIA)", 220, 60);
  g.font = "20px DejaVu";
  g.fillText(`Emitente: ${GABARITO.emitente}`, 40, 105);
  g.fillText(`CNPJ: ${GABARITO.cnpj}`, 40, 135);
  g.fillText(`Numero: ${GABARITO.numero}`, 40, 165);
  g.fillText("Data de emissao: 14/10/2026", 400, 165);
  g.fillText("Descricao", 40, 215);
  g.fillText("Qtd", 420, 215);
  g.fillText("Unit. (R$)", 500, 215);
  g.fillText("Total (R$)", 640, 215);
  g.beginPath();
  g.moveTo(40, 225);
  g.lineTo(760, 225);
  g.stroke();
  GABARITO.itens.forEach((it, i) => {
    const y = 260 + i * 40;
    g.fillText(it.descricao, 40, y);
    g.fillText(String(it.quantidade), 430, y);
    g.fillText(brl(it.valor_unitario), 510, y);
    g.fillText(brl(it.quantidade * it.valor_unitario), 650, y);
  });
  g.font = "bold 24px DejaVu";
  g.fillText(`TOTAL: R$ ${brl(GABARITO.total)}`, 470, 440);
  return c.toBuffer("image/png");
}

// Rodado direto: grava os dois tamanhos usados no exemplo.
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL(".", import.meta.url).pathname;
  writeFileSync(`${dir}nota-fiscal.png`, desenhar(800));
  writeFileSync(`${dir}nota-fiscal-pequena.png`, desenhar(480)); // menor = menos tokens de imagem na visão
  console.log("gerados: nota-fiscal.png (800px) e nota-fiscal-pequena.png (480px)");
}
