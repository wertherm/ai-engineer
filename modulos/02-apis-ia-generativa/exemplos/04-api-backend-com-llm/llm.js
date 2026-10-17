// Adaptador do LLM: a API não conhece o SDK, só esta interface { resumir(texto) }.
// É isso que permite trocar o provedor e, nos testes, trocar o LLM por um dublê (mock).
import { criarCliente, MODELO_CHAT, PADRAO } from "../../comum/config.js";

export function criarLlm(cliente = criarCliente()) {
  return {
    modelo: MODELO_CHAT,
    async resumir(texto) {
      const r = await cliente.chat.completions.create({
        ...PADRAO,
        model: MODELO_CHAT,
        max_tokens: 60,
        messages: [
          { role: "system", content: "Resuma o texto do usuário em UMA frase curta, em português." },
          { role: "user", content: texto },
        ],
      });
      return { resumo: r.choices[0].message.content.trim(), tokens: r.usage?.total_tokens ?? 0 };
    },
  };
}
