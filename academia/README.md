# Academia de Engenharia de IA

Um curso vivo de **Engenharia de IA Aplicada**, construído em cima do acervo deste repositório: 16 etapas
progressivas, lições com quiz e laboratório verificável, um projeto único que evolui a cada etapa e
acompanhamento individual com XP, níveis, conquistas e checkpoints. Os [módulos](../modulos/) continuam sendo o
material de estudo; a Academia dá a **ordem, a prática avaliada e o registro do progresso**.

Referência de 16 semanas × 3 horas = 48 horas, **sem prazos rígidos**: pausar não custa nada.

## Comece aqui

> Primeira vez? Leia o [Guia rápido](GUIA-RAPIDO.md): o fluxo de uma sessão de estudo em uma página.

1. Escolha o seu `<aluno>` (a pasta em [`alunos/`](alunos/)). Novo aluno: `node academia/ferramentas/academia.mjs novo-aluno <slug> "Nome"`.
2. Faça a [Missão 0 · Diagnóstico](licoes/00-missao-0-diagnostico/README.md): perfil, ambiente e diagnóstico.
3. Siga para a [Lição 1 · Tokens, contexto, inferência e limites](licoes/01-tokens-contexto-inferencia/README.md).
4. Ao fim de cada sessão, registre-a ([SINCRONIZACAO.md](SINCRONIZACAO.md)). Para retomar depois de qualquer pausa,
   abra `alunos/<aluno>/retomada.md` ou gere o kit de colagem (`kit <aluno>`) para uma conversa nova.

## O que tem aqui

| Arquivo ou pasta | Para quê |
|---|---|
| [ROADMAP.md](ROADMAP.md) | as 16 etapas, dependências, material existente do repositório e lacunas |
| [licoes/](licoes/) | Missão 0 e lições (14 seções cada) com quiz, desafio, critérios, rubrica e dicas |
| [projeto/](projeto/) | o projeto evolutivo (Assistente Técnico) e o marco de cada etapa |
| [GAMIFICACAO.md](GAMIFICACAO.md) | XP, níveis, checkpoints, conquistas, revisão espaçada, retomada, ranking opcional |
| [competencias.md](competencias.md) | as 24 competências e os níveis de domínio |
| [SINCRONIZACAO.md](SINCRONIZACAO.md) | como iniciar, encerrar e retomar sessões, em qualquer assistente de IA |
| [PROGRESS.md](PROGRESS.md) | visão geral dos alunos (gerada) |
| [alunos/](alunos/) | uma pasta independente por aluno: perfil, sessões, entregas e `retomada.md` |
| [extensoes/](extensoes/README.md) | prática avançada: memória por MCP, harness de agentes, engenharia reversa, RAG avançado e o **time de agentes** (com projetos para o dia a dia) |
| [templates/](templates/) | lição, relatório de sessão, relatório de laboratório, perfil |
| [ferramentas/](ferramentas/) | `academia.mjs`: valida, gera o progresso e cria sessões (Node, sem dependências) |
| [CHANGELOG.md](CHANGELOG.md) | mudanças no currículo e no sistema |
| [`../AI_CONTEXT.md`](../AI_CONTEXT.md) | regras para o assistente de IA |

## O que está implementado

| Área | O que existe | Como é verificado |
|---|---|---|
| **Trilha** | roadmap de 16 etapas em 5 fases, 24 competências, ligado ao material dos módulos; lacunas listadas | `validar` confere roadmap × competências × lições |
| **Lições** | Missão 0 e Lição 1 completas (14 seções, quiz com gabarito separado, laboratório com verificador automático, rubrica, dicas graduais); lições 2 a 16 em `roteiro` | testes + `validar` |
| **Projeto evolutivo** | especificação do Assistente Técnico, com um marco e um critério de aceite por etapa | — |
| **Acompanhamento** | uma sessão por arquivo; XP por atividade comprovada; 4 níveis (exigem XP **e** checkpoints); 20 conquistas; revisão espaçada; `retomada.md` e `PROGRESS.md` gerados; dois alunos independentes | testes de regras e teste de mutação das regras críticas |
| **Ferramenta** | `academia.mjs`: `validar`, `progresso`, `sessao`, `kit`, `novo-aluno` | testes automatizados |
| **Extensões** | memória persistente por MCP, harness de agentes (registro de ferramentas, personas, avaliadores, skills), engenharia reversa, RAG avançado (fluxo corretivo), time de agentes (orquestrador, agentes de LLM, CLI, 7 projetos práticos) | testes com funções e servidores simulados |
| **Segurança** | varredura de segredos, evidência confinada à pasta do aluno, credenciais mascaradas em toda saída, lições só entram na memória com aprovação | testes |
| **Limites conhecidos** | só a checagem de ambiente da Missão 0 falou com um LLM real (Ollama local); o laboratório da Lição 1 e as extensões só rodaram com simulações; lições 2 a 16 não foram escritas; GraphRAG só conceitual | declarados nos documentos |

## Como interagir com o conteúdo

- **Você (pessoa) + um assistente de IA em uma conversa:** gere o kit (`kit <aluno>`), cole numa conversa nova, estude a lição, peça o relatório no fim e
  registre com `sessao`, `progresso` e `validar --aluno`. Passo a passo e prompts: [SINCRONIZACAO.md](SINCRONIZACAO.md).
- **Um agente com acesso ao repositório** (Claude Code, Codex, Cursor...): ele lê `AI_CONTEXT.md`, o `retomada.md` do aluno e a lição; conduz a sessão e roda os mesmos comandos.
- **Só ler e rodar:** os módulos em [`../modulos/`](../modulos/) têm README, exemplos executáveis e exercícios com solução; a Academia só dá a ordem e o registro.
- **Usar o time de agentes no seu dia a dia:** [extensão Time de agentes](extensoes/time-de-agentes/README.md) e os [projetos práticos](extensoes/time-de-agentes/projetos-praticos.md).

## Próximos passos

Atualizado em 2026-10-19, depois dos PRs #2 (extensões), #3 (versão Python dos módulos), #5 (guia rápido) e #6 (primeira sessão do Werther). Em ordem de prioridade:

1. **Seguir estudando.** O Werther concluiu a Missão 0 (sessão s01, 40 XP) e está na [Lição 1](licoes/01-tokens-contexto-inferencia/README.md): a ação combinada é responder o quiz **antes** de ler a microlição.
   O responsável pelo projeto ainda não começou (`sessao responsavel`, Missão 0). Dica da sessão do Werther: nas revisões, anote também a consequência prática de cada correção.
2. **Executar de verdade o que ainda só rodou simulado.** A checagem de ambiente da Missão 0 já falou com o Ollama local (`qwen3.5:4b`, na máquina do Werther), mas o laboratório da Lição 1 e as extensões
   (juiz, time, CRAG) só rodaram contra modelos falsos; prompts, limiares do juiz e `maxTokens` são palpites. Rode o laboratório da Lição 1 contra o Ollama e registre no [CHANGELOG](CHANGELOG.md) o modelo, as versões e o que precisou de ajuste.
3. **Usar o time numa mudança sua** (projeto P1, com `--entrada` e `--raiz`) e anotar a concordância com o veredito do time: é a fase F1 da [extensão](extensoes/time-de-agentes/README.md#6-fases-de-evolução).
4. **Escrever as lições 2 a 16.** Só a Missão 0 e a Lição 1 estão prontas. Como todo exemplo dos módulos agora existe em JavaScript e em Python, decida se cada laboratório aceita as duas linguagens
   (os verificadores que só conferem arquivos de resultado, como o da Lição 1, já aceitam).
5. **Cobrir as lacunas do repositório:** parsing de PDF/HTML (etapa 4), fidelidade e abstenção medidas (7), reranking (8) e um laboratório de GraphRAG; lista completa no [ROADMAP](ROADMAP.md#lacunas-conhecidas-do-repositório).
6. **Decidir o destino das ferramentas em Node.** O repositório ficou bilíngue, mas a Academia (`academia.mjs`, verificadores) e as extensões são Node sem dependências. Opções: manter, ou portar para Python
   (começando pelo núcleo de memória e pelo registro de ferramentas, que são pequenos e têm testes que viram `pytest`). Decisão do Werther e do responsável pelo projeto.
7. **Completar o time de agentes:** `--veredito` (o seu veredito final virar lição candidata), ferramenta de busca para o P5, papel `tutor` para o P6, verificador de comandos de README para o P2 e um
   conjunto de tarefas de ouro (fase F5) para medir cada mudança de prompt ou limiar.
8. **CI mínimo.** Não existe `.github/`. Um workflow que rode `validar` e `node --test "academia/**/*.test.mjs"` em cada PR evita regressões silenciosas (os testes Python dos módulos dependem de `uv` e,
   alguns, de serviços locais: ficam fora do primeiro corte).
9. **Decisões em aberto:** o formato de sessão em JSON (lição como prompt e comando `aplicar`) discutido antes do PR #2 não foi implementado; registre uma decisão (ADR) ou descarte.

## Como os princípios pedagógicos viram mecanismos

| Princípio | Onde está |
|---|---|
| Microlições com objetivos explícitos | seções 2 e 4 de cada [lição](templates/licao.md) |
| Quizzes curtos com correção comentada, sem spoiler | seção 7 + `gabarito.md` separado, aberto só depois de responder |
| Recuperação ativa e revisão espaçada | revisões sugeridas no `retomada.md` ([intervalos em sessões](GAMIFICACAO.md#revisão-espaçada)) |
| Laboratórios com critérios objetivos | seção 9 + `verificar.mjs` quando possível |
| Projeto incremental que reaproveita o código | [projeto/](projeto/) |
| Feedback individual e checkpoints de domínio | relatório de sessão + [checkpoints](GAMIFICACAO.md#checkpoints-de-domínio) |
| Gamificação sem confundir XP com domínio | XP por atividade comprovada; nível exige XP **e** checkpoints; competências à parte |
| Ritmo flexível | XP nunca diminui; sem prazos nem streaks; contagem de revisão em sessões, não em dias |
| Materiais externos selecionados | seção 5 das lições: cada link com justificativa e data de verificação |
| Fundamentos × ferramentas | quadro "durável × específico de fornecedor" na microlição e na seção 14 |

## Comandos

```bash
node academia/ferramentas/academia.mjs kit <aluno>            # texto para colar numa conversa com um assistente de IA
node academia/ferramentas/academia.mjs sessao <aluno>         # cria o arquivo da próxima sessão
node academia/ferramentas/academia.mjs validar --aluno <aluno> # conteúdo, links, segredos e os registros desse aluno
node academia/ferramentas/academia.mjs progresso <aluno>      # recria o retomada.md dele e o PROGRESS.md
node academia/ferramentas/academia.mjs novo-aluno <slug> "Nome"
node academia/ferramentas/academia.mjs validar                # tudo, de todos os alunos (mantenedores)
node --test "academia/**/*.test.mjs"                          # testes da ferramenta e das lições
```

Precisa de **Node 22 ou superior** (o repositório usa o Node 24). Não há dependências para instalar. Os laboratórios
usam um endpoint de LLM compatível com a API de chat: o Ollama do repositório (`bash infra/subir-ia.sh`) ou um
provedor, só com variáveis de ambiente (`OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODELO_CHAT`; veja
[`infra/.env.example`](../infra/.env.example)).

## Como adicionar uma lição

1. Copie [templates/licao.md](templates/licao.md) para `licoes/NN-slug/README.md` e escreva as 14 seções; crie o
   `gabarito.md` ao lado. O plano da etapa já está no [ROADMAP](ROADMAP.md).
2. Se o laboratório tem verificação automática, inclua `verificar.mjs` e um teste (veja a Lição 1).
3. Marque a etapa como `pronta` no ROADMAP e registre no [CHANGELOG](CHANGELOG.md).
4. `node academia/ferramentas/academia.mjs validar`.
