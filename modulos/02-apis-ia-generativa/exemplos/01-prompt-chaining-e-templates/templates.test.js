// Templates são código: dá para testar sem chamar o LLM.
import { describe, it, expect } from "vitest";
import { renderizar, mensagens, TEMPLATES } from "./templates.js";

describe("templates", () => {
  it("substitui as variáveis", () => {
    expect(renderizar("Olá {{nome}}!", { nome: "Ana" })).toBe("Olá Ana!");
  });
  it("falha cedo quando falta variável", () => {
    expect(() => renderizar("Pedido {{pedido}}", {})).toThrow(/pedido/);
  });
  it("monta system + user", () => {
    const m = mensagens(TEMPLATES.classificar, { produto: "fone", problema: "sem cabo", prazo: "sexta" });
    expect(m).toHaveLength(2);
    expect(m[1].content).toContain("Produto: fone");
  });
});
