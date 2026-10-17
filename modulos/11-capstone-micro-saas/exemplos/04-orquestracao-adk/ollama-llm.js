// Adaptador de modelo para o Google ADK (Agent Development Kit, @google/adk): o ADK fala o formato do
// Gemini (Content/parts, functionCall/functionResponse, Schema com tipos em MAIÚSCULAS). O ADK para
// TypeScript NÃO traz integração LiteLLM/OpenAI-compatível (só Gemini, Vertex, Apigee e o modelo do
// Chrome), então estendemos BaseLlm e traduzimos para Chat Completions. Resultado: os agentes do ADK
// rodam no Ollama local (ou em qualquer API compatível com OpenAI) sem chave do Google.
import { BaseLlm } from '@google/adk';
import { config, extrasProvedor, openai } from '../../app/src/config.js';

/** Schema do Gemini ({type: 'OBJECT', properties: {x: {type: 'STRING'}}}) -> JSON Schema (minúsculas). */
export function paraJsonSchema(schema) {
  if (Array.isArray(schema)) return schema.map(paraJsonSchema);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(
    Object.entries(schema).map(([k, v]) => [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : paraJsonSchema(v)]),
  );
}

const textoDe = (parts = []) => parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('\n');

/** LlmRequest do ADK -> { messages, tools } do Chat Completions. */
export function paraOpenAI(req) {
  const messages = [];
  const sys = req.config?.systemInstruction;
  const sistema = typeof sys === 'string' ? sys : textoDe(sys?.parts);
  if (sistema) messages.push({ role: 'system', content: sistema });

  for (const c of req.contents ?? []) {
    const parts = c.parts ?? [];
    if (c.role === 'model') {
      const chamadas = parts.filter((p) => p.functionCall).map((p) => ({
        id: p.functionCall.id, type: 'function',
        function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) },
      }));
      messages.push({ role: 'assistant', content: textoDe(parts) || null, ...(chamadas.length ? { tool_calls: chamadas } : {}) });
    } else {
      // Resposta de ferramenta vira mensagem "tool" amarrada ao id da chamada.
      for (const p of parts.filter((x) => x.functionResponse)) {
        messages.push({ role: 'tool', tool_call_id: p.functionResponse.id, content: JSON.stringify(p.functionResponse.response) });
      }
      const texto = textoDe(parts);
      if (texto) messages.push({ role: 'user', content: texto });
    }
  }

  const tools = (req.config?.tools ?? []).flatMap((t) => t.functionDeclarations ?? []).map((f) => ({
    type: 'function',
    function: { name: f.name, description: f.description, parameters: paraJsonSchema(f.parametersJsonSchema ?? f.parameters ?? { type: 'object', properties: {} }) },
  }));
  return { messages, tools };
}

/** Mensagem do Chat Completions -> LlmResponse do ADK. */
export function paraLlmResponse(choice, usage = {}) {
  const parts = [];
  if (choice.message.content) parts.push({ text: choice.message.content });
  for (const tc of choice.message.tool_calls ?? []) {
    parts.push({ functionCall: { id: tc.id, name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}') } });
  }
  return {
    content: { role: 'model', parts },
    turnComplete: true,
    usageMetadata: { promptTokenCount: usage.prompt_tokens, candidatesTokenCount: usage.completion_tokens, totalTokenCount: usage.total_tokens },
  };
}

export class OllamaLlm extends BaseLlm {
  // Nomes "ollama/<modelo>" passam a ser resolvidos por esta classe se ela for registrada no LLMRegistry.
  static supportedModels = [/^ollama\//];

  constructor({ model = `ollama/${config.modeloChat}`, client = openai, maxTokens = 200 } = {}) {
    super({ model });
    Object.assign(this, { client, maxTokens });
  }

  async *generateContentAsync(llmRequest) {
    const { messages, tools } = paraOpenAI(llmRequest);
    const r = await this.client.chat.completions.create({
      model: this.model.replace(/^ollama\//, ''),
      messages,
      ...(tools.length ? { tools } : {}),
      temperature: 0,
      max_tokens: llmRequest.config?.maxOutputTokens ?? this.maxTokens,
      ...extrasProvedor,
    });
    yield paraLlmResponse(r.choices[0], r.usage);
  }

  async connect() {
    throw new Error('OllamaLlm não suporta o modo live (streaming bidirecional de áudio/vídeo do Gemini)');
  }
}
