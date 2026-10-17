// Testa a lógica de validação/retry com um cliente falso: rápido e determinístico.
import { describe, expect, it, vi } from "vitest";
import { decidir, extrair } from "./reembolso.js";

// Dublê do SDK: devolve as respostas da lista, uma por chamada.
function clienteFalso(respostas) {
  const create = vi.fn();
  respostas.forEach((r) => create.mockResolvedValueOnce({ choices: [{ message: { content: r } }] }));
  return { chat: { completions: { create } } };
}
const texto = "Ana Reis, jantar em 05/10, R$ 45,90.";
const valido = JSON.stringify({ colaborador: "Ana Reis", valor: 45.9, categoria: "alimentacao", data: "2026-10-05" });

describe("extrair", () => {
  it("aceita de primeira quando o JSON é válido", async () => {
    const c = clienteFalso([valido]);
    const r = await extrair(c, texto);
    expect(r).toMatchObject({ ok: true, tentativas: 1 });
  });

  it("refaz com feedback quando a data vem no formato errado", async () => {
    const ruim = JSON.stringify({ colaborador: "Ana Reis", valor: 45.9, categoria: "alimentacao", data: "05/10/2026" });
    const c = clienteFalso([ruim, valido]);
    const r = await extrair(c, texto);
    expect(r).toMatchObject({ ok: true, tentativas: 2 });
    const msgs = c.chat.completions.create.mock.calls[1][0].messages;
    expect(msgs.at(-1).content).toMatch(/data: use AAAA-MM-DD/);
  });

  it("rejeita valor que não está no texto (alucinação)", async () => {
    const inventado = JSON.stringify({ colaborador: "Ana Reis", valor: 99, categoria: "alimentacao", data: "2026-10-05" });
    const c = clienteFalso([inventado, inventado, inventado]);
    const r = await extrair(c, texto);
    expect(r).toMatchObject({ ok: false, status: "revisao_humana", tentativas: 3 });
    expect(r.erro).toMatch(/não aparece no texto/);
  });

  it("sobrevive a JSON quebrado", async () => {
    const c = clienteFalso(["{ isso não é json", valido]);
    expect((await extrair(c, texto)).ok).toBe(true);
  });
});

describe("decidir", () => {
  it("aplica o limite por categoria", () => {
    expect(decidir({ valor: 187, categoria: "transporte" }).decisao).toBe("negado");
    expect(decidir({ valor: 62.4, categoria: "alimentacao" }).decisao).toBe("aprovado");
  });
});
