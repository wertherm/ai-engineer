# Exemplo 03 · Ponte MCP → LLM (tool calling com qwen3.5:4b)

**Conceito novo:** o LLM não fala MCP. Um **client MCP** descobre as tools (`tools/list`), converte para o formato
de tools da API OpenAI (Chat Completions), e executa via `tools/call` o que o modelo pedir, num loop até a
resposta final. É isso que Claude Desktop, VS Code e frameworks de agentes fazem por baixo.

**Pré-requisito:** exemplo 02 (usa o servidor CRM); Ollama no ar com `qwen3.5:4b`.

Lê `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODELO_CHAT` e `DATABASE_URL` (defaults locais). Para usar OpenAI ou
OpenRouter, basta trocar as variáveis.

Conversão (o `inputSchema` do MCP já é JSON Schema):

```js
tools.map(({ name, description, inputSchema }) => {
  const { $schema, ...parameters } = inputSchema;
  return { type: 'function', function: { name, description, parameters } };
});
```

## Como rodar

```bash
cd modulos/03-mcp
npm run ex03
# outra pergunta:
node exemplos/03-ponte-mcp-llm/agente.js "Qual o e-mail da Oficina Turbo?"
```

Em CPU o `qwen3.5:4b` gera ~5 tokens/s e o prompt com 3 tools é longo: a execução abaixo levou **~6 minutos**
(o primeiro passo inclui carregar o modelo). Com GPU ou API remota leva segundos.

## Saída esperada

```text
Tools enviadas ao modelo: buscar_clientes, listar_faturas, registrar_pagamento
Pergunta: Quanto a Padaria Pão Quente deve no total em faturas abertas?

[passo 1, 204.6s] modelo chamou buscar_clientes({"termo":"Padaria Pão Quente"})
  resultado: {"clientes":[{"id":1,"nome":"Padaria Pão Quente","email":"contato@paoquente.example","plano":"basico"}]}

[passo 2, 85.0s] modelo chamou listar_faturas({"cliente_id":1,"status":"aberta"})
  resultado: {"faturas":[{"id":2,"cliente_id":1,"valor":199.9,"vencimento":"2026-10-10","status":"aberta"},{"id":3,"cliente_id":1,"valor":49.9,"vencimento":"2026-10-20","status":"aberta"}],"total":249.8}

[passo 3, 58.8s] Resposta final: A Padaria Pão Quente deve no total 249,8 em faturas abertas.
```

O modelo seguiu as `instructions` do servidor (buscar o cliente antes) e encadeou duas tools sozinho.
Saídas de LLM variam; com `temperature: 0` costumam se repetir.

## Experimente

1. Pergunte algo que exija escrita ("Registre o pagamento da fatura 3"): o modelo chama `registrar_pagamento`.
   Em produção, o host pediria confirmação por causa de `readOnlyHint: false` (implemente esse "sim/não" no loop).
2. Piore a `description` de `listar_faturas` (ex.: "lista coisas") e veja se o modelo ainda acerta.
3. Aponte para o servidor do exemplo 04 (HTTP com token) trocando o `StdioClientTransport` por `StreamableHTTPClientTransport`.
