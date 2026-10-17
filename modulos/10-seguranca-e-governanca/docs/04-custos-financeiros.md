# 04 · Custos financeiros em IA

## Objetivo

Estimar o custo total de uma feature de IA (não só o preço por token), comparar API x self-hosting, encontrar
o ponto de equilíbrio e proteger o orçamento com alerta, corte e cota por usuário.

## Explicação

### De onde vem o custo

| Componente | O que pesa | Alavanca |
|---|---|---|
| Tokens de **entrada** | contexto do RAG, histórico, system prompt | prompt caching, reduzir contexto, resumir histórico |
| Tokens de **saída** | normalmente 3–5x mais caros que entrada | `max_tokens`, formato curto (JSON), streaming não reduz custo |
| **Retentativas** | timeouts, JSON inválido | validar e reparar localmente antes de chamar de novo |
| **Guardrails** | classificador de entrada/saída, LLM-juiz | modelo pequeno, heurística antes, amostragem |
| **Embeddings e vetor** | indexação e armazenamento | reindexar só o que mudou |
| **Self-hosting** | GPU ligada 24 h (use ou não), engenharia, plantão | autoscaling, quantização, batching (ver trilha vLLM) |
| **Pessoas** | revisão humana, avaliação, operação | revisar por amostragem e por risco |

Analogia: API é táxi (paga por corrida, ótimo com pouco uso); self-hosting é carro próprio (custo fixo alto,
compensa com muito uso e motorista disponível).

### Ponto de equilíbrio

Custo API cresce linear com o volume; custo self-hosting é quase fixo até lotar a GPU:

```
equilíbrio (chamadas/dia) = custo_self_hosting_mensal / dias / custo_por_chamada_api
```

Com as premissas **hipotéticas** do [exemplo 05](../exemplos/05-custos-e-orcamento/): API US$ 1.507/mês,
self-hosting US$ 6.650/mês com **2,4%** de utilização; equilíbrio em ~88 mil chamadas/dia (4,4x o volume atual).
O cache de prompt economizou 36% da conta da API.

### Orçamento como controle de segurança

Consumo sem limite é risco de segurança (OWASP LLM10): um agente em loop ou um abusador gera milhares de
chamadas. Três camadas:

1. **Cota por usuário/cliente** (barra o abusador sem derrubar os outros).
2. **Orçamento por feature** com **alerta em 80%** e **corte em 100%** (resposta degradada, nada cobrado).
3. **Rate limit** na borda ([módulo 03, exemplo 04](../../03-mcp/exemplos/04-mcp-http-producao/)).

Resultado real do exemplo 05: sem cota por usuário, um loop esgotou o orçamento e **181 chamadas de clientes
legítimos** foram bloqueadas; com cota de US$ 0,25/usuário/dia, 0 bloqueios de legítimos e gasto de US$ 3,93 de 5,00.

## Código mínimo

```js
const custo = (tokensEntrada * precoEntrada + tokensSaida * precoSaida) / 1e6;
const fracao = gastoHoje / orcamentoDia;
const estado = fracao >= 1 ? 'BLOQUEADO' : fracao >= 0.8 ? 'ALERTA' : 'ok';
```

## Na prática

- [Exemplo 05 · custos e orçamento](../exemplos/05-custos-e-orcamento/)
- Custo por token medido em vLLM, TTFT/ITL: [trilha LLMOps](../../../trilhas-extras/llmops-vllm-openshift/)
- System design com custo: [módulo 12, exercício 02](../../12-carreira/exercicios/02-system-design-com-custo/)

## Armadilhas

- **Copiar preço de memória ou de blog**: preços mudam. Os números do exemplo são hipotéticos; troque pelos
  da página oficial do provedor, com a data.
- **Esquecer a saída**: o token de saída costuma custar várias vezes o de entrada.
- **Self-hosting "de graça"**: GPU ociosa custa igual. Olhe a utilização (2,4% no exemplo).
- **Checar e depois gravar sem atomicidade**: com várias réplicas, duas chamadas passam no mesmo centavo.
  Em produção, reserve o orçamento numa transação (`UPDATE ... SET gasto = gasto + $1 WHERE gasto + $1 <= limite`)
  ou use um contador atômico (Redis `INCRBYFLOAT`).
- **Só orçamento global**: um usuário em loop derruba a feature para todos (veja o exemplo 05 sem `--com-cota`).

## Fontes

- OWASP LLM10 Unbounded Consumption: https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/
- Prompt caching (OpenAI): https://platform.openai.com/docs/guides/prompt-caching · (Anthropic): https://docs.claude.com/en/docs/build-with-claude/prompt-caching
- Páginas de preço oficiais (confira antes de usar números): https://openai.com/api/pricing/ · https://www.anthropic.com/pricing
- FinOps Foundation, FinOps for AI: https://www.finops.org/topic/finops-for-ai/
