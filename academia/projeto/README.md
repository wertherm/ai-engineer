# Projeto evolutivo · Assistente Técnico

Um único projeto, construído e evoluído ao longo das 16 etapas. **Cada aluno constrói o seu**, em
`academia/alunos/<aluno>/projeto/`; as lições dizem o incremento de cada etapa e os critérios para aceitá-lo. Este
arquivo é a especificação; o código fica com o aluno.

## O que o projeto é

Um assistente técnico que:

1. recebe perguntas;
2. recupera informações de documentos;
3. responde de forma fundamentada e mostra as fontes;
4. avalia quando não há evidência suficiente (e se abstém);
5. usa ferramentas externas por interfaces bem definidas;
6. pode integrar MCP quando apropriado;
7. aplica controles de segurança e aprovação humana;
8. registra execuções, erros, latência e custos;
9. tem testes reproduzíveis;
10. tem documentação suficiente para outra pessoa executá-lo.

**Corpus padrão:** a documentação deste repositório (`modulos/*/docs/`, `referencia/`): é texto técnico em português,
versionado, com respostas verificáveis. O aluno pode trocar por um corpus próprio, desde que seja de uso livre e não
contenha dados pessoais ou segredos.

## Princípios

- **Proporcional ao tempo:** 48 horas no total. Prefira entregas pequenas, funcionais e verificáveis a recursos demais.
- **Incremental:** cada etapa reaproveita o código da anterior. Nada é descartado; refatore.
- **Ferramenta é escolha, objetivo é fixo:** a stack abaixo é uma referência. Trocar de biblioteca ou de banco é
  permitido se for registrado em um ADR e os critérios da etapa continuarem sendo cumpridos.
- **Sem dependências desnecessárias:** a etapa ensina o conceito antes do framework. Só compare frameworks quando
  houver valor pedagógico.
- **Sem segredos no repositório.** Configuração por variáveis de ambiente.

## Stack de referência

| Camada | Referência | Alternativas |
|---|---|---|
| Linguagem | JavaScript no começo; TypeScript a partir da etapa 2 | Python |
| Modelo de chat e embeddings | endpoint compatível com a API de chat (Ollama local do repositório) | OpenAI, OpenRouter, vLLM |
| Armazenamento vetorial | memória/arquivo nas etapas 4–5; Postgres + pgvector ([infra](../../infra/instalacao.md)) depois | qualquer banco vetorial |
| Testes | `node --test` | vitest, pytest |
| Execução reproduzível | scripts + `compose` (etapa 15) | Makefile, devcontainer |

## Estrutura sugerida

```
projeto/
├── README.md             como rodar do zero (cresce a cada etapa)
├── AGENTS.md             contexto para coding agents (etapa 13)
├── src/
│   ├── llm/              cliente, medidor de tokens, custo
│   ├── ingestao/         parsing, chunking, metadados
│   ├── recuperacao/      embeddings, busca vetorial, lexical, reranking
│   ├── rag/              resposta fundamentada, citações, abstenção
│   ├── ferramentas/      contratos, validação, permissões
│   ├── agente/           ciclo, estado, memória, limites
│   ├── mcp/              servidor e cliente
│   └── observabilidade/  logs, métricas
├── prompts/              prompts versionados
├── avaliacao/            conjunto de perguntas, métricas, relatórios
├── tests/
└── docs/adr/             decisões técnicas
```

## Marcos por etapa

Cada marco é o incremento que **comprova** a etapa (`E<NN>-lab`). O critério de aceitação completo está na lição.

| Etapa | Marco | O projeto passa a... | Aceite (resumo) |
|---|---|---|---|
| 1 | Linha de base de tokens | ter medido tokens, custo fixo, truncamento, ausência de memória e tempo por token de saída no endpoint do projeto | `verificar.mjs` da lição 1 aprovado; `medir.mjs` e `relatorio.json` guardados |
| 2 | Cliente de LLM | chamar o modelo com timeout, retry e erros tipados, só por configuração | testes com servidor falso cobrem timeout, 429 e 500 |
| 3 | Prompts e schemas | usar prompts versionados e saídas validadas por schema | ≥ 90% dos casos de teste válidos |
| 4 | Ingestão | transformar o corpus em chunks com metadados rastreáveis | 100% dos chunks com fonte e posição |
| 5 | Busca vetorial | buscar os k trechos mais próximos de uma pergunta | os trechos esperados aparecem nos casos de teste |
| 6 | RAG com citações | responder com fontes verificáveis | 100% das citações apontam para chunks recuperados |
| 7 | Avaliação | medir hit@k, MRR, fidelidade e abstenção | relatório reproduzível com ≥ 20 perguntas, ≥ 5 sem resposta |
| 8 | Busca híbrida | combinar lexical e vetorial, com reranking opcional e custo | mudança aceita ou rejeitada pelos números da etapa 7 |
| 9 | Ferramentas | expor ≥ 3 ferramentas por function calling | argumentos inválidos rejeitados sem executar |
| 10 | Agente | rodar um ciclo com estado, memória e limites | para por orçamento num loop forçado |
| 11 | Segurança | proteger ações de risco com aprovação humana | testes de injeção bloqueados |
| 12 | MCP | expor as ferramentas de busca como servidor MCP | cliente MCP lista e chama as ferramentas |
| 13 | Coding agent | ter contexto para agentes e uma funcionalidade revisada | `AGENTS.md`, uma skill e relatório de revisão |
| 14 | Observabilidade | registrar execuções em JSONL e resumir custo e latência | o resumo reconstrói custo e latência dos logs; ≥ 3 ADRs |
| 15 | Reprodutível | ser executado do zero por outra pessoa | roteiro executado por terceiros sem ajuda; E2E passando |
| 16 | Capstone | ser demonstrado e defendido | rubrica final por competência |

## Requisitos que valem para todas as etapas

1. **Testes determinísticos:** o que depende do modelo usa um LLM simulado (como o servidor falso da
   [Lição 1](../licoes/01-tokens-contexto-inferencia/licao.test.mjs)); testes com o LLM real são marcados à parte.
2. **Reprodutível:** versões fixas (`package-lock.json`), comandos documentados no `README` do projeto, nenhum
   segredo versionado.
3. **Medido:** toda mudança que afirma melhorar algo (chunking, prompt, busca) mostra o antes e o depois com a
   mesma avaliação.
4. **Registrado:** decisões relevantes viram ADR curto (`docs/adr/NNNN-titulo.md`): contexto, decisão,
   alternativas, consequências.

## Relação com o módulo 11

O [módulo 11 (Micro-SaaS "Políticas com Fonte")](../../modulos/11-capstone-micro-saas/) é uma implementação de
referência com escopo parecido (RAG com citações, agente, MCP, API, UI e CI). Ele **não** é o projeto da Academia:
o aluno constrói o próprio, passo a passo. Use o módulo 11 para comparar decisões na etapa 16, não para copiar.

## Avaliação final (etapa 16)

Pontuada por competência ([C01–C24](../competencias.md)) e pelas 10 propriedades acima. A rubrica de cada propriedade
(0 a 3) é publicada na lição da etapa 16 e segue o que já existe no
[doc 04 do módulo 11](../../modulos/11-capstone-micro-saas/docs/04-apresentacao-e-defesa.md#critérios-de-avaliação-rubrica).
