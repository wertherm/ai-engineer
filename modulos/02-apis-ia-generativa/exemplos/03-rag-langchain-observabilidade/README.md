# Exemplo 03 · RAG com LangChain.js, retentativas e logs estruturados

**Conceito novo:** orquestrar um fluxo de RAG como uma sequência de Runnables (LCEL), com retentativa
com backoff no passo do LLM e um callback que emite um trace em JSON (uma linha por evento).

**Pré-requisito:** [exemplo 02](../02-custo-e-cache/) (Postgres no schema `m02`) e o [doc 03](../../docs/03-rag-backend-e-observabilidade.md).

Arquivos: [`main.js`](main.js) (ingestão + chain), [`corpus.js`](corpus.js) (6 políticas fictícias),
[`observabilidade.js`](observabilidade.js) (callback `LogJson`).

O exemplo **injeta falhas**: as 2 primeiras chamadas ao chat recebem HTTP 503 (como um provedor
sobrecarregado), para você ver o retry acontecer sem derrubar nada.

## Como rodar

```bash
cd modulos/02-apis-ia-generativa
npm run ex03                       # ou: node exemplos/03-rag-langchain-observabilidade/main.js "sua pergunta"
FALHAS=0 npm run ex03              # sem falhas injetadas
```

## Saída esperada

Saída real (a 1ª execução também imprime `ingestão: 6 documentos indexados em m02.rag_chunks`):

```
pergunta: Comprei um fone há 10 dias. Ainda posso trocar?  (falhas injetadas: 2)
{"ts":"19:19:54.788","evento":"passo.inicio","run":"01a14628","ms":0,"passo":"rag.chain"}
{"ts":"19:19:54.793","evento":"passo.inicio","run":"01a14628","ms":0,"passo":"rag.recuperar","pai":"01a14628"}
{"evento":"recuperados","docs":["trocas.md:0.630","garantia.md:0.399"]}
{"ts":"19:19:55.499","evento":"passo.fim","run":"01a14628","ms":706,"passo":"rag.recuperar"}
{"ts":"19:19:55.501","evento":"passo.inicio","run":"01a14628","ms":0,"passo":"rag.prompt","pai":"01a14628"}
{"ts":"19:19:55.503","evento":"passo.fim","run":"01a14628","ms":2,"passo":"rag.prompt"}
{"ts":"19:19:55.527","evento":"llm.erro","run":"01a14628","ms":13,"erro":"503 servidor sobrecarregado (falha injetada)"}
{"evento":"retentativa","tentativa":1,"status":503,"erro":"503 servidor sobrecarregado (falha injetada)"}
{"ts":"19:19:56.978","evento":"llm.erro","run":"01a14628","ms":4,"erro":"503 servidor sobrecarregado (falha injetada)"}
{"evento":"retentativa","tentativa":2,"status":503,"erro":"503 servidor sobrecarregado (falha injetada)"}
{"ts":"19:20:26.935","evento":"llm.fim","run":"01a14628","ms":27020,"tokens_entrada":142,"tokens_saida":29}
{"ts":"19:20:26.937","evento":"passo.fim","run":"01a14628","ms":32149,"passo":"rag.chain"}

resposta: Sim, você pode trocar o produto porque eletrônicos têm um prazo de troca de 7 dias após o recebimento [trocas.md].
```

Leia o trace:

- A busca acertou (`trocas.md` com similaridade 0,630, bem acima do 2º trecho).
- As duas falhas 503 foram retentadas com espera crescente (~1,4 s entre a 1ª e a 2ª; p-retry com jitter).
- **A resposta está errada**: 10 dias > 7 dias, então a troca **não** cabe. O contexto certo chegou, mas o
  modelo pequeno, sem raciocínio (`reasoning_effort: "none"`), concluiu mal. RAG resolve "o que o modelo
  sabe"; não resolve "como ele raciocina". Por isso RAG precisa de **avaliação** (ver trilha
  [LLMOps → avaliação](../../../../trilhas-extras/llmops-vllm-openshift/docs/05-avaliacao.md)).

## Experimente

1. Peça explicitamente a comparação no system prompt ("compare o prazo do cliente com o prazo da política
   antes de responder") e veja se a resposta muda — engenharia de prompt aplicada a precisão.
2. `FALHAS=5 npm run ex03`: com `stopAfterAttempt: 4`, a chain desiste e lança o erro. Onde aparece no trace?
3. Troque a ordem para `llm.withRetry({...}).withConfig({ runName })` e rode de novo: a linha
   `retentativa` some (o `withConfig` recria o binding e descarta o `onFailedAttempt`). Volte a ordem certa.
