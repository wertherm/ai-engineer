# Changelog da Academia

Mudanças relevantes no currículo e no sistema de acompanhamento. Formato: data, o que mudou, por quê. Mudanças nos
módulos de estudo (`modulos/`, `trilhas-extras/`, `referencia/`, `infra/`) seguem o histórico do Git.

## 2026-10-20 · Lição 2 e a seção 15 (aplicação, reforço e desafios)

**Adicionado**

- **Seção 15 em toda lição** ("Aplicação, reforço e desafios"), com cinco blocos fixos: onde isso aparece no trabalho (e os erros comuns), **reforço** (perguntas de revisão V1 a V5, com a correção no `gabarito.md`),
  desafio de transferência (e "ensine a um colega"), ponte com o projeto evolutivo e com os projetos práticos, e calibragem (previsão antes de medir). O template, o validador e o `kit` conhecem a estrutura; as revisões
  espaçadas passam a usar as perguntas V1 a V5 em vez de reaproveitar as do quiz. A Missão 0 e a Lição 1 receberam a seção 15.
- **[Lição 2 · APIs, TypeScript, erros e integração com modelos](licoes/02-apis-erros-e-integracao/README.md)** (etapa 2, `pronta`; competências C04 e C05): microlição (taxonomia de nove tipos de erro, retry com backoff e jitter,
  `Retry-After`, timeout total, TypeScript no Node), quiz de 10 questões e gabarito, rubrica, dicas graduais, seção 15 completa.
  - **Laboratório "cliente de LLM robusto"**: o aluno escreve `chamar.ts`, `.mjs`, `.js` ou `.py` e o verificador **executa** o programa contra um [servidor falso](licoes/02-apis-erros-e-integracao/kit/servidor-falso.mjs)
    com 18 cenários de falha (429 de taxa e de cota, 5xx, conexão derrubada, corpo em conta-gotas, `Retry-After` gigante, 401 que repete a chave, provedor que recusa `max_tokens`...), conferindo o que o servidor viu (tentativas, esperas, corpo) e o que o programa disse. `--so CA5` verifica só um critério.
  - Soluções de referência em **TypeScript** e em **Python** (só biblioteca padrão), três exemplos executáveis e `licao.test.mjs` com **teste de mutação do verificador** (19 defeitos injetados, cada um reprovando o critério esperado).

**Alterado**

- Validador: 15 seções; a seção 15 tem cinco blocos; o bloco 15.2 exige V1 a V5 em sequência e o gabarito precisa corrigir cada uma. Títulos `## N.` dentro de blocos de código não contam como seção.
- ROADMAP: etapa 2 `pronta`; o TypeScript sai da lista de lacunas.

**Limites:** o laboratório foi testado só contra o servidor falso e as duas referências (Node 22.22.0, Python 3.12); **nada foi executado contra um provedor real** (a extensão `opcional` a da Lição 2 é a primeira chance).

## 2026-10-19 · Guia rápido

**Adicionado**

- [`GUIA-RAPIDO.md`](GUIA-RAPIDO.md): o fluxo de estudo em uma página (preparar uma vez, ciclo de sessão
  abrir → estudar → registrar → salvar, e a ordem das etapas), com link no "Comece aqui" e no README da raiz.
  Por quê: o README da Academia é completo, mas longo para quem só quer começar.

## 2026-10-18 · Versão Python dos módulos e atualização dos próximos passos

**Contexto:** foram mergeados o PR #2 (extensões práticas, entrada abaixo) e o PR #3 (feito pelo Werther): versão Python de todos os exemplos e exercícios dos 12 módulos
(subpastas `python/`, `pyproject.toml` e `uv.lock` por módulo, back-end FastAPI no Capstone, testes em `pytest`, mais armadilhas e *cheatsheet* em `referencia/`).
O PR #3 não alterou nada em `academia/`; a ferramenta, os verificadores e as extensões continuam em Node, sem dependências.

**Alterado** (este ajuste de documentação)

- README da raiz, `AI_CONTEXT.md`, ROADMAP e `projeto/README.md` deixam de dizer que os exemplos são só JavaScript e que Python é parcial.
- [README da Academia](README.md#próximos-passos): nova seção "Próximos passos", reordenada e atualizada (substitui as listas "Pendente" abaixo como fonte de verdade).

**Verificado** depois do merge, na `main` (0de58c3): `validar` sem erros e 362 testes de `academia/` passando. **Não reexecutei** os exemplos Python dos módulos: a verificação deles é a descrita no PR #3.

## 2026-10-18 · Extensões práticas (memória, harness, engenharia reversa, RAG avançado e time de agentes)

**Adicionado** (em [`extensoes/`](extensoes/README.md))

- **Memória persistente via MCP:** núcleo sem dependências (escopo, segredos recusados, upsert com histórico, TTL, busca com limite), servidor MCP (stdio) e testes,
  mais a revisão do `mcp-remember-jps` (10 achados com linha).
- **Harness de agentes:** registro de ferramentas com risco, aprovação humana, timeout, limite de saída e auditoria; modelo de `AGENTS.md`, 7 personas, 3 avaliadores e 4 skills;
  revisão do servidor de ferramentas do `jps-agents` (8 achados, entre eles `console.log` no stdout de um servidor stdio e SSRF no `http_get`).
- **Engenharia reversa assistida por IA:** protocolo de 8 passos, prompt de somente leitura para agente de código, modelo de relatório e exemplo resolvido.
- **RAG avançado:** CRAG, Self-RAG, GraphRAG, híbrido e reranking (quando usar e quando não), com o fluxo corretivo do CRAG testado.
- **Time de agentes:** orquestrador (delegação, avaliação em cadeia, criação de tarefas, orçamento, escalonamento, auditoria, lições pendentes de aprovação), agentes e
  avaliadores de LLM, ferramentas de projeto (`ler_arquivo`, `listar_arquivos`, `git_diff`, `rodar_testes`), CLI com perfil do dono, `--entrada`, `--raiz`, lições pendentes em disco
  (`licoes listar|aprovar|rejeitar`), configuração de exemplo e 7 projetos práticos para o dia a dia (3 rodam com a CLI de hoje).
- Instruções de uso e resumo de funcionalidades nos READMEs da raiz e da Academia.

**Alterado**

- O verificador da Lição 1 aceita o script de medição em qualquer linguagem (`medir.mjs`, `medir.py`, `medir.ts`...) e varre **todos** os `medir.*` da pasta em busca de segredos.
- ROADMAP: etapas 7, 8, 10, 11, 12 e 13 passam a apontar as extensões; a lacuna de skills e coding agents (etapa 13) fica parcialmente coberta.
- `comum.mjs`: detecção de segredos ampliada (Stripe, Basic, `github_pat_`, npm, GitLab, JWT, variáveis de ambiente de senha ou token com valor, senha em prosa) com quantificadores limitados,
  `mascararSegredos`/`mascararProfundo`, `temControle`/`paraTerminal`/`neutralizarControles`. A detecção continua sendo **melhor esforço**.

**Endurecido após duas revisões independentes (código e conteúdo)**

- **Avaliação:** o LLM-juiz não aprova mais com `{"aprovado":true}`: precisa responder sobre cada critério com evidência e dar nota; critério de execução ("os testes passam") só vale com uma
  execução registrada pelo harness; o orquestrador não aprova tarefa sem avaliador (escala ou pergunta ao humano).
- **Entregas e segredos:** entrega com credencial reprova a tentativa; saída de ferramentas, feedback, auditoria e relatório são mascarados; texto com controles/bidi é neutralizado ou recusado.
- **Orçamento e delegação validados** (sem `Infinity`/typos); `delegacoes`, limite de filhas, tempo por chamada, execução concorrente recusada; falha de qualquer função injetada não derruba a execução.
- **Registro de ferramentas:** esquema só com o que é validado de verdade, cópia congelada da ferramenta e dos argumentos, `__proto__`/`NaN`/`BigInt` tratados, resumo seguro para quem aprova,
  auditoria que bloqueia o irreversível quando falha, ferramenta travada não acumula execuções.
- **Memória:** leitura incremental para vários processos (testado com processos de verdade), `compactar()` com trava, validação do formato do arquivo, teto de tamanho, controles recusados,
  `save_memory` marcada como destrutiva.
- **RAG corretivo:** limiar mínimo sempre > 0, notas não finitas valem 0, ids repetidos, limites de trechos e de reescritas.
- **Cliente HTTP do modelo:** sem seguir redirecionamentos, recusa chave real por `http://` para host remoto, `--confirmo-envio-externo` para `--entrada`/`--raiz`.
- Documentação: o que não roda hoje (projetos P5 e P6), linha de base e falsos negativos, avisos sobre `save_memory` por MCP e sobre lições sem expiração.

**Origem e privacidade:** o ponto de partida foram `mcp-remember-jps` e `jps-agents`, repositórios do mantenedor (este último não é público). Nada de arquivos de ambiente, endereços, identificadores de
contêiner, chaves ou nomes de projetos privados foi copiado; veja [extensoes/README.md](extensoes/README.md#de-onde-veio-o-material-e-o-que-não-veio) (inclui um pedido de confirmação ao mantenedor sobre os snapshots).

**Pendente**

- Executar o time e a Lição 1 contra um LLM real e registrar modelo, limiares e ajustes de prompt.
- `--veredito` (o seu veredito final virar lição candidata), ferramenta de busca para o projeto P5, papel `tutor` para o P6 e o verificador de comandos de README do P2.
- Lições 2 a 16 e laboratório de GraphRAG.

## 2026-10-17 · Criação da Academia

**Adicionado**

- Roadmap de 16 etapas em 5 fases, com a ligação de cada etapa ao material que o repositório já tem e as lacunas a
  preencher ([ROADMAP.md](ROADMAP.md)).
- 24 competências e quatro níveis de domínio ([competencias.md](competencias.md)).
- Sistema de gamificação e acompanhamento: XP (quiz 10, laboratório 30, explicação 15, revisão 10, opcional 20),
  níveis Aprendiz, Construtor, Investigador e Engenheiro (XP **e** checkpoints), cinco checkpoints, 20 conquistas e
  revisão espaçada contada em sessões ([GAMIFICACAO.md](GAMIFICACAO.md)).
- Acompanhamento individual por arquivos versionados: dois alunos independentes (`alunos/responsavel` e
  `alunos/werther`), um relatório por sessão (não reescrito depois), cartão de retomada e visão geral geradas, e o
  comando `kit` que monta o texto de uma conversa nova ([SINCRONIZACAO.md](SINCRONIZACAO.md)).
- Projeto evolutivo "Assistente Técnico" com um marco por etapa ([projeto/](projeto/)).
- Templates: lição (14 seções), relatório de sessão, relatório de laboratório e perfil ([templates/](templates/)).
- [Missão 0 · Diagnóstico](licoes/00-missao-0-diagnostico/) (perfil, checagem de ambiente, 16 perguntas) e
  [Lição 1 · Tokens, contexto, inferência e limites](licoes/01-tokens-contexto-inferencia/) (microlição, 9 perguntas com
  gabarito comentado, laboratório com verificador automático e rubrica).
- `AI_CONTEXT.md` na raiz: regras para o assistente de IA.
- `ferramentas/academia.mjs`: valida conteúdo, links, segredos e registros; gera `retomada.md` e `PROGRESS.md`; cria sessões
  e alunos. Sem dependências.

**Endurecido após revisão independente (código e conteúdo)**

- XP só de linhas válidas; `progresso` recusa gravar se houver erro; evidência de arquivo confinada à pasta do aluno,
  com diferenciação de maiúsculas (como no GitHub); revisões em ordem e no prazo; opcionais limitados; etapas sem lição
  pronta não rendem XP; `retomada: sim` exige 14 dias de pausa.
- `validar --aluno` e `progresso <aluno>`: o estado de um aluno nunca bloqueia o outro. `PROGRESS.md` sem datas.
- Varredura de segredos ampliada (todos os arquivos de texto da Academia, URLs com credenciais, query strings,
  `Bearer` em qualquer caixa); saída de `checar-ambiente.mjs` e `medir.mjs` mascara credenciais.
- Verificador da Lição 1 compara textos e parâmetros com o kit e deixa claro que checa coerência, não honestidade.
- Gabarito Q4 corrigido (alternativa B); janela do servidor ≠ janela do modelo (Ollama) documentada.

**Decisões**

- Nada em `modulos/`, `trilhas-extras/`, `referencia/`, `infra/` ou `ementa/` foi alterado. A Academia aponta para eles.
- Tópicos avançados (modelos locais e quantização, LoRA, LangGraph, GraphRAG/CRAG, multiagente) ficaram como
  extensões opcionais, não no núcleo.
- Valor de XP do desafio `opcional` (20) definido aqui; os demais seguem a referência inicial da especificação.

**Pendente**

- Lições 2 a 16: o plano de cada uma está no ROADMAP; os `roteiro` viram `pronta` à medida que forem escritas.
- Primeira execução da Lição 1 contra um LLM real (o laboratório foi testado contra um servidor falso).
