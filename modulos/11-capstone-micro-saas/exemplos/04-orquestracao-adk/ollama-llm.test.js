// Tradução ADK (formato Gemini) <-> Chat Completions, testada sem rede.
import { describe, expect, it } from 'vitest';
import { paraJsonSchema, paraLlmResponse, paraOpenAI } from './ollama-llm.js';

describe('adaptador OllamaLlm', () => {
  it('converte o Schema do Gemini para JSON Schema', () => {
    expect(paraJsonSchema({ type: 'OBJECT', properties: { q: { type: 'STRING' } }, required: ['q'] }))
      .toEqual({ type: 'object', properties: { q: { type: 'string' } }, required: ['q'] });
  });

  it('converte system, tool call e tool response', () => {
    const { messages, tools } = paraOpenAI({
      config: {
        systemInstruction: 'seja breve',
        tools: [{ functionDeclarations: [{ name: 'buscar', description: 'b', parameters: { type: 'OBJECT', properties: {} } }] }],
      },
      contents: [
        { role: 'user', parts: [{ text: 'oi' }] },
        { role: 'model', parts: [{ functionCall: { id: 'c1', name: 'buscar', args: { q: 'x' } } }] },
        { role: 'user', parts: [{ functionResponse: { id: 'c1', name: 'buscar', response: { ok: 1 } } }] },
      ],
    });
    expect(messages).toEqual([
      { role: 'system', content: 'seja breve' },
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'buscar', arguments: '{"q":"x"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '{"ok":1}' },
    ]);
    expect(tools[0].function.parameters.type).toBe('object');
  });

  it('converte a resposta com tool_calls em functionCall', () => {
    const r = paraLlmResponse({ message: { content: '', tool_calls: [{ id: 't1', function: { name: 'buscar', arguments: '{"q":"y"}' } }] } });
    expect(r.content.parts).toEqual([{ functionCall: { id: 't1', name: 'buscar', args: { q: 'y' } } }]);
  });
});
