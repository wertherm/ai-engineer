---
aluno: slug-do-aluno
data: AAAA-MM-DD
sessao: 1
etapa: 0
status_etapa: em-andamento
retomada: nao
assistente: nome do assistente de IA usado (opcional)
---

# Sessão 1 · AAAA-MM-DD · Etapa 0

> Salve este arquivo como `academia/alunos/<aluno>/sessoes/AAAA-MM-DD-sNN.md` (ou gere-o com
> `node academia/ferramentas/academia.mjs sessao <aluno>`). **Um arquivo por sessão.** Sessões registradas não são
> reescritas: um XP esquecido entra na sessão seguinte; só se corrige uma sessão antiga para consertar um erro de
> formato ou de valor apontado pelo validador. Apague os comentários `>`.
>
> `sessao` e `data` precisam bater com o nome do arquivo (o número vem do `retomada.md`: "Próxima sessão").
> `retomada: sim` só com 14 dias ou mais desde a sessão anterior.
>
> Front matter: `status_etapa` é `em-andamento`, `pausada` ou `concluida`; `retomada` é `sim` se esta é a primeira
> sessão depois de uma pausa. `concluida` exige `E<NN>-quiz` e `E<NN>-lab` aprovados (nesta sessão ou nas anteriores).

## Resumo

> 3 a 5 linhas: o que foi estudado e feito, e como o aluno se sentiu em relação ao ritmo.

## Atividades

> Uma linha por atividade **comprovada**. `tipo`: `quiz`, `laboratorio`, `explicacao`, `revisao`, `opcional`.
> Exemplo de linha: `| E01-quiz | quiz | 1 | aprovado | `entregas/etapa-01/quiz.md` | 10 |`.
> `resultado`: `aprovado`, `parcial` ou `reprovado`. XP só na tentativa `aprovado` e conforme a
> [tabela de XP](../GAMIFICACAO.md#xp); nas demais, 0. A evidência de quiz, laboratório, explicação e opcional é o
> **caminho de um arquivo existente em `entregas/`**, entre crases, relativo à pasta do aluno; a de revisão pode ser uma
> nota objetiva. Revisões: `R<etapa>-1`, `R<etapa>-2`... em ordem e no prazo (veja a [revisão espaçada](../GAMIFICACAO.md#revisão-espaçada)).

| id | tipo | tentativa | resultado | evidência | XP |
|---|---|---|---|---|---|

## Competências

> Nível 0 a 3 (veja [competencias.md](../competencias.md#níveis-de-domínio)) com a evidência que o sustenta. Só
> liste as competências que apareceram nesta sessão. Exemplo: `| C01 | 1 | confundiu token com palavra no quiz |`.

| id | nível | evidência |
|---|---|---|

## Checkpoints

> Só em sessões de checkpoint. `resultado`: `aprovado` ou `pendente`.

| id | resultado | evidência |
|---|---|---|

## Feedback

> Feedback do assistente (ou do par): o que foi bem, o que corrigir e por quê. Específico e acionável.

## Pendências

> O que ficou aberto. Uma linha por item, começando com `- `.

- nenhuma

## Próxima missão

> Uma frase: o que fazer na próxima sessão (a primeira ação, não um plano).

