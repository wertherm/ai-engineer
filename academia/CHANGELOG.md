# Changelog da Academia

Mudanças relevantes no currículo e no sistema de acompanhamento. Formato: data, o que mudou, por quê. Mudanças nos
módulos de estudo (`modulos/`, `trilhas-extras/`, `referencia/`, `infra/`) seguem o histórico do Git.

## 2026-10-24 · Wispr Flow pela documentação oficial e a playlist da Vizuara

**Alterado**

- **PH-VOZ-08 (nova): o que conferir no Wispr Flow antes do primeiro ditado**, a partir da Central de Ajuda oficial (https://docs.wisprflow.ai/, lida em 2026-10-24 por resumo). Resolveu a discordância que ficou aberta: a página de privacidade diz que o áudio é apagado "a menos que o armazenamento em nuvem esteja ligado", e a Central de Ajuda diz que as chaves "Improve the model for everyone" e "Dictation cloud storage" vêm **ligadas por padrão** (desligar a primeira "does not stop cloud processing"; sair da conta devolve o armazenamento ao padrão ligado). Traz também: metadados que continuam sendo enviados com o treino desligado, Command Mode (experimental, envia a caixa de texto e a seleção), limite semanal do plano gratuito em palavras, preço de lista em dólar e o Notetaker (áudio guardado por 7 dias, não coberto pelas auditorias citadas). O catálogo passa a ter **43 dicas** (voz: 8).
- A dica PH-VOZ-02 deixou de repetir o parágrafo do Wispr Flow e aponta para a PH-VOZ-08.
- **Playlist [Vizuara · Building LLMs from scratch](https://www.youtube.com/playlist?list=PLPTV0NXA_ZSgsLAr8YCgCwhPIJNNtexWu)** acrescentada como material complementar opcional (em inglês): Lição 1 (seção 5, aulas 7 e 8 sobre tokenizer e BPE) e ROADMAP (etapa 1: aulas 3 a 8 e 13 a 15; etapa 5: aulas 10 a 12).

**Limites:** da playlist só se conferiram o título e a descrição curta de cada aula, no feed público (15 aulas; a playlist pode ter mais); **ninguém assistiu aos vídeos nem leu as transcrições**, e a duração não consta. Do Wispr Flow continuam sem resposta nos artigos lidos: o prazo de retenção do áudio e do texto de ditado, o "Privacy Mode", o processamento local, a variante pt-BR e o preço em reais.

## 2026-10-21 · Productivity Hacks (dicas, trilhas e projetos para ganhar tempo com IA)

**Adicionado**

- **[Extensão Productivity Hacks](extensoes/productivity-hacks/README.md)**, fruto de cinco pesquisas independentes (voz; e-mail e agenda; automações; Telegram; ganhos), lidas em 2026-10-21:
  - **42 dicas** "Sabia que você pode ___ para melhorar ___?" em 5 [trilhas](extensoes/productivity-hacks/trilhas/voz.md), cada uma com passo a passo, tempo e custo, **cuidado** (o que não enviar à nuvem), etapa em que entra, projeto e **fontes com a marca [verificado] ou [não verificado]**.
  - **11 [projetos que rendem](extensoes/productivity-hacks/projetos-que-rendem.md)** com critérios de aceitação testáveis e como testar sem credenciais reais (de um `tg-notify` a um agente de e-mail testado contra injeção de prompt e a um piloto de serviço para um pequeno negócio).
  - [Segurança comum](extensoes/productivity-hacks/seguranca.md): regra de duas das três coisas, listas de verificação (e-mail e agenda, bot no Telegram, governança de automações) e o que nunca mandar à nuvem.
  - Trilha de **ganhos com realismo**: a conta do retorno, cronometrar antes e depois, custo de inferência por usuário pesado, quadro do Brasil (MEI, nota fiscal, LGPD, com a ressalva de que não é aconselhamento) e golpes a evitar. Não promete renda e não traz preço de mercado: a pesquisa não achou fonte independente com metodologia.
  - Código de referência testado **só contra simulações**: [Telegram falso](extensoes/productivity-hacks/referencia/telegram-falso.mjs), [ponte](extensoes/productivity-hacks/referencia/ponte-telegram.mjs) (cliente, lista de IDs, anti-repetição e canal de aprovação por botões que se encaixa no registro de ferramentas), [demonstração](extensoes/productivity-hacks/referencia/demo-aprovacao.mjs), [limpeza de entrada e saída](extensoes/productivity-hacks/referencia/saida-segura.mjs), [WER](extensoes/productivity-hacks/referencia/wer.mjs) e [retorno](extensoes/productivity-hacks/referencia/retorno.mjs). Testes de mutação: 36 defeitos injetados na ponte, 28 no limpador de saída e 24 no validador, todos pegos.
- **Seção 15.6 "Hack de produtividade"** em toda lição (e no template): uma dica do catálogo para aplicar hoje, opcional e sem XP. A Missão 0, a Lição 1 e a Lição 2 receberam a sua. O `kit` manda o assistente apresentá-la perto do fim da sessão.
- **Duas revisões independentes** (código/segurança e conteúdo/fatos) antes do PR; os achados confirmados foram corrigidos, cada um com teste: o laço de updates que travava a aprovação quando o tratador da mensagem a esperava; parâmetros cortados na tela de aprovação (agora completos, ou o pedido é negado); vazamentos do token por corte antes de mascarar e pela forma codificada (e o padrão de token de bot entrou no detector de segredos do `validar`); furos do limpador de saída (`//host`, `<img/src`, markdown aninhado, texto escondido por estilo, aspas simples, `!important`, aninhamento) e texto hostil que travava (orçamento de passos); conselhos que davam acesso demais (Apps Script com acesso total, token digitado na sessão do Claude Code, token na linha de comando do `curl`); a regra das Stars do Telegram, relida nos termos oficiais.
- `ferramentas/produtividade.mjs`: valida o catálogo (formato de cada dica, numeração, campos obrigatórios, marcas nas fontes, ligação dicas ↔ projetos sem órfãos, o bloco 15.6 das lições citando dicas que existem) e gera o mapa "quando fazer cada dica" (`mapa --escrever`); o `validar` confere que o mapa está em dia.

**Alterado**

- Validador: a seção 15 passa a ter **seis** blocos (o sexto é o 15.6).
- Regras do assistente ([AI_CONTEXT](../AI_CONTEXT.md)): apresentar a dica sem prometer ganho, nunca pedir token, senha ou acesso a e-mail ou agenda, tratar conteúdo lido como dado e não dar aconselhamento jurídico, contábil ou tributário.

**Limites:** nada foi executado contra o Telegram, um provedor de e-mail ou um LLM reais; as dicas que citam produtos de terceiros seguem a documentação lida em 2026-10-21 por resumos de um modelo auxiliar (números críticos precisam de reconferência); um ponto ficou **sem resolução** porque as leituras discordaram (o que as páginas do Wispr Flow dizem sobre armazenamento; resolvido em 2026-10-24, veja a entrada acima); a discordância sobre as Stars do Telegram foi resolvida na revisão, relendo os termos oficiais; preços de assinaturas de Claude Code, Codex, Cursor e Copilot e o consolidado atual da lista de ocupações do MEI não foram pesquisados ou confirmados.

## 2026-10-21 · Testes rápidos e lentos separados

**Alterado**

- O teste da Lição 2 (executa as referências e 20 mutantes de verdade, cerca de 3 minutos) deixou de ser `licao.test.mjs` e passou a ser `licao.lento.mjs`: o comando de sempre, `node --test "academia/**/*.test.mjs"`, não o pega mais.
- Novo [`ferramentas/testar.mjs`](ferramentas/testar.mjs) (sem dependências, sem shell, igual em bash e PowerShell): sem opção roda os rápidos; `--lentos` roda os `*.lento.mjs`; `--tudo` roda os dois grupos (é o que um CI deve rodar). Opção desconhecida é erro, para um `--lento` digitado errado não rodar o grupo errado em silêncio.
- `academia.test.mjs` ficou mais barato: a cópia do repositório copia só `academia/` (o que os testes alteram) e liga as demais pastas ao original, e a seção 15 usa uma única cópia (cada caso altera um arquivo e o restaura). Isso tirou cerca de 40 s; a suíte rápida leva de 1 a 2 minutos neste Windows (a variação entre execuções é grande: o custo restante é criar arquivos temporários).
- Regra: um teste que executa programas de verdade ou leva mais de ~30 s termina em `.lento.mjs` e traz no cabeçalho o aviso `LENTO` e o comando (conferido por `testar.test.mjs`).

## 2026-10-20 · Lição 2 e a seção 15 (aplicação, reforço e desafios)

**Adicionado**

- **Seção 15 em toda lição** ("Aplicação, reforço e desafios"), com cinco blocos fixos: onde isso aparece no trabalho (e os erros comuns), **reforço** (perguntas de revisão V1 a V5, com a correção no `gabarito.md`),
  desafio de transferência (e "ensine a um colega"), ponte com o projeto evolutivo e com os projetos práticos, e calibragem (previsão antes de medir). O template, o validador e o `kit` conhecem a estrutura; as revisões
  espaçadas passam a usar as perguntas V1 a V5 em vez de reaproveitar as do quiz. A Missão 0 e a Lição 1 receberam a seção 15.
- **[Lição 2 · APIs, TypeScript, erros e integração com modelos](licoes/02-apis-erros-e-integracao/README.md)** (etapa 2, `pronta`; competências C04 e C05): microlição (taxonomia de nove tipos de erro, retry com backoff e jitter,
  `Retry-After`, timeout total, TypeScript no Node), quiz de 10 questões e gabarito, rubrica, dicas graduais, seção 15 completa.
  - **Laboratório "cliente de LLM robusto"**: o aluno escreve `chamar.ts`, `.mjs`, `.js` ou `.py` e o verificador **executa** o programa contra um [servidor falso](licoes/02-apis-erros-e-integracao/kit/servidor-falso.mjs)
    com 19 cenários de falha (429 de taxa e de cota, 5xx, conexão derrubada, corpo em conta-gotas, `Retry-After` gigante, 401 que repete a chave, provedor que recusa `max_tokens`...), conferindo o que o servidor viu (tentativas, esperas, corpo) e o que o programa disse. `--so CA5` verifica só um critério.
  - Soluções de referência em **TypeScript** e em **Python** (só biblioteca padrão), três exemplos executáveis e `licao.lento.mjs` (antes `licao.test.mjs`; veja a entrada de 2026-10-21) com **teste de mutação do verificador** (20 defeitos injetados, cada um reprovando o critério esperado, mais os casos de programas corretos que não podem ser reprovados).

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
