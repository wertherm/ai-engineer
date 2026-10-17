// Adaptador de LLM: a única porta de saída para o provedor. O resto do código recebe um objeto
// { chat, embed, modelo } por injeção, então os testes trocam por um dublê sem rede.
import { config, extrasProvedor, openai } from './config.js';

export function criarLlm({ client = openai, modelo = config.modeloChat, modeloEmbed = config.modeloEmbed } = {}) {
  return {
    modelo,
    /** Uma chamada de Chat Completions. `tools` é opcional (agent loop). */
    async chat(messages, { tools, maxTokens = 160, temperature = 0 } = {}) {
      const t0 = Date.now();
      const r = await client.chat.completions.create({
        model: modelo,
        messages,
        ...(tools?.length ? { tools } : {}),
        temperature,
        max_tokens: maxTokens,
        ...extrasProvedor,
      });
      return { msg: r.choices[0].message, usage: r.usage ?? {}, ms: Date.now() - t0, finishReason: r.choices[0].finish_reason };
    },
    /** Embeddings em lote: 1 chamada para N textos. */
    async embed(textos) {
      const r = await client.embeddings.create({ model: modeloEmbed, input: textos });
      return r.data.map((d) => d.embedding);
    },
  };
}
