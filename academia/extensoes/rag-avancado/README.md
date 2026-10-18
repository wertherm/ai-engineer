# Extensão · RAG avançado (CRAG, Self-RAG, GraphRAG, híbrido e reranking)

O RAG básico (indexar, recuperar os k mais parecidos, gerar com citações) falha de formas previsíveis: recupera o trecho errado e responde
com confiança, não acha nada e inventa, ou não consegue responder perguntas que dependem do **conjunto** dos documentos. Esta extensão
organiza as técnicas que atacam cada falha, diz **quando não usar** e entrega um núcleo testável do fluxo corretivo (CRAG) para você evoluir.

| Item | Valor |
|---|---|
| Entra no roadmap | etapas 7 e 8 (avaliação, busca híbrida e reranking) e a extensão "CRAG e GraphRAG" — veja o [ROADMAP](../../ROADMAP.md) |
| Competências | [C12, C13, C14](../../competencias.md#catálogo) |
| Pré-requisitos | RAG com citações (etapa 6) e um conjunto de avaliação (etapa 7): **sem medir, nada daqui se justifica** |
| Material que já existe no repositório | [M01 · primeiro RAG](../../../modulos/01-fundamentos-ia-llms/exemplos/05-primeiro-rag/) · [M08 · padrões de RAG, busca híbrida com RRF](../../../modulos/08-arquitetura-de-sistemas-com-ia/exemplos/04-padroes-de-rag/) · [M08 · exercício agentic RAG](../../../modulos/08-arquitetura-de-sistemas-com-ia/exercicios/02-agentic-rag/) |
| Revisado em | 2026-10-18 |

## 1. Que falha cada técnica ataca

| Falha observada | Técnica | Custo | Quando **não** usar |
|---|---|---|---|
| a pergunta usa palavras diferentes das do texto | **reescrita/expansão da consulta** | 1 chamada de LLM por pergunta | a base é pequena e a pergunta já usa o vocabulário dela |
| termos exatos (códigos, nomes, números) escapam da busca vetorial | **busca híbrida** (lexical + vetorial, fusão por posição, como o RRF do M08) | um índice a mais | só há texto corrido, sem termos exatos relevantes |
| o trecho certo vem, mas em 5º lugar, e o corte em k=3 o perde | **reranking** (modelo mais preciso reordena os candidatos) | latência e custo por candidato | a recuperação já acerta em 1º lugar (meça: hit@1 vs hit@5) |
| o trecho é pequeno demais para fazer sentido | **recuperar pequeno, entregar grande** (trecho com o parágrafo/seção ao redor) | mais tokens | os documentos já são curtos |
| a recuperação vem **errada** e o modelo responde mesmo assim | **RAG corretivo** (avaliar a recuperação e agir: usar, complementar, reescrever ou abster-se) — CRAG | 1 avaliação por trecho | se um bom limiar de similaridade + abstenção (etapa 7) já resolve |
| o modelo deveria decidir **se** precisa recuperar e se a resposta é sustentada | **Self-RAG** (autorreflexão) | treinar/ajustar um modelo; ou aproximar por prompts em vários passos | não há dados nem orçamento para treinar |
| perguntas sobre o **todo** ("quais os temas recorrentes?", "como X se relaciona com Y em todos os documentos?") | **GraphRAG** (índice em grafo + resumos por comunidade) | indexação cara (muitas chamadas de LLM) | perguntas pontuais sobre um trecho: o RAG comum é mais barato e basta |
| o próprio agente deve decidir o que buscar, em vários passos | **RAG agêntico** | mais passos, mais custo e mais risco | uma recuperação resolve ([M08 · exercício 02](../../../modulos/08-arquitetura-de-sistemas-com-ia/exercicios/02-agentic-rag/)) |

Regra de ouro: **comece pelo mais barato que o seu conjunto de avaliação mostre que falta**. Cada técnica acima só entra com um antes/depois
medido (hit@k, MRR, fidelidade, taxa de abstenção correta, custo e latência por pergunta).

## 2. As técnicas, em uma página cada

### CRAG · Corrective Retrieval Augmented Generation

Artigo: Yan, Gu, Zhu, Ling, [*Corrective Retrieval Augmented Generation*](https://arxiv.org/abs/2401.15884). Um **avaliador de recuperação** leve pontua a qualidade
dos documentos recuperados para a consulta e, com base nessa confiança, o sistema escolhe uma ação: usar os documentos, descartá-los e buscar em outra
fonte (os autores usam busca na web em larga escala) ou combinar as duas coisas; um passo de **decompor e recompor** filtra os documentos até as
informações-chave. A ideia que importa para engenharia: *o sistema avalia a própria recuperação antes de gerar*, e a **abstenção** é uma ação válida.

No código ([`referencia/crag.mjs`](referencia/crag.mjs)) o fluxo é: recuperar → avaliar cada trecho → classificar (**correta**, **ambígua** ou
**incorreta**, por dois limiares) → agir (usar os bons; complementar; reescrever e recuperar de novo; abster-se). Pontos de projeto que o teste fixa: o gerador
**nunca** recebe trecho abaixo do limiar mínimo; trecho que o avaliador esqueceu vale nota 0; o número de reescritas é limitado; busca externa é uma função
injetada (**use lista de permissão**, tudo que vem da web é dado não confiável).

### Self-RAG

Artigo: Asai, Wu, Wang, Sil, Hajishirzi, [*Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection*](https://arxiv.org/abs/2310.11511). Um único modelo é
treinado para decidir **quando** recuperar (em vez de sempre recuperar k trechos) e para emitir *tokens de reflexão* que avaliam os trechos recuperados e a
própria resposta, permitindo ajustar o comportamento na inferência. Sem treinar um modelo, uma aproximação prática é uma cadeia de prompts: decidir se precisa
recuperar → recuperar → julgar cada trecho → gerar → verificar se cada afirmação é sustentada pelos trechos (a mesma estrutura do fluxo corretivo acima).

### GraphRAG

Artigo: Edge et al. (Microsoft), [*From Local to Global: A Graph RAG Approach to Query-Focused Summarization*](https://arxiv.org/abs/2404.16130). Um LLM extrai das fontes um **grafo de entidades**; o grafo é
dividido em comunidades de entidades muito ligadas, e cada comunidade ganha um resumo pré-gerado. Na consulta, cada resumo contribui com uma resposta parcial e as parciais
são combinadas. Os autores reportam respostas mais abrangentes e diversas que o RAG de linha de base em perguntas "globais" sobre corpora na casa de um milhão de tokens.
O preço é uma **indexação cara**. Use quando as perguntas são sobre o conjunto; senão, não.

> **Siglas parecidas** (KG-RAG, KAG, K-RAG...) variam entre autores e produtos. Em estudo e em código, use sempre **a definição e o artigo**, não a sigla.

### Híbrido e reranking

A busca híbrida e a fusão por posição já estão no [exemplo 04 do módulo 08](../../../modulos/08-arquitetura-de-sistemas-com-ia/exemplos/04-padroes-de-rag/). O **reranking** ainda é lacuna
do repositório: o desenho é pegar 20 a 50 candidatos baratos e reordenar com um modelo mais preciso (um reranker dedicado ou um LLM com um prompt de nota), medindo contra o
baseline da etapa 7 (hit@1 e MRR) e anotando o custo por pergunta.

## 3. Medir é obrigatório

| Métrica | Pergunta que responde | Onde |
|---|---|---|
| hit@k, MRR | o trecho certo está entre os k? em que posição? | [M01 · exercício 02](../../../modulos/01-fundamentos-ia-llms/exercicios/02-rag-chunking-top-k/), [M11 · exercício 02](../../../modulos/11-capstone-micro-saas/exercicios/02-avaliacao-no-ci/) |
| fidelidade | cada afirmação da resposta é sustentada pelos trechos citados? | etapa 7 (lacuna do repositório) |
| abstenção correta | em perguntas **sem** resposta na base, o sistema diz que não sabe? | etapa 7 |
| custo e latência por pergunta | quanto a técnica custa? | etapa 14 |

## 4. Rodar o núcleo

```bash
node --test "academia/extensoes/rag-avancado/referencia/*.test.mjs"
```

```js
import { responderComCorrecao } from './referencia/crag.mjs';

const r = await responderComCorrecao({
  pergunta: 'Quantos dias de férias eu tenho?',
  recuperar: (consulta) => minhaBuscaHibrida(consulta),                 // sua recuperação (pgvector, RRF...)
  avaliar: (pergunta, docs) => meuJuizDeRelevancia(pergunta, docs),     // [{ id, nota: 0..1 }] (regra, reranker ou LLM-juiz calibrado)
  reescrever: (pergunta, tentativa) => reescreverComLLM(pergunta),      // opcional
  gerar: (pergunta, docs) => responderComCitacoes(pergunta, docs),
  limiares: { correto: 0.7, incorreto: 0.3 }, maxReescritas: 1,
});
// r.abstencao === true -> nada de palpite; r.passos mostra o rastro de decisão para auditar
```

O núcleo foi testado com funções simuladas; ele **não** foi ligado a um LLM real neste repositório.

## 5. Exercícios

1. **Antes/depois.** Parta do RAG da sua etapa 6 e do conjunto de avaliação da etapa 7 (≥ 20 perguntas, ≥ 5 sem resposta). Ligue `responderComCorrecao` ao seu RAG.
   *Critério:* tabela com hit@k, fidelidade, abstenção correta, custo e latência, **antes e depois**, e uma conclusão: manter, ajustar limiares ou descartar.
2. **Calibre o juiz de relevância.** Rotule 30 pares (pergunta, trecho) como relevante ou não; compare regra, reranker e LLM-juiz. *Critério:* escolha dos limiares justificada pela curva de
   acertos/erros, não por intuição.
3. **Abstenção.** Mostre 5 perguntas sem resposta que o RAG básico responde errado e o corretivo se abstém. *Critério:* teste automatizado.
4. **GraphRAG em miniatura (opcional).** Em 10 documentos, extraia entidades e relações com um LLM, agrupe e resuma; compare com o RAG comum em 3 perguntas globais e 3 pontuais. *Critério:* custo da
   indexação medido e a conclusão sobre quando vale.

## 6. Critérios de aceitação e rubrica

| ID | Critério (objetivo) |
|---|---|
| CA1 | `node --test "academia/extensoes/rag-avancado/referencia/*.test.mjs"` passa |
| CA2 | Exercício 1 entregue com a tabela antes/depois e o conjunto de avaliação versionado |
| CA3 | O gerador nunca recebe trecho abaixo do limiar mínimo (teste) e a abstenção é testada |
| CA4 | Nenhuma técnica adotada sem ganho medido |

| Critério | 1 | 2 | 3 |
|---|---|---|---|
| **Avaliação** (C12, C13) | "a resposta parece boa" | métricas de recuperação e de abstenção | fidelidade medida e juiz calibrado com rótulos próprios |
| **Escolha da técnica** (C14) | usa a mais famosa | liga a técnica à falha observada | decide pelo custo×ganho medido e registra em ADR |

## 7. Fontes (abertas em 2026-10-18)

[CRAG](https://arxiv.org/abs/2401.15884) · [Self-RAG](https://arxiv.org/abs/2310.11511) · [Graph RAG](https://arxiv.org/abs/2404.16130) ·
[Anthropic · Building effective agents](https://www.anthropic.com/research/building-effective-agents) (comece simples, meça).
