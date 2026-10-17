// Chamada com saída estruturada (JSON Schema) + validação com zod + nova tentativa com feedback.
// Por que validar se o servidor já força o schema? Porque nem todo provedor/modelo garante
// o schema (o Ollama faz "best effort" via gramática) e porque o zod checa regras que o
// JSON Schema não expressa bem (ex.: refinamentos, "pedido precisa existir no texto").
import { zodResponseFormat } from "openai/helpers/zod";
import { PADRAO, MODELO_CHAT } from "./config.js";

export async function chamarEstruturado(cliente, { messages, schema, nome, maxTokens = 150, tentativas = 2, log = () => {} }) {
  let historico = [...messages];
  let ultimoErro;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    const inicio = Date.now();
    const resp = await cliente.chat.completions.create({
      ...PADRAO,
      model: MODELO_CHAT,
      max_tokens: maxTokens,
      messages: historico,
      response_format: zodResponseFormat(schema, nome),
    });
    const texto = resp.choices[0].message.content ?? "";
    const base = { etapa: nome, tentativa, ms: Date.now() - inicio, tokens: resp.usage?.total_tokens };
    let json;
    try {
      json = JSON.parse(texto);
    } catch {
      ultimoErro = `JSON inválido: ${texto.slice(0, 80)}`;
    }
    if (json !== undefined) {
      const r = schema.safeParse(json);
      if (r.success) {
        log(base);
        return { dados: r.data, usage: resp.usage, tentativas: tentativa };
      }
      // Loga o valor recebido junto do erro: sem isso, depurar "validação falhou" é adivinhação.
      ultimoErro = r.error.issues
        .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message} (recebido: ${JSON.stringify(i.path.reduce((o, k) => o?.[k], json))})`)
        .join("; ");
    }
    log({ ...base, erro: ultimoErro });
    // Devolve o erro ao modelo: ele costuma corrigir na 2ª tentativa sem precisar de prompt novo.
    historico = [
      ...historico,
      { role: "assistant", content: texto },
      { role: "user", content: `Sua resposta não passou na validação (${ultimoErro}). Corrija e responda só o JSON.` },
    ];
  }
  throw new Error(`Saída estruturada inválida após ${tentativas} tentativas: ${ultimoErro}`);
}
