# Projetos práticos para o dia a dia

Sete projetos que o [time de agentes](README.md) pode fazer por você, ordenados do mais simples ao mais ambicioso. Cada um tem **valor
imediato**, **critérios de aceitação objetivos** e uma **métrica de "vale usar?"**: se depois de duas semanas o time não economiza o seu
tempo ou não melhora a qualidade, o projeto volta para a prancheta. Todos reaproveitam o mesmo núcleo (`referencia/`), as
[personas e skills](../harness-de-agentes/README.md) e a [memória](../memoria-persistente-mcp/README.md).

**Por onde começar:** o P1. É o que dá retorno mais rápido (você revisa o seu próprio código antes de mostrar a alguém) e o que tem o critério
de aceitação mais claro.

## Antes de começar: o que roda hoje e o que ainda falta construir

Um agente sem material só consegue **escrever** que revisou ou testou algo. A CLI tem dois jeitos de dar material ao time: `--entrada <arquivo>`
(um diff, um trecho de código, um relatório) e `--raiz <pasta>` (ferramentas de leitura confinadas à pasta do projeto e, se você liberar no config,
`rodar_testes`). Cada uso de ferramenta é **registrado pelo harness** e é isso, não a narrativa do agente, que o avaliador confere.

| Projeto | Como entra o material | Roda hoje com a CLI? | O que você ainda precisa construir |
|---|---|---|---|
| **P1** Guardião de mudanças | `--entrada` com o `git diff`; `--raiz` para o time abrir os arquivos citados | **sim** | o gancho de pré-commit / comentário no PR (fase seguinte) |
| **P2** Documentação viva | `--raiz` (ler arquivos, listar, `git_diff`) | parcialmente: gera e revisa texto | o **verificador executável** que acusa comando de README que não roda (não existe neste repositório) |
| **P3** Triagem de backlog | `--entrada` com as suas notas (sem segredos nem dados pessoais) | **sim** | abrir issues (ação com efeito externo: exigiria uma ferramenta `irreversivel` com aprovação) |
| **P4** Fábrica de testes | `--raiz` + `ferramentas.comandoTestes` e `rodar_testes` liberado para o papel `testes` | **sim**, num projeto seu (executa o código dele) | mutação automática; hoje a mutação é manual (5 pontos) |
| **P5** Pesquisa com fontes | — | **não**: a CLI não tem ferramenta de busca | registrar uma ferramenta de busca sobre o seu corpus e ligá-la ao [fluxo corretivo](../rag-avancado/README.md) |
| **P6** Tutor da Academia | — | **não** | um papel `tutor` e a leitura do kit da sessão como ferramenta ou `--entrada` |
| **P7** Engenharia reversa | `--raiz` (somente leitura) | **sim** | a verificação por amostragem é sua; nenhuma ferramenta confere fato × inferência |

**Linha de base antes de comparar.** "O time ajudou" só significa algo contra uma referência: para as mesmas 10 tarefas, registre também (a) o resultado de **uma única chamada** ao
mesmo modelo, sem time, e (b) quanto tempo você gastaria sozinho. Sem isso, a métrica "vale usar se" de cada projeto é opinião.

**Falsos positivos e falsos negativos.** Meça os dois: quantos achados do time eram ruído **e** quantos defeitos reais (plantados de propósito ou achados depois por outro caminho)
ele deixou passar. Um avaliador que aprova tudo tem zero falso positivo e é inútil.

---

## P1 · Guardião de mudanças (revisão e testes antes do commit)

- **Problema:** erros bobos chegam ao pull request; revisão cansa.
- **Entrada:** `git diff` (ou os arquivos alterados) do seu projeto.
- **Time:** `testes` e `backend`/`frontend` como executores; `qa` e `seguranca` como avaliadores em cadeia.
- **Saída:** relatório com achados que **bloqueiam**, que **deveriam** ser corrigidos e sugestões; testes novos propostos; `arquivo:linha` em tudo.
- **Como rodar:** `git diff main > mudanca.diff` e `node referencia/cli.mjs --projeto meu-projeto --entrada mudanca.diff --raiz ../meu-projeto --criterio "cada achado cita arquivo:linha" --criterio "nenhum achado sem trecho de código que o comprove" "Revisar a mudança"`.
  (Um segredo plantado no diff é **recusado antes de ir ao modelo**: plante os outros defeitos; para o teste do segredo use o verificador de segredos da CLI, não o time.)
- **Aceitação:** (1) roda em 2 repositórios seus; (2) encontra 3 defeitos que você planta de propósito (falta de validação, teste que não prova nada, erro de lógica), com
  a mesma tarefa repetida 3 vezes para ver a variação; (3) falsos positivos **e** falsos negativos medidos em 10 mudanças reais, contra a linha de base de uma única chamada.
- **Vale usar se:** acha ≥ 1 problema real a cada ~10 mudanças com ≤ 20% de falsos positivos.
- **Evolui para:** gancho de pré-commit; comentários no PR; aprende os padrões de erro do seu código (lições `bug` e `padrao`).

## P2 · Documentação viva (README, ADRs e diagramas em sincronia com o código)

- **Problema:** a documentação envelhece e passa a mentir.
- **Entrada:** o repositório e o último commit documentado.
- **Time:** `documentos` e `diagramas`; avaliador `editor`.
- **Saída:** README e guias que um leitor novo executa; diagramas Mermaid com fontes (`arquivo:linha`) e o que é inferido marcado; ADR curto para cada decisão relevante.
- **Aceitação:** (1) outra pessoa (ou um assistente "limpo") segue o README do zero sem ajuda (como a etapa 15); (2) cada elemento de um diagrama aponta uma fonte;
  (3) um verificador executável acusa comando de README que não roda — **este verificador você precisa escrever** (extrair os blocos de código do README e rodá-los num diretório limpo).
- **Vale usar se:** o tempo para manter a documentação cai e os erros de "o doc dizia outra coisa" desaparecem.
- **Evolui para:** checagem na CI; "diff de documentação" a cada PR.

## P3 · Triagem de backlog (ideias e notas viram tarefas boas)

- **Problema:** anotações soltas e issues vagas que ninguém sabe começar.
- **Entrada:** suas notas, issues ou e-mails (sem segredos nem dados pessoais).
- **Time:** `manager` (decompõe) + roteador; avaliador `editor`.
- **Saída:** tarefas pequenas, cada uma com papel, **critérios verificáveis** e dependências; descarte das duplicadas.
- **Aceitação:** ≥ 80% das tarefas geradas aceitas por você sem edição relevante, em 20 itens reais; nenhuma tarefa sem critério verificável.
- **Vale usar se:** você passa a começar o dia por esta lista em vez de reescrevê-la.
- **Evolui para:** prioriza com seus critérios (perfil do dono) e abre issues com aprovação.

## P4 · Fábrica de testes (cobrir o que ninguém cobriu)

- **Problema:** módulos sem teste que ninguém ousa mexer.
- **Entrada:** um módulo e o comando de teste do projeto.
- **Time:** `testes` (executor) e `qa` (avaliador); quando achar bug, tarefa para o dono do código.
- **Saída:** testes determinísticos, a **saída da execução registrada pelo harness** (não colada pelo agente), lacunas declaradas e bugs encontrados com causa provável.
- **Como rodar:** `ferramentas.comandoTestes` no config e `rodar_testes` liberado ao papel `testes`; `--raiz` apontando para o projeto. O critério "os testes passam" só é aceito com
  uma execução bem-sucedida registrada.
- **Aceitação:** (1) a suíte nova passa duas vezes seguidas; (2) cada teste **falha** quando você quebra o código de propósito (teste de mutação manual em 5 pontos);
  (3) nenhuma alteração em código de produção sem tarefa própria.
- **Vale usar se:** a cobertura sobe **e** os testes pegam regressões reais depois.
- **Evolui para:** mutação automática; testes de contrato de API.

## P5 · Pesquisa técnica com fontes

> **Não roda só com a CLI de hoje:** falta a ferramenta de busca sobre o seu corpus (veja a tabela acima).

- **Problema:** responder "como X funciona / o que mudou em Y" sem inventar.
- **Entrada:** uma pergunta e a sua base de documentos (o corpus do [projeto evolutivo da Academia](../../projeto/README.md) ou outro).
- **Time:** executor de pesquisa (recuperação + resposta com citações) e avaliador que checa **cada citação** e se há abstenção quando falta evidência.
- **Saída:** resposta curta, fontes verificáveis e o que **não** foi encontrado.
- **Aceitação:** 100% das citações apontam trechos que existem; 5 perguntas sem resposta na base resultam em "não sei" (etapas 6 e 7).
- **Vale usar se:** você confia na resposta sem reabrir as fontes na maioria das vezes, e as exceções são detectadas.
- **Evolui para:** CRAG/híbrido/reranking ([RAG avançado](../rag-avancado/README.md)); pesquisa na web com lista de permissão.

## P6 · O time como seu tutor (Academia)

> **Ainda não existe o papel `tutor`** nem a leitura do kit pela CLI: este projeto descreve o objetivo, não algo pronto. A Academia continua funcionando sem ele (assistente de IA + `academia.mjs`).

- **Problema:** manter a rotina de estudo e registrar o progresso sem fricção.
- **Entrada:** o [kit da sessão](../../SINCRONIZACAO.md) do seu aluno.
- **Time:** um `tutor` (executor com as regras do [AI_CONTEXT](../../../AI_CONTEXT.md)) e um avaliador que aplica a rubrica da lição.
- **Saída:** a sessão conduzida, o relatório da sessão no formato do template e as pendências.
- **Aceitação:** o relatório passa em `node academia/ferramentas/academia.mjs validar --aluno <aluno>`; nenhum XP sem evidência; o tutor não revela o gabarito antes da resposta.
- **Vale usar se:** você completa mais sessões por mês com o time do que sem ele, e o validador raramente reprova.
- **Evolui para:** gera lições novas das etapas em `roteiro` usando o template, sempre com revisão humana.

## P7 · Engenharia reversa de um sistema legado seu

- **Problema:** um repositório antigo que você não lembra como funciona.
- **Entrada:** o repositório (código seu ou com autorização) e as perguntas que importam.
- **Time:** `diagramas`, `documentos`, `backend` (leitura) e avaliadores `editor` e `seguranca`, seguindo o [protocolo de engenharia reversa](../engenharia-reversa/README.md).
- **Saída:** relatório com componentes, fluxo de dados, contratos, riscos, **fato × inferência** e diagramas com fontes.
- **Aceitação:** ≥ 90% das afirmações do relatório verificadas por você por amostragem de 20; riscos priorizados com cenário.
- **Vale usar se:** você retoma o projeto mais rápido do que lendo o código sozinho.
- **Evolui para:** gera o plano de modernização com tarefas para o próprio time.

---

## Como acompanhar o valor (para qualquer projeto)

Registre, por tarefa: papel, **aprovada na 1ª tentativa?**, nº de tentativas, escalonada?, **o seu veredito** (concordou?), tempo e custo. O relatório
de execução da CLI já traz as quatro primeiras; acrescente as duas últimas. Revise a cada duas semanas e **decida**: continuar, ajustar
(prompts, limiar, perfil) ou parar. Aprendizado sem medição vira superstição.
