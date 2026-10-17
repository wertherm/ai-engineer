// Sobe a API de verdade, ligada ao LLM configurado no ambiente.
import { buildApp } from "./app.js";
import { criarLlm } from "./llm.js";

const PORTA = Number(process.env.PORTA ?? 30200);
// Em produção o token vem de um cofre (Secrets Manager, Vault...). Aqui, do ambiente.
const TOKEN = process.env.API_TOKEN ?? "token-de-desenvolvimento";

const app = buildApp({ llm: criarLlm(), token: TOKEN, logger: true });
await app.listen({ port: PORTA, host: "127.0.0.1" });
