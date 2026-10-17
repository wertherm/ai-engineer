# 04 · Apresentação e defesa do projeto

## Objetivo

Apresentar o Micro-SaaS como produto (storytelling + demo ao vivo + resultados medidos) e **defender as
decisões técnicas** com ADRs, sabendo responder às perguntas de uma banca. Cobre a Unidade 5.

## Explicação

### Storytelling (3 minutos)

1. **Dor** (30 s): "Na Padaria Pão Quente, a gerente responde 15 vezes por mês 'até quando entrego o
   atestado?'. Na Acme, um dev reembolsou bebida alcoólica porque o chatbot genérico disse que podia."
2. **Por que agora** (20 s): LLMs pequenos rodam em CPU; RAG com citação resolve o "inventou".
3. **Solução** (40 s): Políticas com Fonte — responde sobre as políticas **da sua** empresa, cita o
   documento e diz "não encontrei" quando não sabe.
4. **Demo** (90 s): roteiro abaixo.
5. **Resultado e próximo passo** (20 s): números medidos + o que falta para cobrar (billing, PDF, Slack).

### Roteiro da demo ao vivo

| # | Passo | Comando / ação | O que a banca vê |
|---|---|---|---|
| 0 | Antes de entrar na sala | `npm run seed && npm run e3:subir` e **aquecer o cache** com as perguntas da demo | nada (é preparação: em CPU, uma resposta nova leva minutos) |
| 1 | UI | abrir http://localhost:31181, conectar com `sk-acme-demo` | tenant, tools descobertas via MCP, documentos |
| 2 | Pergunta com citação | "Qual o valor do auxílio home office?" | resposta com `[1] home-office.md`, "citações verificadas", cache semântico |
| 3 | Isolamento | trocar para `sk-padaria-demo` | só os documentos da padaria |
| 4 | "Não encontrei" | padaria: "Qual o limite de alimentação em viagem?" | fallback em segundos, sem gastar LLM |
| 5 | Contrato | http://localhost:31180/docs | Swagger UI do OpenAPI 3.1 |
| 6 | MCP para agentes | `npm run e2:inspector` (ou mostrar a saída gravada) | tools/list, tools/call, 401 sem chave |
| 7 | Agente externo | saída gravada de `npm run e3:agente` | o LLM descobre as tools e responde pela padaria |
| 8 | Qualidade no CI | `npm run exe02` | hit@1, hit@3, MRR e guarda de citações: APROVADO |

Plano B: se o Ollama estiver lento ou fora, mostrar as **saídas reais gravadas** nos READMEs dos exemplos
e o screenshot [`ui.png`](../exemplos/03-entrega-3-front-e-implantacao/ui.png). Demo ao vivo com LLM em CPU
sem cache é risco desnecessário.

### Resultados

Medidos neste repositório em 2026-10-17 (CPU, Ollama compartilhado com outros processos):

| Métrica | Valor | Como foi medido |
|---|---|---|
| hit@1 / hit@3 / MRR da recuperação | 1,00 / 1,00 / 1,00 | 12 perguntas rotuladas, 2 tenants ([exercício 02](../exercicios/02-avaliacao-no-ci/)) |
| Guarda de citações | 6/6 fixtures corretas | sem citação, citação inventada e link são bloqueados |
| Resposta com citação correta (LLM real) | 2/2 | `npm run exe02 -- --com-llm 2` |
| Tokens por pergunta (modo RAG) | ~385 | `usage` do Ollama (prompt com 4 trechos + resposta) |
| Latência: pergunta nova (RAG) | 5–6 min | 1 chamada ao LLM com fila de outros processos (~5 tokens/s) |
| Latência: cache semântico / "não encontrei" | 2–5 s | só embedding + SQL |
| Latência: modo agente | ~12 min | 2 chamadas ao LLM |
| Testes automatizados | 21 unitários/contrato + 4 integração + 5 do exercício 01 | `npm test`, `npm run test:integracao`, `npm run exe01` |
| Bundle inicial da UI | ~492 kB (129 kB transferidos) | `ng build` |

Leitura honesta: **qualidade alta, latência inaceitável para produção em CPU**. O próximo passo de
produto é trocar o provedor de chat (variáveis `OPENAI_BASE_URL`/`MODELO_CHAT`) por uma API hospedada ou
por um servidor com GPU (vLLM: [trilha LLMOps](../../../trilhas-extras/llmops-vllm-openshift/)); o
código não muda.

### ADRs (Architecture Decision Records)

Formato curto: contexto → decisão → consequências.

**ADR-001 · Postgres + pgvector como banco vetorial.** Contexto: precisávamos de vetor, full-text,
transação e multi-tenant; a infra já tem Postgres. Decisão: pgvector com HNSW + `tsvector` gerado.
Consequências: um banco só para backup/LGPD; busca híbrida em uma query; acima de milhões de chunks,
reavaliar Qdrant/Weaviate.

**ADR-002 · Multi-tenant "pool" (tabela única com `tenant_id`) e API key com hash.** Contexto: dezenas a
centenas de PMEs pequenas. Decisão: `tenant_id` em toda tabela e em todo `WHERE`; chave guardada só como
SHA-256. Consequências: barato de operar; o risco é esquecer um filtro → mitigado pela fachada única e por
teste de integração. Evolução: Row-Level Security do Postgres; schema por cliente para planos enterprise.

**ADR-003 · Citação verificada e "falha fechado".** Contexto: regra inventada de RH é risco jurídico.
Decisão: prompt com fontes numeradas + `verificarResposta` (≥1 citação, todas existentes, sem link); se
falhar, devolve "não encontrei". Consequências: algumas respostas boas sem `[n]` viram fallback (falso
negativo aceito); confiança do produto vira código testável.

**ADR-004 · MCP no mesmo processo da API, stateless, com a mesma auth.** Contexto: agentes e UI precisam
das mesmas capacidades. Decisão: `/mcp` Streamable HTTP, um `McpServer` por requisição, tenant pela API
key, rate limit e Origin compartilhados com `/v1`. Consequências: escala horizontal sem sessão grudada;
sem notificações server→client (GET → 405).

**ADR-005 · Agente externo usa só tools rápidas.** Contexto: o agente já tem o próprio LLM. Decisão: o
demo filtra `perguntar` e usa `buscar_politicas`/`listar_documentos`. Consequências: evita "LLM chamando
LLM" (custo e latência em dobro); `perguntar` segue disponível para clientes MCP sem LLM próprio (como a UI).

**ADR-006 · ADK com adaptador `BaseLlm` próprio.** Contexto: no ADK TypeScript não há LiteLLM/Ollama
(só no Python) e Gemini exige chave. Decisão: `OllamaLlm extends BaseLlm` traduzindo Gemini ↔ Chat
Completions; `Workflow` (experimental) em vez de `SequentialAgent` (deprecated). Consequências: roda local
e com qualquer API compatível com OpenAI; o adaptador é código nosso a manter quando o ADK mudar (há
teste de unidade da tradução).

**ADR-007 · Angular buildado em container.** Contexto: Angular CLI 22 exige Node ≥ 24.15; máquina com
24.11. Decisão: build no `node:24.22.0-alpine` (local, Dockerfile e CI iguais). Consequências: nada
instalado no sistema; build reprodutível; o dev local precisa de Docker.

**ADR-008 · Cache semântico por tenant e corte de relevância antes do LLM.** Contexto: cada resposta nova
custa minutos em CPU. Decisão: cache (cosseno ≥ 0,95, TTL 1 dia, versão do prompt, invalidado ao mudar
documento) e "não encontrei" sem LLM quando o melhor trecho tem cosseno < 0,5. Consequências: perguntas
repetidas em segundos; limiares precisam ser re-medidos ao trocar o modelo de embedding.

### Critérios de avaliação (rubrica)

| Critério | Peso | Insuficiente | Bom | Excelente |
|---|---|---|---|---|
| Problema e viabilidade | 15% | "chatbot com IA" | público e dor claros | canvas, conta de custo por cliente, escopo com "Won't" |
| Arquitetura e decisões | 20% | diagrama sem justificativa | diagrama + stack | ADRs com trade-offs e evolução |
| RAG e agentes | 20% | busca vetorial simples | híbrida + citações | citações verificadas, fallback, agente com limites, métricas hit@k |
| Integração (API, MCP, UI) | 20% | API sem contrato | OpenAPI + MCP | UI cliente MCP, Inspector no CI, agente externo via MCP |
| Qualidade e operação | 15% | sem testes | testes unitários | contrato + integração + e2e + avaliação como portão de CI + compose |
| Apresentação | 10% | demo improvisada | roteiro | roteiro com plano B, números medidos, limitações assumidas |

### Perguntas prováveis da banca (e respostas curtas)

- *"E se o modelo inventar mesmo com RAG?"* A guarda bloqueia resposta sem citação válida; o golden set
  no CI pega regressões de recuperação.
- *"Como garantem que a padaria não vê a Acme?"* Tenant vem da API key (nunca do corpo da requisição),
  toda consulta filtra `tenant_id`, teste de integração no banco real e teste e2e na UI.
- *"Por que não fine-tuning?"* Política muda toda semana; RAG atualiza com um `POST /v1/documentos`.
  Fine-tuning ensina estilo, não fatos que mudam ([módulo 09](../../09-dados-e-fine-tuning/)).
- *"Quanto custa por cliente?"* ~385 tokens por pergunta; conta no [doc 01](01-ideacao-e-arquitetura.md#viabilidade-lean-canvas-resumido).
- *"Prompt injection num documento enviado pelo cliente?"* Fonte delimitada e neutralizada, saída sem
  links, ações só de leitura; o próprio tenant só consegue atacar o próprio assistente.

## Código mínimo

Um ADR em Markdown (modelo para novos):

```markdown
### ADR-00N · <decisão no imperativo>
Contexto: <força/restrição que obrigou a decidir>
Decisão: <o que foi escolhido, concretamente>
Consequências: <o que fica melhor, o que fica pior, quando revisitar>
```

## Na prática

- Saídas reais para o plano B: [entrega 1](../exemplos/01-entrega-1-rag-cli/), [entrega 2](../exemplos/02-entrega-2-api-e-mcp/),
  [entrega 3](../exemplos/03-entrega-3-front-e-implantacao/), [ADK](../exemplos/04-orquestracao-adk/).
- Métricas: [exercício 02](../exercicios/02-avaliacao-no-ci/).

## Armadilhas

- **Demo ao vivo dependente de LLM lento**: aqueça o cache e tenha as saídas gravadas.
- **Métrica sem método**: "funciona bem" não convence; "hit@3 = 1,00 em 12 perguntas rotuladas" convence (e o tamanho do golden set é uma limitação que você mesmo deve citar).
- **Esconder limitações**: latência em CPU, golden set pequeno, sem billing real. Dizer antes da banca perguntar mostra domínio.
- **ADR escrito depois para justificar**: escreva quando decidir; a data e o contexto da época valem mais que a justificativa perfeita.

## Fontes

- ADR (Michael Nygard e comunidade): https://adr.github.io/
- Lean Canvas: https://leanstack.com/lean-canvas
- Avaliação de recuperação (MRR, hit@k): https://en.wikipedia.org/wiki/Mean_reciprocal_rank
