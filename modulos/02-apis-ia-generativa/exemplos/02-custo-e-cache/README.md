# Exemplo 02 · Custo por tokens, reuso de contexto e cache de respostas

**Conceito novo:** medir custo com o `usage` **real** da API e reduzi-lo de três jeitos: prompt mais enxuto,
**reuso de contexto** (cache de prefixo do servidor, `cached_tokens`) e **cache de respostas** no Postgres
(schema `m02`, tabela `cache_respostas`, chave = SHA-256 da requisição, com TTL).

**Pré-requisito:** [exemplo 01](../01-prompt-chaining-e-templates/) e o [doc 02](../../docs/02-consistencia-e-custo.md).

Arquivos: [`main.js`](main.js) (as três medições) e [`cache-respostas.js`](cache-respostas.js) (`comCache()`).

Os preços em `main.js` são **ilustrativos** (US$ 0,40 entrada · 0,10 entrada em cache · 1,60 saída por
1 M tokens). Troque pelos da página de preços do seu provedor; no modelo local o custo por token é zero.

## Como rodar

```bash
cd modulos/02-apis-ia-generativa
npm run ex02
```

## Saída esperada

Saída real (~3,5 min; máquina compartilhada com outros processos usando o mesmo Ollama):

```
A) Prompt prolixo vs enxuto (max_tokens=1: só medimos a entrada)
   prolixo  entrada=104 (cache=100) saida=1 custo=US$ 0.000013
   enxuto   entrada=33 (cache=29) saida=1 custo=US$ 0.000006

B) Reuso de contexto (mesmo system prompt, perguntas diferentes)
   Prazo de troca da categoria 3? → 58240 ms · entrada=806 (cache=0) saida=15 custo=US$ 0.000346
   Prazo de troca da categoria 9? → 97467 ms · entrada=806 (cache=294) saida=15 custo=US$ 0.000258

C) Cache de respostas (Postgres, schema m02)
   chamada 1: MISS 28503 ms · tokens cobrados=27 · "Brasília"
   chamada 2: HIT  2 ms · tokens cobrados=0 · "Brasília"
```

Como ler:

- **A)** O prompt prolixo tem **3× mais tokens** (104 vs 33) para a mesma tarefa. Na 1ª execução os dois
  vieram com `cache=0`; acima é a 2ª execução: o servidor ainda tinha esses prefixos e cobrou quase tudo como
  cache. Cache de prefixo funciona **entre execuções** também.
- **B)** A 2ª pergunta reaproveitou **294 dos 806** tokens do system prompt (custo −25%). Não foram todos
  porque o servidor guarda o cache por "slot" e outros processos usando o mesmo Ollama despejam parte dele.
  A latência da 2ª foi **maior** por causa da fila de outros processos — em máquina compartilhada, confie no
  `cached_tokens`, não no relógio.
- **C)** O cache de respostas devolve em **2 ms** com **0 tokens**: nenhuma otimização de prompt chega perto.

Para conferir o que ficou no banco: `docker compose -f infra/compose.yaml exec postgres psql -U ia -d ia -c "select left(chave,12), resposta->>'texto', criado_em from m02.cache_respostas"` (a partir da raiz).

## Experimente

1. Ponha um timestamp (`new Date().toISOString()`) no **início** do system prompt da parte B e rode: o
   `cached_tokens` da 2ª pergunta cai para perto de zero. Mova o timestamp para o **fim** e compare.
2. Mude `max_tokens` da requisição da parte C de 20 para 21: a chave muda e o cache dá MISS. Tudo que muda a
   resposta precisa estar na chave — e só isso.
3. Use `ttlHoras = 0` em `comCache` e veja toda chamada virar MISS.
