# Gamificação e acompanhamento

Como a Academia mede o progresso de cada aluno. As tabelas deste arquivo são a **fonte de verdade**: o
validador ([ferramentas/](ferramentas/)) as lê para calcular XP, níveis e conquistas e para conferir os relatórios
de sessão. Mudou uma regra aqui? Rode `node academia/ferramentas/academia.mjs validar` e registre no
[CHANGELOG](CHANGELOG.md).

## Princípios

- **XP é motivação, não nota.** XP mede atividade comprovada. O que o aluno sabe fazer é medido por
  [competências](competencias.md) e por checkpoints.
- **Sem evidência, sem ponto.** Cada linha de XP aponta uma evidência (arquivo, saída de teste, resposta registrada).
- **Conclusão e competência são registros separados.** Terminar o laboratório rende XP; demonstrar a competência
  depende da rubrica.
- **XP nunca diminui.** Não existe streak, prazo nem penalidade por pausa. Voltar depois de semanas rende até uma
  conquista (`A19`).
- **Alunos independentes.** Cada aluno tem a própria pasta em [alunos/](alunos/). Nada que um aluno faz altera o
  XP, o nível ou as competências do outro.
- **Ranking é opcional** (veja o fim deste arquivo).

## XP

Valores iniciais de referência. São motivacionais: ajuste com cuidado e registre a mudança no CHANGELOG.

| Tipo | XP | O que comprova |
|---|---|---|
| `quiz` | 10 | Quiz ou recuperação ativa respondido **antes** de ver o gabarito, com a correção comentada revisada |
| `laboratorio` | 30 | Desafio hands-on concluído **e testado**: todos os critérios de aceitação objetivos cumpridos |
| `explicacao` | 15 | Explicação técnica independente, com as próprias palavras e sem consultar o material |
| `revisao` | 10 | Revisão espaçada de uma etapa anterior (recuperação ativa de conteúdo já estudado) |
| `opcional` | 20 | Desafio opcional de aprofundamento, concluído e testado (valor definido na criação da Academia) |

Regras:

1. O XP de uma atividade (`id`) é concedido **uma única vez**, na tentativa com resultado `aprovado`. Tentativas
   anteriores ficam registradas com XP 0.
2. Atividade sem evidência, com resultado diferente de `aprovado` ou de tipo desconhecido vale 0.
3. Checkpoint não rende XP: rende nível e conquistas.
4. Convenção de IDs das atividades: `E<etapa>-quiz`, `E<etapa>-lab`, `E<etapa>-explicacao`,
   `E<etapa>-opcional-<n>` e `R<etapa>-<n>` para a n-ésima revisão da etapa. A Missão 0 usa a etapa `00`.

## Níveis

O nível exige **XP mínimo e checkpoints aprovados**: XP sozinho não promove ninguém.

| Nível | XP mínimo | Checkpoints exigidos |
|---|---|---|
| Aprendiz | 0 | — |
| Construtor | 150 | CP1 |
| Investigador | 450 | CP1, CP2 |
| Engenheiro | 800 | CP1, CP2, CP3, CP4, CP5 |

- Aprendiz: entende os fundamentos e consegue repetir os exemplos.
- Construtor: integra LLMs por API e controla a saída com prompts versionados e schemas.
- Investigador: mede a recuperação e a fidelidade em vez de confiar na intuição.
- Engenheiro: entrega um sistema com agentes, segurança, observabilidade e execução reproduzível.

## Checkpoints de domínio

Um checkpoint fecha cada fase. É uma conversa curta e verificável (30 a 45 minutos), feita com o assistente ou
com o outro aluno como avaliador.

| ID | Fase | Após a etapa | Fecha |
|---|---|---|---|
| CP1 | 1 | 3 | Fundamentos de LLMs |
| CP2 | 2 | 8 | RAG e recuperação de conhecimento |
| CP3 | 3 | 11 | Agentes |
| CP4 | 4 | 14 | Ecossistema e arquitetura |
| CP5 | 5 | 16 | Projeto integrador (capstone) |

Para ser aprovado:

1. Todas as competências da fase no nível 2 ou mais (veja [competencias.md](competencias.md)).
2. Explicar, sem consulta, três conceitos da fase sorteados pelo avaliador.
3. Uma pequena alteração ao vivo no projeto evolutivo (por exemplo, trocar o `k` do retrieval e prever o efeito).
4. Registrar o resultado na tabela **Checkpoints** do relatório de sessão. Reprovar não custa nada: o relatório
   anota o que revisar e o checkpoint pode ser refeito em outra sessão.

## Conquistas

Conquistas celebram competências demonstradas. Uma vez ganhas, **nunca são revogadas**. A coluna `Regra` é lida
pelo validador.

| ID | Conquista | Regra | Descrição |
|---|---|---|---|
| A01 | Bússola | `ativ:E00-lab` | Ambiente da Missão 0 verificado |
| A02 | Contador de Tokens | `comp:C01,C02,C03>=2` | Entende tokens, contexto e inferência |
| A03 | Integrador | `comp:C04,C05>=2` | Chama LLMs por API com erros tratados e provedor trocável |
| A04 | Especificador | `comp:C06,C07>=2` | Prompts versionados e saídas validadas por schema |
| A05 | Fundação Sólida | `cp:CP1` | Checkpoint da Fase 1 |
| A06 | Fiel às Fontes | `comp:C11,C13>=2` | RAG com citações e abstenção |
| A07 | Medidor | `comp:C12>=2` | Avalia a recuperação com métricas |
| A08 | Recuperador | `cp:CP2` | Checkpoint da Fase 2 |
| A09 | Ferramenteiro | `comp:C15>=2` | Ferramentas com schema e function calling |
| A10 | Sob Controle | `comp:C16,C17>=2` | Agente com limites e aprovação humana |
| A11 | Cinto de Segurança | `cp:CP3` | Checkpoint da Fase 3 |
| A12 | Conector | `comp:C19>=2` | Constrói e consome MCP |
| A13 | Observador | `comp:C21,C22>=2` | Logs, métricas, custo e decisões registradas |
| A14 | Arquiteto | `cp:CP4` | Checkpoint da Fase 4 |
| A15 | Reprodutível | `comp:C23>=2` | Outra pessoa consegue executar o projeto |
| A16 | Engenheiro de IA | `cp:CP5` | Capstone aprovado |
| A17 | Memória de Elefante | `revisoes>=5` | Cinco revisões espaçadas aprovadas |
| A18 | Curioso | `opcionais>=3` | Três desafios opcionais concluídos |
| A19 | Bem-vindo de Volta | `retomadas>=1` | Retomou o curso depois de uma pausa |
| A20 | Explicador | `explicacoes>=5` | Cinco explicações técnicas independentes aprovadas |

Regras aceitas: `ativ:<id>` (atividade aprovada), `comp:<ids>>=<nível>` (todas as competências no nível mínimo),
`cp:<id>` (checkpoint aprovado), `xp>=<n>`, `revisoes>=<n>`, `opcionais>=<n>`, `explicacoes>=<n>`,
`retomadas>=<n>`.

## Revisão espaçada

A revisão espaçada conta **sessões**, não dias: pausar o curso não "vence" nada. Depois de concluir uma etapa, a
n-ésima revisão fica **sugerida** quando já passaram o número de sessões da tabela. Cada revisão aprovada vale
`revisao` e avança a etapa para o próximo intervalo.

| Revisão | Sessões após a conclusão |
|---|---|
| 1 | 1 |
| 2 | 3 |
| 3 | 7 |
| 4 | 15 |

Uma revisão são de 3 a 5 perguntas de recuperação ativa (as perguntas ficam no quiz e na seção 7 de cada lição),
respondidas de memória. Comece cada sessão com até três revisões sugeridas: o cartão de retomada
(`alunos/<aluno>/retomada.md`) lista quais são.

## Desafios opcionais

Cada lição pode propor desafios `opcional` (aprofundamento, extensões do projeto, comparação entre
implementações). Eles não bloqueiam nenhuma etapa. Extensões avançadas do [ROADMAP](ROADMAP.md#extensões-e-módulos-avançados)
(modelos locais, LoRA, LangGraph, GraphRAG, multiagente) entram aqui.

## Retomada após pausas

Não há prazo. Quem volta depois de dias ou meses:

1. Lê o próprio `retomada.md`: ele mostra onde parou, o que está pendente e as revisões sugeridas.
2. Faz a revisão sugerida mais antiga como aquecimento.
3. Se a revisão mostrar esquecimento, refaz o quiz da etapa antes de seguir. Nada é perdido: XP e conquistas
   ficam.

## Ranking opcional

Não há ranking calculado. O [PROGRESS.md](PROGRESS.md) lista os alunos em ordem alfabética e **só mostra o XP de
quem tem `compartilhar_xp: sim` no próprio `perfil.md`**. Comparar XP é uma conversa entre os dois alunos, nunca
uma obrigação. Alunos em ritmos diferentes não são comparados por velocidade.
