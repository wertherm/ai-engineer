// Testes de unidade: o LLM é um dublê (vi.fn), então rodam em milissegundos, sem rede
// e de forma determinística. app.inject() simula HTTP sem abrir porta.
import { describe, it, expect, vi } from "vitest";
import { buildApp } from "./app.js";

const TOKEN = "segredo-teste";
const auth = { authorization: `Bearer ${TOKEN}` };
const texto = "O pedido 123 atrasou cinco dias e o cliente pediu reembolso integral do frete.";

function appCom(resumir) {
  return buildApp({ llm: { modelo: "falso", resumir }, token: TOKEN });
}

describe("POST /v1/resumos", () => {
  it("200: devolve o resumo do LLM", async () => {
    const resumir = vi.fn().mockResolvedValue({ resumo: "Cliente quer reembolso do frete.", tokens: 42 });
    const res = await appCom(resumir).inject({ method: "POST", url: "/v1/resumos", headers: auth, payload: { texto } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ resumo: "Cliente quer reembolso do frete.", modelo: "falso", tokens: 42, versao: "v1" });
    expect(resumir).toHaveBeenCalledWith(texto);
  });

  it("401: sem token o LLM nem é chamado", async () => {
    const resumir = vi.fn();
    const res = await appCom(resumir).inject({ method: "POST", url: "/v1/resumos", payload: { texto } });
    expect(res.statusCode).toBe(401);
    expect(resumir).not.toHaveBeenCalled();
  });

  it("401: token errado", async () => {
    const res = await appCom(vi.fn()).inject({
      method: "POST", url: "/v1/resumos", headers: { authorization: "Bearer outro" }, payload: { texto },
    });
    expect(res.statusCode).toBe(401);
  });

  it("400: texto curto demais (validação antes de gastar tokens)", async () => {
    const resumir = vi.fn();
    const res = await appCom(resumir).inject({ method: "POST", url: "/v1/resumos", headers: auth, payload: { texto: "oi" } });
    expect(res.statusCode).toBe(400);
    expect(resumir).not.toHaveBeenCalled();
  });

  it("502: falha do provedor vira bad gateway", async () => {
    const resumir = vi.fn().mockRejectedValue(new Error("503 overloaded"));
    const res = await appCom(resumir).inject({ method: "POST", url: "/v1/resumos", headers: auth, payload: { texto } });
    expect(res.statusCode).toBe(502);
    expect(res.json().erro).toMatch(/indisponível/);
  });

  it("404: versão que não existe", async () => {
    const res = await appCom(vi.fn()).inject({ method: "POST", url: "/v2/resumos", headers: auth, payload: { texto } });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /health", () => {
  it("responde sem token", async () => {
    const res = await appCom(vi.fn()).inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({ status: "ok" });
  });
});
