# Exemplo 04 · Orquestração multiagente com o Google ADK (no LLM local)

**Conceito novo**: orquestrar **vários agentes e LLMs** com o **ADK (Agent Development Kit)** do Google
(`@google/adk` 2.3.0): um `Workflow` com dois `LlmAgent` (pesquisador com ferramenta, redator) e um nó
de **código** que verifica as citações, passando dados pelo **estado da sessão** (`outputKey`,
`{pergunta}`, `{evidencias}`).

O ADK TypeScript só traz modelos Gemini/Vertex/Apigee/Chrome; os conectores LiteLLM e Ollama existem
apenas no ADK Python (conferido na documentação oficial). Por isso este exemplo **estende `BaseLlm`**
([`ollama-llm.js`](ollama-llm.js)) e traduz o formato do Gemini para Chat Completions — o ADK roda
inteiro no Ollama local, sem chave. Usar Gemini de verdade (`model: 'gemini-2.5-flash'` + `GOOGLE_API_KEY`)
fica **não executado localmente** (exige conta Google). Detalhes e diagrama no
[doc 02](../../docs/02-rag-agentes-e-mcp.md#orquestração-multiagente-com-o-google-adk).

**Pré-requisito**: [entrega 1](../01-entrega-1-rag-cli/) (`npm run seed`). A ferramenta do pesquisador
chama a mesma fachada `servico.buscar` da API, então isolamento por tenant, PII e auditoria (canal `adk`)
valem aqui também.

## Como rodar

```bash
cd modulos/11-capstone-micro-saas
npm run e4                                   # tenant acme, pergunta padrão (3 chamadas ao LLM: lento em CPU)
npm run e4 -- padaria "Posso tirar férias em dezembro e dividir em quantas partes?"
MODELO_REDATOR=qwen3.5:4b MODELO_PESQUISADOR=qwen3.5:4b npm run e4   # um modelo por agente
npx vitest run exemplos/04-orquestracao-adk  # testes da tradução Gemini <-> OpenAI (sem rede)
```

## Saída esperada

Saída real da versão final dos prompts:

```
Tenant: Acme Software
Pergunta: Quantos dias por semana posso trabalhar de casa e quanto recebo de auxílio para isso?

 407.4s [pesquisador] chama buscar_politicas({"consulta":"auxílio home office"})
   0.7s [pesquisador] tool devolveu home-office.md, home-office.md, home-office.md
 391.5s [pesquisador] - Auxílio home office de R$ 150,00 por mês [home-office.md]
 165.1s [redator] Não encontrei informações sobre o número de dias por semana disponíveis para trabalho remoto. Encontrei apenas que o auxílio home office é de R$ 150,00 por mês [home-office.md].
   0.0s [verificar] {"verificado":true,"citados":["home-office.md"],"lidos":["home-office.md"]}

estado final: ["pergunta","evidencias","resposta"] · total 964.6s
```

**A lição está na primeira versão.** Com os prompts iniciais (o redator não era instruído a admitir
lacunas), a mesma execução produziu uma resposta **errada e com citação válida**:

```
 313.1s [pesquisador] - Auxílio home office de R$ 150,00 por mês [home-office.md]
 157.6s [redator] Você pode trabalhar de casa todos os dias da semana, conforme a política de home office descrita no arquivo [home-office.md]. O auxílio para esse trabalho remoto é de R$ 150,00 por mês.
   0.0s [verificar] {"verificado":true,"citados":["home-office.md"],"lidos":["home-office.md"]}
```

A política diz "3 dias remotos e 2 presenciais" — o trecho **estava** no resultado da busca, mas o
pesquisador (modelo de 4B) resumiu só um fato, e o redator completou o resto com suposição. O verificador
aprovou porque ele checa **de onde** veio a citação, não **se o fato está no trecho**. Três aprendizados:
(1) em pipeline multiagente, a perda de informação entre agentes é o defeito típico; (2) "citação
válida" não é "resposta correta" — o próximo nível é um verificador de **fidelidade** (cada frase
sustentada por um trecho, com LLM-juiz ou NLI); (3) o prompt "diga que não encontrou essa parte" troca
alucinação por resposta incompleta e honesta, que é o comportamento certo para um produto de RH.

Avisos que o ADK 2.3.0 imprime (silenciados com `setLogLevel(LogLevel.ERROR)`): `Class Workflow is
experimental` e, se você trocar por `SequentialAgent`, `SequentialAgent is deprecated in favor of Workflow`.

Testes do adaptador:

```
 ✓ exemplos/04-orquestracao-adk/ollama-llm.test.js > adaptador OllamaLlm > converte o Schema do Gemini para JSON Schema 8ms
 ✓ exemplos/04-orquestracao-adk/ollama-llm.test.js > adaptador OllamaLlm > converte system, tool call e tool response 2ms
 ✓ exemplos/04-orquestracao-adk/ollama-llm.test.js > adaptador OllamaLlm > converte a resposta com tool_calls em functionCall 1ms
      Tests  3 passed (3)
```

## Experimente

1. Faça o pesquisador **não resumir**: troque o `FunctionTool` para devolver os trechos e use `outputKey` só no redator, ou peça ao pesquisador "copie os trechos literalmente". Compare a resposta sobre os dias de home office.
2. Troque o nó `verificar` por um `LlmAgent` "revisor" que recebe evidências e resposta e diz se cada frase está sustentada — e meça quanto tempo (e quantos tokens) isso adiciona.
3. Use o `MCPToolset` do ADK (`@google/adk` → `MCPToolset` com `StreamableHTTPConnectionParams`) apontando para `http://127.0.0.1:31180/mcp` com o header `Authorization: Bearer sk-acme-demo` no lugar do `FunctionTool`: o pesquisador passa a usar o Micro-SaaS **pelo MCP**, como um agente externo.
