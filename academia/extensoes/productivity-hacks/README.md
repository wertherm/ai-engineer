# Productivity Hacks: usar IA para ganhar tempo (e aprender ganhando)

Dicas do tipo **"Sabia que você pode ___ para melhorar ___?"**, projetos práticos com desenvolvimento e um olhar honesto sobre o que rende de verdade: tempo, na maioria dos casos, e, com muito mais cuidado, às vezes dinheiro. Cobre ditado e transcrição por voz, e-mail e agenda, automações e assistentes, o Telegram como interface e as contas de retorno.

**O que isto é:** um catálogo de 42 dicas em cinco trilhas, 11 projetos com critérios de aceitação testáveis e um pequeno código de referência, tudo com a data da pesquisa (2026-10-21) e a marca do que foi e do que não foi verificado.
**O que isto NÃO é:** não promete ganho de tempo nem de dinheiro (o ganho é o que **você mede**), não recomenda produto pago, não é aconselhamento jurídico, contábil ou tributário e não é um convite para dar a um agente acesso irrestrito às suas contas.

> Leia a [segurança comum](seguranca.md) antes de ligar qualquer dica a uma conta, a um bot ou a uma API paga.

## Como isto entra na Academia

1. **Em cada lição**, no bloco **15.6 · Hack de produtividade**: uma dica que combina com o assunto, para aplicar hoje, no formato "Sabia que você pode... para melhorar...?". O validador exige que a dica citada exista aqui, e o `kit` manda o assistente apresentá-la perto do fim da sessão. É opcional e **não rende XP**.
2. **Neste catálogo**, nas cinco [trilhas](#as-cinco-trilhas): cada dica tem o passo a passo, tempo e custo, o cuidado (o que **não** enviar à nuvem), em que etapa encaixa e, se for o caso, o projeto em que ela vira desenvolvimento.
3. **Nos [projetos que rendem](projetos-que-rendem.md)**: onze projetos com critérios de aceitação que viram testes. Se você os fizer, registre como desafio `opcional` da etapa, se couber nas [regras de XP](../../GAMIFICACAO.md#desafios-opcionais); o ganho de verdade é a **medição** (antes e depois), não o XP.

## As cinco trilhas

| Trilha | O que cobre | Dicas | Projetos |
|---|---|---|---|
| [Voz](trilhas/voz.md) | ditado nativo e local, teste cego com WER, voz que vira tarefa, transcrição de áudio longo, reunião com consentimento | 7 | PP-03 |
| [E-mail e agenda](trilhas/email-e-agenda.md) | resumo e filtros nativos, foco e fusos, resumo da manhã no Telegram, texto invisível e injeção de prompt, agente com aprovação | 8 | PP-04, PP-09 |
| [Automações e assistentes](trilhas/automacoes.md) | CLAUDE.md, skills, `claude -p`, hooks, relatórios agendados, notas fiscais, formulários, monitores, segundo cérebro, no-code ou código, revisão de PR | 12 | PP-06, PP-07, PP-08 |
| [Telegram como interface](trilhas/telegram.md) | aviso de script, relatório diário, bot só seu, botão de confirmar, idempotência, teste sem token, aprovação no n8n, Claude Code pelo celular | 8 | PP-01, PP-02, PP-03, PP-05, PP-06 |
| [Ganhar tempo e, com realismo, dinheiro](trilhas/ganhar.md) | a conta do retorno, cronometrar, custo de inferência, oito perguntas, Stars do Telegram, do hack ao serviço, Brasil (MEI, nota, LGPD), golpes | 7 | PP-10, PP-11 |

## Quando fazer cada dica

Gerado do campo "Entra em" de cada dica (`node academia/ferramentas/produtividade.mjs mapa --escrever`); o `validar` avisa se estiver desatualizado.

<!-- mapa-por-etapa:inicio (gerado por: node academia/ferramentas/produtividade.mjs mapa --escrever) -->
- **Qualquer momento:**
  - [PH-AUT-08](trilhas/automacoes.md) · Monitor de preços e páginas, sem LLM
  - [PH-AUT-10](trilhas/automacoes.md) · Expansor de texto como biblioteca de prompts
  - [PH-AUT-11](trilhas/automacoes.md) · No-code ou código? Escolhendo a ferramenta de automação
  - [PH-EMA-01](trilhas/email-e-agenda.md) · Resumo de conversa grátis no Gmail, com cautela
  - [PH-EMA-02](trilhas/email-e-agenda.md) · Filtros e rótulos antes de qualquer IA
  - [PH-EMA-03](trilhas/email-e-agenda.md) · Blocos de foco e link de agendamento
  - [PH-EMA-04](trilhas/email-e-agenda.md) · Dois fusos na mesma grade
  - [PH-GAN-01](trilhas/ganhar.md) · Vale automatizar? A conta antes do código
  - [PH-GAN-02](trilhas/ganhar.md) · Cronometre antes e depois
  - [PH-GAN-05](trilhas/ganhar.md) · Oito perguntas antes de investir horas
  - [PH-GAN-06](trilhas/ganhar.md) · Monetização no Telegram: o que existe e quais são as regras
  - [PH-VOZ-01](trilhas/voz.md) · Ditar antes de pagar por qualquer coisa
  - [PH-VOZ-03](trilhas/voz.md) · Ditado local e gratuito (Handy)
  - [PH-VOZ-07](trilhas/voz.md) · Reunião: grave e transcreva só com consentimento
- **Etapa 1:**
  - [PH-GAN-03](trilhas/ganhar.md) · Modelo pequeno na triagem, grande nos casos difíceis
- **Etapa 2:**
  - [PH-TEL-01](trilhas/telegram.md) · Aviso de qualquer script em uma linha
  - [PH-TEL-02](trilhas/telegram.md) · Relatório diário no celular com GitHub Actions
  - [PH-TEL-05](trilhas/telegram.md) · Ignore updates repetidos pelo update_id
  - [PH-TEL-06](trilhas/telegram.md) · Teste seu bot sem token real: um Telegram falso
- **Etapa 3:**
  - [PH-AUT-03](trilhas/automacoes.md) · `claude -p` em script, com JSON e teto de custo
  - [PH-AUT-05](trilhas/automacoes.md) · Relatório agendado, sem duplicar
  - [PH-AUT-07](trilhas/automacoes.md) · Triagem de formulários com saída estruturada
  - [PH-EMA-05](trilhas/email-e-agenda.md) · Resumo da manhã no Telegram
  - [PH-EMA-06](trilhas/email-e-agenda.md) · Dossiê de uma página antes de cada reunião
  - [PH-VOZ-02](trilhas/voz.md) · Teste cego de 10 frases para escolher a ferramenta
  - [PH-VOZ-04](trilhas/voz.md) · Pensar em voz alta e deixar o LLM estruturar
  - [PH-VOZ-06](trilhas/voz.md) · Voz vira tarefa ou evento, com confirmação
- **Etapa 4:**
  - [PH-AUT-06](trilhas/automacoes.md) · Notas fiscais e PDFs: XML primeiro, LLM depois
  - [PH-VOZ-05](trilhas/voz.md) · Transcrever um áudio longo no seu computador
- **Etapa 5:**
  - [PH-AUT-09](trilhas/automacoes.md) · Segundo cérebro com busca local
- **Etapa 6:**
  - [PH-AUT-09](trilhas/automacoes.md) · Segundo cérebro com busca local
- **Etapa 8:**
  - [PH-GAN-03](trilhas/ganhar.md) · Modelo pequeno na triagem, grande nos casos difíceis
  - [PH-GAN-04](trilhas/ganhar.md) · Cache e lote para baratear o que se repete
- **Etapa 11:**
  - [PH-AUT-04](trilhas/automacoes.md) · Hooks: regras que sempre valem
  - [PH-AUT-07](trilhas/automacoes.md) · Triagem de formulários com saída estruturada
  - [PH-EMA-07](trilhas/email-e-agenda.md) · Tire o texto invisível e os links antes de resumir
  - [PH-EMA-08](trilhas/email-e-agenda.md) · Agente de e-mail com aprovação, testado contra injeção
  - [PH-TEL-03](trilhas/telegram.md) · Bot só seu: lista de IDs permitidos
  - [PH-TEL-04](trilhas/telegram.md) · Botão Confirmar antes de agir
  - [PH-TEL-07](trilhas/telegram.md) · Aprovação humana de agente no n8n, pelo Telegram
  - [PH-VOZ-06](trilhas/voz.md) · Voz vira tarefa ou evento, com confirmação
- **Etapa 13:**
  - [PH-AUT-01](trilhas/automacoes.md) · Um CLAUDE.md ou AGENTS.md curto
  - [PH-AUT-02](trilhas/automacoes.md) · Skills para rotinas repetidas
  - [PH-AUT-03](trilhas/automacoes.md) · `claude -p` em script, com JSON e teto de custo
  - [PH-AUT-04](trilhas/automacoes.md) · Hooks: regras que sempre valem
  - [PH-AUT-12](trilhas/automacoes.md) · Primeira leitura do pull request por um agente
  - [PH-TEL-08](trilhas/telegram.md) · Claude Code pelo Telegram (prévia de pesquisa)
- **Etapa 14:**
  - [PH-GAN-07](trilhas/ganhar.md) · Do hack ao serviço: o primeiro cliente
- **Etapa 15:**
  - [PH-AUT-05](trilhas/automacoes.md) · Relatório agendado, sem duplicar
  - [PH-GAN-07](trilhas/ganhar.md) · Do hack ao serviço: o primeiro cliente
  - [PH-TEL-06](trilhas/telegram.md) · Teste seu bot sem token real: um Telegram falso
<!-- mapa-por-etapa:fim -->

## Código de referência

Pequeno, sem dependências (Node 22+), com testes. **Tudo foi testado só contra simulações**: nada foi executado contra o Telegram, um provedor de e-mail ou um LLM reais, e as dicas que citam produtos de terceiros (Wispr Flow, n8n, Claude Code, Gmail...) **não** foram testadas por quem escreveu: seguem a documentação lida em 2026-10-21. A primeira execução real deve usar um bot de teste e um chat só seu, e ser registrada no [CHANGELOG](../../CHANGELOG.md).

| Arquivo | Para quê | Dicas e projetos |
|---|---|---|
| [`telegram-falso.mjs`](referencia/telegram-falso.mjs) | servidor local que imita uma parte **simplificada** da Bot API (limites de texto, `callback_data`, `getUpdates` com `offset`, webhook, `getFile`, 429 com `retry_after`); permite testar bots sem token e sem rede | PH-TEL-06, PP-01 a PP-05 |
| [`ponte-telegram.mjs`](referencia/ponte-telegram.mjs) | cliente da Bot API (divide texto, escapa HTML, repete só o que vale, nunca mostra o token), processador de updates (lista de IDs, anti-repetição) e canal de aprovação por botões que se encaixa no [registro de ferramentas](../harness-de-agentes/README.md) | PH-TEL-03, 04, 05, PP-02, PP-05 |
| [`demo-aprovacao.mjs`](referencia/demo-aprovacao.mjs) | demonstração de ponta a ponta contra o Telegram falso: o agente propõe, o registro valida, o dono aprova ou nega, o código executa | PH-TEL-04, PP-05 |
| [`saida-segura.mjs`](referencia/saida-segura.mjs) | limpa texto na entrada (invisíveis, HTML escondido) e na saída do modelo (imagens, links e URLs fora de uma lista de permissão); **mitigação, não prova** | PH-EMA-07, PP-04, PP-09 |
| [`wer.mjs`](referencia/wer.mjs) | taxa de erro de palavras para o teste cego de ditado | PH-VOZ-02, PP-03 |
| [`retorno.mjs`](referencia/retorno.mjs) | payback de uma automação, cenário pessimista, regra de bolso, custo de inferência e margem de uma assinatura (nenhum preço mora no código) | PH-GAN-01, 02, 03, PP-10 |

```bash
node academia/ferramentas/testar.mjs                                       # a suíte rápida da Academia (inclui estes testes)
node --test "academia/extensoes/productivity-hacks/referencia/*.test.mjs"  # só os deste catálogo
node academia/extensoes/productivity-hacks/referencia/demo-aprovacao.mjs   # a demonstração (sem token, sem rede)
```

## Como acrescentar uma dica ou um projeto

1. Copie o formato de uma dica existente: título `### PH-XXX-NN · Título` (numeração seguida, sem buracos), o parágrafo **Sabia que você pode** ... **para melhorar** ...? e os campos **Faça**, **Tempo e custo**, **Cuidado**, **Entra em**, **Vira projeto?** e **Fontes**.
2. Toda fonte com URL leva a marca `[verificado]` ou `[não verificado]` (você abriu a página? Se só leu um resumo ou um resultado de busca, diga). O que for opinião leva `[opinião]`.
3. Fale do risco: o que **não** enviar à nuvem, o que exige aprovação humana. Não cite preço sem moeda e data. Não prometa ganho.
4. Se a dica vira projeto, o projeto lista a dica em **Dicas** e a dica cita o projeto em **Vira projeto?** (o validador confere os dois lados).
5. Atualize o mapa (`node academia/ferramentas/produtividade.mjs mapa --escrever`) e rode `node academia/ferramentas/academia.mjs validar`.

## Como foi pesquisado, e o que não foi verificado

Cinco pesquisas independentes em 2026-10-21, uma por tema (voz; e-mail e agenda; automações; Telegram; ganhos). Limites que valem para tudo:

- As páginas foram lidas por **resumos de um modelo auxiliar**, não pelo HTML bruto: números críticos (preços, limites, taxas, multas) precisam de reconferência na fonte antes de virarem decisão.
- Onde a fonte oficial não abriu (bloqueio, 403, 404, página que só carrega com script), a dica diz isso e marca `[não verificado]`.
- Dois pontos em que as leituras **discordaram** e que ficaram como não verificados: as regras das Stars do Telegram (valor por Star, espera de 21 dias, validade) e o que cada página do Wispr Flow diz sobre armazenamento. Veja [ganhar](trilhas/ganhar.md) e [voz](trilhas/voz.md).
- O nome certo do app de ditado que costuma ser citado como "Whisper Flow" é **Wispr Flow** (outra empresa, outro produto); "Whisper" é o modelo aberto da OpenAI.
- Preço de assinatura de Claude Code, Codex, Cursor e Copilot **não foi pesquisado**; preços de planos pagos do Make e o consolidado atual da lista de ocupações do MEI também não foram confirmados.
- Quatro dos cinco agentes de pesquisa encontraram texto com instruções embutido no que leram na web e o trataram como dado: veja o final da [segurança comum](seguranca.md).
