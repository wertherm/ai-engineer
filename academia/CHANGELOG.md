# Changelog da Academia

Mudanças relevantes no currículo e no sistema de acompanhamento. Formato: data, o que mudou, por quê. Mudanças nos
módulos de estudo (`modulos/`, `trilhas-extras/`, `referencia/`, `infra/`) seguem o histórico do Git.

## 2026-10-17 · Criação da Academia

**Adicionado**

- Roadmap de 16 etapas em 5 fases, com a ligação de cada etapa ao material que o repositório já tem e as lacunas a
  preencher ([ROADMAP.md](ROADMAP.md)).
- 24 competências e quatro níveis de domínio ([competencias.md](competencias.md)).
- Sistema de gamificação e acompanhamento: XP (quiz 10, laboratório 30, explicação 15, revisão 10, opcional 20),
  níveis Aprendiz, Construtor, Investigador e Engenheiro (XP **e** checkpoints), cinco checkpoints, 20 conquistas e
  revisão espaçada contada em sessões ([GAMIFICACAO.md](GAMIFICACAO.md)).
- Acompanhamento individual por arquivos versionados: dois alunos independentes (`alunos/responsavel` e
  `alunos/werther`), relatório de sessão imutável, cartão de retomada e visão geral geradas
  ([SINCRONIZACAO.md](SINCRONIZACAO.md)).
- Projeto evolutivo "Assistente Técnico" com um marco por etapa ([projeto/](projeto/)).
- Templates: lição (14 seções), relatório de sessão, relatório de laboratório e perfil ([templates/](templates/)).
- [Missão 0 · Diagnóstico](licoes/00-missao-0-diagnostico/) (perfil, checagem de ambiente, 15 perguntas) e
  [Lição 1 · Tokens, contexto, inferência e limites](licoes/01-tokens-contexto-inferencia/) (microlição, 9 perguntas com
  gabarito comentado, laboratório com verificador automático e rubrica).
- `AI_CONTEXT.md` na raiz: regras para o assistente de IA.
- `ferramentas/academia.mjs`: valida conteúdo, links, segredos e registros; gera `retomada.md` e `PROGRESS.md`; cria sessões
  e alunos. Sem dependências.

**Decisões**

- Nada em `modulos/`, `trilhas-extras/`, `referencia/`, `infra/` ou `ementa/` foi alterado. A Academia aponta para eles.
- Tópicos avançados (modelos locais e quantização, LoRA, LangGraph, GraphRAG/CRAG, multiagente) ficaram como
  extensões opcionais, não no núcleo.
- Valor de XP do desafio `opcional` (20) definido aqui; os demais seguem a referência inicial da especificação.

**Pendente**

- Lições 2 a 16: o plano de cada uma está no ROADMAP; os `roteiro` viram `pronta` à medida que forem escritas.
- Primeira execução da Lição 1 contra um LLM real (o laboratório foi testado contra um servidor falso).
