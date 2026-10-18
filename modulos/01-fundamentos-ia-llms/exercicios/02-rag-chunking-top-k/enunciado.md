# Exercício 02 · Melhorar o RAG: chunking e top-k medidos

## Contexto

O [exemplo 05](../../exemplos/05-primeiro-rag/) quebra os documentos por parágrafo e busca os 3 trechos mais
parecidos. Isso é bom? Sem medir, é opinião. Aqui você mede **só o retrieval** (sem o LLM gerar texto: mais
rápido e determinístico), porque se o trecho certo não vem, nenhum prompt salva a resposta.

## Requisitos

1. Implemente 3 estratégias de chunking sobre o mesmo `corpus/` do exemplo 05:
   - `documento`: o arquivo inteiro é 1 chunk;
   - `paragrafo`: a função `chunkPorParagrafo` de `lib/rag.js` (parágrafo + título);
   - `janela160`: janelas fixas de 160 caracteres com sobreposição de 40, **sem** título.
2. Indexe cada uma numa coleção separada da tabela `m01.chunks` (coluna `colecao`).
3. Monte um conjunto de avaliação com 10 perguntas escritas com **palavras diferentes** do texto e, para cada
   uma, a expressão que precisa aparecer no contexto recuperado (ex.: `"R$ 90"`).
4. Para `k = 1` e `k = 3`, calcule: **hit@k**, **MRR** e **tamanho médio do contexto** (caracteres que iriam
   para o prompt).

## Critério de pronto

- Tabela com 6 linhas (3 estratégias × 2 valores de k).
- Uma conclusão em 2 frases: qual estratégia você colocaria em produção e por quê.

## Dicas

- `buscar(db, colecao, pergunta, k)` em `lib/rag.js` já devolve os trechos ordenados.
- MRR: para cada pergunta, `1 / posição do primeiro trecho certo` (0 se não veio); depois a média.
- Só embeddings: ~10 s de trabalho de modelo, mas em CPU disputada pode levar 2 min.

## Solução

[`solucao/main.js`](solucao/main.js). Rode com `npm run exercicio02`. Saída real:

```text
┌─────────┬─────────────┬────────┬───┬─────────┬────────┬────────────────────────┐
│ (index) │ chunking    │ chunks │ k │ hit@k   │ MRR    │ contexto médio (chars) │
├─────────┼─────────────┼────────┼───┼─────────┼────────┼────────────────────────┤
│ 0       │ 'documento' │ 6      │ 1 │ '9/10'  │ '0.90' │ 472                    │
│ 1       │ 'documento' │ 6      │ 3 │ '10/10' │ '0.95' │ 1442                   │
│ 2       │ 'paragrafo' │ 17     │ 1 │ '9/10'  │ '0.90' │ 171                    │
│ 3       │ 'paragrafo' │ 17     │ 3 │ '10/10' │ '0.95' │ 535                    │
│ 4       │ 'janela160' │ 24     │ 1 │ '8/10'  │ '0.80' │ 151                    │
│ 5       │ 'janela160' │ 24     │ 3 │ '10/10' │ '0.87' │ 414                    │
└─────────┴─────────────┴────────┴───┴─────────┴────────┴────────────────────────┘
hit@k = a resposta estava em algum dos k trechos | MRR = média de 1/posição do 1º trecho certo
```

Conclusão desta medição: `paragrafo` empata com `documento` em hit@k e MRR mandando **~1/3 do contexto**
(menos tokens, menos custo, menos ruído para o LLM). `janela160` é a pior em MRR: corta frases no meio e
perde o título que dava contexto ao trecho. Com corpus pequeno o documento inteiro "funciona"; com
documentos longos ele estoura a janela de contexto e dilui a similaridade.

## Versão Python

[`solucao/python/solucao.py`](solucao/python/solucao.py): as mesmas 3 estratégias, as mesmas 10 perguntas, usando
[`comum_py/rag.py`](../../comum_py/rag.py) (`psycopg` 3 + `pgvector`) na tabela `m01.chunks_py`.

**Como rodar** (da pasta do módulo, depois de `uv sync`; só embeddings, ~20 s):

```bash
uv run python exercicios/02-rag-chunking-top-k/solucao/python/solucao.py
```

**Saída esperada (Python)** — saída real:

```text
chunking   chunks  k  hit@k   MRR  contexto médio (chars)
documento       6  1   9/10  0.90                     472
documento       6  3  10/10  0.95                    1442
paragrafo      17  1   9/10  0.90                     171
paragrafo      17  3  10/10  0.95                     535
janela160      24  1   8/10  0.80                     151
janela160      24  3  10/10  0.87                     414
hit@k = a resposta estava em algum dos k trechos | MRR = média de 1/posição do 1º trecho certo
```

Tabela idêntica à do JS (mesmos embeddings, mesma busca). Na primeira execução a linha `janela160 k=1` deu 150 em
vez de 151: `round(150.5)` no Python dá 150 (arredonda para o par), `Math.round` do JS dá 151. A solução usa
`int(x + 0.5)` para comparar as duas versões.
