# Extensões da Academia

Material **prático e opcional** que aprofunda o núcleo de 16 etapas e prepara o que vem depois: um time de agentes que você usa no
dia a dia. Cada extensão tem um guia, código de referência **testado** (sem dependências, salvo onde indicado), exercícios com
critérios objetivos e rubrica. Elas não rendem XP por conta própria: o XP vem das lições do [ROADMAP](../ROADMAP.md); aqui você
pratica e, quando quiser, registra um desafio `opcional` na sua sessão.

## Mapa

| Extensão | O que entrega | Entra em | Código testado |
|---|---|---|---|
| [Memória persistente via MCP](memoria-persistente-mcp/README.md) | memória com escopo, segredos recusados, TTL, histórico; servidor MCP; revisão do `mcp-remember-jps` | etapas 10, 11, 12 | sim (núcleo, servidor e `stdout` do protocolo) |
| [Harness de agentes](harness-de-agentes/README.md) | anatomia do harness; registro de ferramentas com risco, aprovação, timeout e auditoria; `AGENTS.md`, personas, avaliadores e skills prontos; revisão do squad do `jps-agents` | etapa 13 (e 9, 10, 11) | sim |
| [Engenharia reversa](engenharia-reversa/README.md) | protocolo de 8 passos, prompt para agente de código (somente leitura), modelo de relatório e exemplo resolvido | etapas 13, 14, capstone | (documento) |
| [RAG avançado](rag-avancado/README.md) | CRAG, Self-RAG, GraphRAG, híbrido e reranking: quando usar e quando não; fluxo corretivo | etapas 7 e 8 | sim (fluxo do CRAG) |
| [Time de agentes](time-de-agentes/README.md) | orquestrador que delega, avalia em cadeia, cria tarefas e propõe lições; agentes de LLM; CLI; 7 projetos práticos | prática contínua a partir da etapa 10 | sim (orquestrador, adaptadores e CLI ponta a ponta) |

Ordem sugerida para quem quer chegar ao time: **memória → harness → time** (e **engenharia reversa** e **RAG avançado** quando o projeto pedir).
O projeto de maior retorno imediato é o **P1 · Guardião de mudanças**, em [`time-de-agentes/projetos-praticos.md`](time-de-agentes/projetos-praticos.md).

## Como rodar os testes

```bash
node --test "academia/extensoes/**/*.test.mjs"        # a partir da raiz do repositório
cd academia/extensoes/memoria-persistente-mcp && npm install && npm test   # inclui o servidor MCP (precisa do SDK)
```

Sem `npm install`, os testes que dependem do SDK do MCP são pulados e o resto roda.

## De onde veio o material (e o que NÃO veio)

O ponto de partida foram dois repositórios de `tzdesing`: `mcp-remember-jps` (público; um servidor MCP de memória com SQLite) e `jps-agents`
(privado; um squad de agentes com personas, skills e regras). Aproveitado:

- o **código** de `mcp-remember-jps` e três arquivos do servidor de ferramentas do `jps-agents` entram **sem alterações**, como *snapshots de estudo*
  (`estudo-de-caso/`, com cabeçalho "não usar em produção"), para servirem de alvo de revisão e engenharia reversa;
- as **ideias** do `jps-agents` (personas, skills, memória tipada, gate de QA, post-mortem, registro de ferramentas) foram **reescritas** como modelos neste
  repositório, com as correções apontadas nos guias.

**Não foram copiados:** arquivos de ambiente, endereços de servidor, identificadores de contêiner, chaves e nomes de projetos privados. O repositório
`ai-engineer` é **público**: revise o que vai nele.

## Convenções

- Cada extensão cita fontes **abertas em 2026-10-18** e marca o que não pôde ser verificado.
- Nada aqui foi executado contra um LLM real no ambiente em que foi escrito; os testes usam funções e servidores simulados. A primeira execução real deve registrar o
  modelo e os ajustes.
- Estado local (memória, relatórios, perfil) não é versionado por padrão (`.gitignore` em cada pasta).
