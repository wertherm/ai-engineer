<!-- Gerado por `node academia/ferramentas/academia.mjs progresso`. Não edite: a fonte são os arquivos de sessoes/. -->
# Retomada · Werther

**Nível:** Aprendiz · **XP:** 40 · **Etapa atual:** Etapa 1 · Tokens, contexto, inferência e limites dos LLMs

**Próxima sessão:** s02 (dados para o relatório: `aluno: werther`, `sessao: 2`)

Para Construtor: faltam 110 XP e checkpoint CP1.

## Onde parei

- Última sessão: **2026-10-19** (s01), etapa 0, status `concluida`.
- Lição: [Etapa 1 · Tokens, contexto, inferência e limites dos LLMs](../../licoes/01-tokens-contexto-inferencia/README.md)
- Resumo: Missão 0 completa. O ambiente foi verificado por script: Ollama local com `qwen3.5:4b` e todos os itens `[ok]`. O perfil

## Próxima missão

Abrir a Lição 1 e responder o quiz antes de ler a microlição.

## Último feedback

> - **Bem:** respostas próprias e honestas, com "não sei" onde cabia, e uma dúvida específica (RAG). O ambiente está
>   descrito o bastante para ser reproduzido sem perguntas.
> - **Calibragem:** nota média de 0,69 contra autoavaliação de 1,69 (distância média de 1,0), sempre para cima. A maior
>   diferença está em Agentes e Ecossistema, onde o uso diário de ferramentas dá familiaridade com os termos, mas não
>   com o mecanismo. Ação: fazer o quiz de cada etapa **antes** de ler o material.
> - **Equívocos a desfazer cedo:** API de chat sem estado (a aplicação reenvia `messages`, etapa 1); RAG não é
>   fine-tuning e deve se abster sem evidência (etapas 6 e 7); function calling não é legado, quem executa é o código da
>   aplicação e o MCP se apoia nele (etapas 9 e 12); embedding é vetor e não busca por palavra-chave (etapa 5).
> - **Anotações da revisão:** corretas, mas curtas (só o enunciado). Nas próximas, escreva também uma consequência
>   prática de cada correção: é isso que fixa o conceito.
> - **Ritmo:** realista e com horário. O plano para pausas ("um dia ou outro") vale. Na volta, o `retomada.md` traz um
>   aquecimento.

## Pendências

- Nenhuma.

## Revisões sugeridas

Nenhuma por enquanto.

## Progresso

Etapas concluídas: `░░░░░░░░░░░░░░░░` 0/16

| Fase | Etapas | Concluídas |
|---|---|---|
| 1 | 1–3 | `░░░░░░░░░░` 0/3 |
| 2 | 4–8 | `░░░░░░░░░░` 0/5 |
| 3 | 9–11 | `░░░░░░░░░░` 0/3 |
| 4 | 12–14 | `░░░░░░░░░░` 0/3 |
| 5 | 15–16 | `░░░░░░░░░░` 0/2 |

XP até Construtor: `████░░░░░░░░░░░░` 40/150

## Competências

| ID | Competência | Nível | Evidência mais recente |
|---|---|---|---|
| C01 | Explicar tokens e tokenização e o impacto deles em custo e em limites | ○○○ 0 | — |
| C02 | Dimensionar a janela de contexto e o orçamento de tokens de uma chamada | ○○○ 0 | — |
| C03 | Explicar a inferência (prefill, decode, sampling, determinismo) e seu efeito na latência | ○○○ 0 | — |
| C04 | Integrar um LLM por API com timeout, retry e tratamento de erros | ○○○ 0 | — |
| C05 | Separar fundamentos de detalhes de fornecedor e trocar de provedor só por configuração | ○○○ 0 | — |
| C06 | Escrever prompts como especificações versionadas e testáveis | ○○○ 0 | — |
| C07 | Obter saídas estruturadas validadas por schema e testá-las contra casos | ○○○ 0 | — |
| C08 | Ingerir documentos com parsing e metadados rastreáveis até a fonte | ○○○ 0 | — |
| C09 | Escolher e medir estratégias de chunking | ○○○ 0 | — |
| C10 | Gerar embeddings e executar busca vetorial por similaridade | ○○○ 0 | — |
| C11 | Construir RAG com respostas fundamentadas e citações verificáveis | ○○○ 0 | — |
| C12 | Avaliar a recuperação com métricas (hit@k, MRR) sobre um conjunto rotulado | ○○○ 0 | — |
| C13 | Avaliar fidelidade à fonte e implementar abstenção quando faltam evidências | ○○○ 0 | — |
| C14 | Combinar busca lexical e vetorial, aplicar reranking e controlar custo | ○○○ 0 | — |
| C15 | Projetar ferramentas com schemas e executá-las por function calling | ○○○ 0 | — |
| C16 | Implementar o ciclo de um agente com estado, memória e limites explícitos | ○○○ 0 | — |
| C17 | Aplicar permissões mínimas, guardrails e aprovação humana a ações de risco | ○○○ 0 | — |
| C18 | Reconhecer e mitigar prompt injection e vazamento de dados em agentes | ○○○ 0 | — |
| C19 | Construir e consumir servidores e clientes MCP | ○○○ 0 | — |
| C20 | Estruturar contexto para coding agents (instruções, skills, escopo) e revisar o que produzem | ○○○ 0 | — |
| C21 | Instrumentar um sistema com logs, métricas e custo por execução | ○○○ 0 | — |
| C22 | Registrar decisões técnicas (ADRs) com alternativas e trade-offs | ○○○ 0 | — |
| C23 | Testar ponta a ponta e entregar uma execução reproduzível por outra pessoa | ○○○ 0 | — |
| C24 | Demonstrar e defender tecnicamente o sistema com evidências | ○○○ 0 | — |

## Checkpoints e conquistas

| Checkpoint | Situação |
|---|---|
| CP1 (após a etapa 3) | pendente |
| CP2 (após a etapa 8) | pendente |
| CP3 (após a etapa 11) | pendente |
| CP4 (após a etapa 14) | pendente |
| CP5 (após a etapa 16) | pendente |

Conquistas: 1/20

- [x] **Bússola** — Ambiente da Missão 0 verificado
- [ ] **Contador de Tokens** — Entende tokens, contexto e inferência
- [ ] **Integrador** — Chama LLMs por API com erros tratados e provedor trocável
- [ ] **Especificador** — Prompts versionados e saídas validadas por schema
- [ ] **Fundação Sólida** — Checkpoint da Fase 1
- [ ] **Fiel às Fontes** — RAG com citações e abstenção
- [ ] **Medidor** — Avalia a recuperação com métricas
- [ ] **Recuperador** — Checkpoint da Fase 2
- [ ] **Ferramenteiro** — Ferramentas com schema e function calling
- [ ] **Sob Controle** — Agente com limites e aprovação humana
- [ ] **Cinto de Segurança** — Checkpoint da Fase 3
- [ ] **Conector** — Constrói e consome MCP
- [ ] **Observador** — Logs, métricas, custo e decisões registradas
- [ ] **Arquiteto** — Checkpoint da Fase 4
- [ ] **Reprodutível** — Outra pessoa consegue executar o projeto
- [ ] **Engenheiro de IA** — Capstone aprovado
- [ ] **Memória de Elefante** — Cinco revisões espaçadas aprovadas
- [ ] **Curioso** — Três desafios opcionais concluídos
- [ ] **Bem-vindo de Volta** — Retomou o curso depois de uma pausa
- [ ] **Explicador** — Cinco explicações técnicas independentes aprovadas

## Histórico recente

| Sessão | Data | Etapa | Status | XP ganho |
|---|---|---|---|---|
| [s01](sessoes/2026-10-19-s01.md) | 2026-10-19 | 0 | concluida | 40 |

