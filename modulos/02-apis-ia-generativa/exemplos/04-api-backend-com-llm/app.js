// API Fastify que integra o LLM: rotas versionadas (/v1), autenticação por token,
// validação de entrada, limite de tamanho e mapeamento de erros do provedor.
import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";

// Comparação em tempo constante: evita vazar o token por diferença de tempo de resposta.
function tokenValido(recebido, esperado) {
  const a = Buffer.from(recebido ?? "");
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildApp({ llm, token, logger = false }) {
  const app = Fastify({ logger, bodyLimit: 16 * 1024 });

  // Saúde fica fora da versão e sem auth (load balancer e Kubernetes chamam isso).
  app.get("/health", async () => ({ status: "ok" }));

  // Tudo que é contrato público mora sob /v1. Uma mudança incompatível vira /v2,
  // registrada ao lado, e /v1 continua no ar até os clientes migrarem.
  app.register(
    async (v1) => {
      v1.addHook("onRequest", async (req, reply) => {
        const [tipo, valor] = (req.headers.authorization ?? "").split(" ");
        if (tipo !== "Bearer" || !tokenValido(valor, token)) {
          return reply.code(401).send({ erro: "token ausente ou inválido" });
        }
      });

      v1.post(
        "/resumos",
        {
          schema: {
            body: {
              type: "object",
              required: ["texto"],
              additionalProperties: false,
              // maxLength protege o bolso: texto maior = mais tokens = mais custo e latência.
              properties: { texto: { type: "string", minLength: 20, maxLength: 4000 } },
            },
          },
        },
        async (req, reply) => {
          const inicio = Date.now();
          try {
            const { resumo, tokens } = await llm.resumir(req.body.texto);
            req.log.info({ tokens, ms: Date.now() - inicio }, "resumo gerado");
            return { resumo, modelo: llm.modelo, tokens, versao: "v1" };
          } catch (err) {
            // Falha do provedor não é erro do cliente nem 500 genérico: 502 (bad gateway)
            // diz "a dependência upstream falhou", e o cliente sabe que pode tentar depois.
            req.log.error({ err: err.message }, "falha no LLM");
            return reply.code(502).send({ erro: "provedor de IA indisponível" });
          }
        },
      );
    },
    { prefix: "/v1" },
  );

  return app;
}
