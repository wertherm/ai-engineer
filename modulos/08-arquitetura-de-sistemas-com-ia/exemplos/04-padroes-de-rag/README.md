# 04 · Padrões de RAG medidos: Basic × Hybrid Search (RRF) × Multi-Index

**Conceito novo:** comparar estratégias de **recuperação** com uma métrica (recall@k) num conjunto de perguntas com
gabarito, em vez de escolher "no feeling". Hybrid Search = pgvector (cosseno) + full-text (`tsvector` em português)
fundidos por **RRF** (Reciprocal Rank Fusion) em uma única query SQL. Multi-Index em duas variantes: **federado**
(busca em todos os índices e funde) e **roteado** (escolhe um índice antes). Teoria em
[doc 03](../../docs/03-padroes-de-design-de-ia.md#rag-basic-hybrid-multi-index-e-agentic).

Arquivos: `corpus.js` (14 documentos em 2 índices, 10 perguntas, indexação em `m08.rag_docs`), `buscas.js`
(as 4 estratégias com a mesma assinatura), `main.js` (avaliação).

**Pré-requisito:** [exemplo 03](../03-multiagente-com-fila/). Ollama com `qwen3-embedding:0.6b` e Postgres com pgvector.

## Como rodar

```bash
npm run ex04     # só embeddings (sem chat): ~10 s
```

## Saída esperada

```text
estrategia           | recall@1 | recall@3 | ms/consulta | erros no top-1 (gabarito→veio)
---------------------|----------|----------|-------------|-------------------------------
basic                | 9/10     | 10/10    | 4.2         | p3→p7
hybrid               | 9/10     | 10/10    | 5.1         | d4→d1
multi-index federado | 9/10     | 10/10    | 15.8        | d4→d1
multi-index roteado  | 8/10     | 9/10     | 6.3         | p5→d6 d4→d1
```

Como ler (é aqui que mora a arquitetura):

- **basic** erra `POL-SEC-14` → devolve `POL-SEC-15`: para o embedding, códigos quase iguais são "a mesma coisa".
- **hybrid** acerta o código (o full-text casa o lexema exato), mas erra "parcela vendida duas vezes" → `d1`, porque
  o full-text casou "parcel(adas)" e "vend(as)" no documento errado. Híbrido **troca** erros, não elimina todos.
- **multi-index roteado** acrescenta um erro novo: o roteador mandou "ChatGPT com informações de clientes" para o
  índice de produtos (a descrição menciona "clientes"). O roteador vira ponto único de falha; o **federado** não tem
  esse risco, mas custa uma consulta por índice (3× a latência aqui).

## Experimente

1. Tire o desempate `min(pos) FILTER (WHERE fonte = 'txt')` do SQL em `buscas.js` e veja o RRF empatar `p3`/`p7`.
2. Troque o `| ` (OR) por `websearch_to_tsquery` (AND) na consulta full-text e veja o recall do hybrid cair.
3. Crie um índice HNSW (`CREATE INDEX ON m08.rag_docs USING hnsw (emb vector_cosine_ops)`) e meça com 10 mil documentos.

## Versão Python

[`python/corpus.py`](python/corpus.py) (mesmo corpus e mesmas perguntas), [`python/buscas.py`](python/buscas.py)
(mesmo SQL do RRF, com o desempate `min(pos) FILTER (WHERE fonte = 'txt')` e o OR de lexemas) e
[`python/main.py`](python/main.py). O vetor vai como parâmetro do `pgvector.psycopg` (`register_vector` +
`Vector`), sem `numpy`. Tabela própria: `m08.rag_docs_py`.

**Como rodar** (da pasta do módulo, depois de `uv sync`):

```bash
uv run python exemplos/04-padroes-de-rag/python/main.py   # só embeddings: ~15 s (~35 s na 1ª vez, indexando)
```

**Saída esperada (Python)** — saída real:

```text
estrategia           | recall@1 | recall@3 | ms/consulta | erros no top-1 (gabarito→veio)
---------------------|----------|----------|-------------|-------------------------------
basic                | 9/10     | 10/10    | 4.0         | p3→p7
hybrid               | 9/10     | 10/10    | 7.2         | d4→d1
multi-index federado | 9/10     | 10/10    | 11.6        | d4→d1
multi-index roteado  | 8/10     | 9/10     | 4.1         | p5→d6 d4→d1
```

Recall@1 e recall@3 **idênticos** aos do JS, com os mesmos erros no top-1: mesmo modelo de embedding, mesmo SQL.
