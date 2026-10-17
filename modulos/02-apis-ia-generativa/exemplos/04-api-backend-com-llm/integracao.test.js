// Teste de integração: API + LLM REAL (Ollama). Lento e não determinístico no texto,
// então só roda quando pedido (INTEGRACAO=1) e verifica PROPRIEDADES, não a frase exata.
import { describe, it, expect } from "vitest";
import { buildApp } from "./app.js";
import { criarLlm } from "./llm.js";

describe.skipIf(!process.env.INTEGRACAO)("integração com o LLM real", () => {
  it("resume um texto de verdade", { timeout: 600_000 }, async () => {
    const app = buildApp({ llm: criarLlm(), token: "t" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/resumos",
      headers: { authorization: "Bearer t" },
      payload: { texto: "A reunião de hoje decidiu adiar o lançamento do aplicativo para março, porque os testes de segurança ainda não terminaram." },
    });
    expect(res.statusCode).toBe(200);
    const corpo = res.json();
    console.log("resposta real:", corpo);
    expect(corpo.resumo.length).toBeGreaterThan(10);
    expect(corpo.resumo.length).toBeLessThan(300);
    expect(corpo.resumo.toLowerCase()).toMatch(/lançamento|adiad|março/);
    expect(corpo.tokens).toBeGreaterThan(0);
  });
});
