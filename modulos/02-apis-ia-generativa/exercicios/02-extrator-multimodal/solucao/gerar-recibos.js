// Gera dois recibos de aluguel FICTÍCIOS: um nítido e um "fotografado mal"
// (girado, pequeno e com ruído), para exercitar o fallback OCR → visão.
import { writeFileSync } from "node:fs";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

GlobalFonts.registerFromPath("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVu");

export const GABARITO = { pagador: "Carlos Andrade", valor: 1850.0, referencia: "2026-09", recebedor: "Imobiliaria Modelo" };

function recibo({ largura, angulo = 0, ruido = 0 }) {
  const esc = largura / 600;
  const c = createCanvas(largura, Math.round(300 * esc));
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.save();
  g.scale(esc, esc);
  g.translate(300, 150);
  g.rotate((angulo * Math.PI) / 180);
  g.translate(-300, -150);
  g.fillStyle = "#000";
  g.font = "bold 24px DejaVu";
  g.fillText("RECIBO DE ALUGUEL", 160, 50);
  g.font = "18px DejaVu";
  g.fillText(`Recebi de ${GABARITO.pagador} a quantia de`, 30, 100);
  g.fillText("R$ 1.850,00 referente ao aluguel de setembro/2026.", 30, 130);
  g.fillText(`Recebedor: ${GABARITO.recebedor}`, 30, 190);
  g.fillText("Data: 05/10/2026", 30, 220);
  g.restore();
  // Ruído "sal e pimenta": pixels pretos aleatórios, com semente fixa para ser reproduzível.
  let s = 7;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = "#000";
  for (let i = 0; i < ruido; i++) g.fillRect(Math.floor(rand() * c.width), Math.floor(rand() * c.height), 1, 1);
  return c.toBuffer("image/png");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL(".", import.meta.url).pathname;
  writeFileSync(`${dir}recibo-nitido.png`, recibo({ largura: 600 }));
  writeFileSync(`${dir}recibo-ruim.png`, recibo({ largura: 420, angulo: 5, ruido: 2500 }));
  console.log("gerados: recibo-nitido.png e recibo-ruim.png");
}
