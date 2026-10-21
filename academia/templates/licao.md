---
etapa: 0
titulo: Título da lição
competencias: C00
duracao_min: 180
revisado_em: AAAA-MM-DD
---

# Lição N · Título da lição

> Copie este arquivo para `academia/licoes/NN-slug/README.md` e preencha as 15 seções, **na ordem e com estes
> títulos**: o validador (`node academia/ferramentas/academia.mjs validar`) confere. Apague os comentários `>`.
> No front matter: `etapa` (número do [ROADMAP](../ROADMAP.md)), `competencias` (IDs de
> [competencias.md](../competencias.md)), `duracao_min` e `revisado_em` (data da última revisão do conteúdo).
>
> A lição **ensina e avalia**: não é uma lista de tópicos. Se uma seção não puder ser cumprida, a lição não está pronta.

## 1. Identificação e pré-requisitos

> Tabela: etapa, fase, competências (com link), pré-requisitos (etapas e ferramentas instaladas), material do
> repositório que já cobre o assunto (links para `modulos/`).

## 2. Objetivos de aprendizagem

> 3 a 5 objetivos observáveis, cada um começando com um verbo de ação ("Medir", "Explicar", "Implementar").
> Cada objetivo deve ser coberto por pelo menos um item do quiz, do desafio ou da rubrica.

## 3. Duração estimada

> Tabela com o tempo de cada parte (microlição, quiz, desafio, explicação, relatório). Referência: 3 horas.

## 4. Microlição

> Explicação didática, com analogia, diagramas e exemplos executáveis. Separe o que é **fundamento durável** do
> que é **específico de fornecedor** (com a data da verificação).

## 5. Material complementar

> Links com **uma linha de justificativa** cada (por que ler, quando, o que ganhar). Prefira documentação oficial e
> cursos práticos; marque os links que não puderam ser verificados.

## 6. Exemplos práticos

> Código que o aluno executa e observa. Diga o que esperar e o que observar. Exemplos que dependem de serviço
> externo são marcados.

## 7. Quiz de fixação

> Perguntas curtas, de recuperação ativa. **Não revele o gabarito aqui**: ele fica em `gabarito.md`, com correção
> comentada (por que a certa é certa **e** por que cada errada é errada).

## 8. Desafio hands-on

> Um problema concreto, com entrada, saída esperada e restrições. Diga onde o aluno guarda a entrega
> (`academia/alunos/<aluno>/entregas/etapa-NN/`) e como ela se conecta ao [projeto evolutivo](../projeto/README.md).

## 9. Critérios de aceitação

> Lista numerada de critérios **objetivos e verificáveis** (de preferência por um script ou teste). Cada critério
> tem ID (`CA1`, `CA2`...) para citar no relatório.

## 10. Rubrica de avaliação

> Tabela por critério qualitativo, com descrição dos níveis 0 a 3 (veja [competencias.md](../competencias.md#níveis-de-domínio)).
> Diga qual nível de cada competência a evidência sustenta.

## 11. Dicas graduais

> Três ou quatro dicas em ordem crescente de ajuda, cada uma em `<details>`. A solução nunca vem primeiro; o
> assistente só libera a dica seguinte depois de uma tentativa registrada.

## 12. Modelo de relatório do aluno

> Estrutura do relatório que o aluno entrega (use [entrega-laboratorio.md](entrega-laboratorio.md) como base).

## 13. Competências registradas

> Tabela: competência, evidência que comprova, nível 1/2/3 e o que falta para o nível seguinte.

## 14. Referências e última revisão

> Fontes oficiais com data de verificação, separadas em **fundamentos duráveis** e **dependentes de ferramenta**.
> Registre a data da última revisão e o que deve ser reverificado primeiro quando a lição envelhecer.

## 15. Aplicação, reforço e desafios

> Fecha o ciclo: do conceito ao uso real e do uso real de volta ao conceito (recuperação ativa). Seis blocos, **nesta
> ordem e com estes títulos** (o validador confere). Nada aqui cria XP novo: os desafios `opcional` seguem a regra de
> 20 XP e no máximo 3 por etapa ([GAMIFICACAO.md](../GAMIFICACAO.md#desafios-opcionais)).

### 15.1 Onde isso aparece no trabalho

> Três situações reais (quem faz o quê e qual decisão o conceito muda), os **erros comuns** que aparecem quando o
> conceito é ignorado e o **sinal de alerta** que os denuncia (o que você veria num log, numa conta ou num usuário
> reclamando). Cite o que for verificado em fontes; não invente números.

### 15.2 Reforço (revisão espaçada)

> Cinco perguntas de revisão, **V1.** a **V5.**, no início da linha e em ordem. Elas são **diferentes** das do quiz (seção 7),
> de formatos variados (prever um resultado, achar o erro num trecho, calcular, explicar com as próprias palavras, aplicar a um
> caso novo) e respondidas **de memória**. Só as perguntas ficam aqui: a correção comentada de cada uma vai em `gabarito.md`,
> em `## V1 · ...` a `## V5 · ...`. O `kit` e o cartão de retomada trazem este bloco nas revisões sugeridas (R<NN>-1 a R<NN>-4).
> Não coloque aqui dicas nem a lista de erros comuns: ela revelaria as respostas (os erros comuns ficam no 15.1).

### 15.3 Desafio de transferência

> A mesma habilidade num contexto que o aluno não praticou (outro corpus, outro provedor, outra linguagem, um problema do
> próprio trabalho), com critérios objetivos e sem verificador obrigatório. Se rende XP, é um dos `E<NN>-opcional-N` já
> listados na seção 8 (no máximo 3 por etapa; diga qual e o que registrar como evidência); senão, diga que é **sem XP**.
> Inclua o "ensine a um colega": explicar a lição em 5 minutos a alguém que não a estudou e anotar onde a pessoa se perdeu.

### 15.4 Ponte com o projeto e com a prática

> O marco do [projeto evolutivo](../projeto/README.md) que esta lição entrega, qual dos [projetos práticos do time de agentes](../extensoes/time-de-agentes/projetos-praticos.md)
> usa o que foi aprendido e que módulo do repositório aprofunda (versões JavaScript e Python).

### 15.5 Calibragem

> Uma previsão **antes** de executar o laboratório ("prevejo X") e o confronto **depois** ("medi Y; a diferença foi Z porque...").
> Registre no relatório do aluno, junto com a confiança de cada resposta do quiz. Quem se superestima sistematicamente
> (confiança alta, acerto baixo) revê o quiz antes de ler o material da etapa seguinte.

### 15.6 Hack de produtividade

> Uma dica do [catálogo de Productivity Hacks](../extensoes/productivity-hacks/README.md) que combina com o assunto da lição e que o aluno pode
> aplicar HOJE, no formato: **Sabia que você pode** <ação concreta> **para melhorar** <resultado que se mede>? Cite o id da dica
> (`PH-XXX-NN`, precisa existir no catálogo: o validador confere), o "faça agora" em até 3 passos, tempo e custo, e o **cuidado** (o que não enviar à nuvem
> e o que exige aprovação humana). Se a dica vira um dos projetos práticos, linke-o. Opcional e **sem XP**: o objetivo é o aluno medir o
> ganho (tempo, custo ou erro) com os próprios números, nunca acreditar em promessa.
