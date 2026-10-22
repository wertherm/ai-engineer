# Trilha · Telegram como interface

> Para quem já escreve scripts e quer receber avisos, confirmar ações com um botão e aprovar o que um agente faz, tudo pelo celular, usando o Telegram como interface.
> Ganha-se visibilidade do que roda sozinho e um ponto de controle antes de ações irreversíveis. O ganho de tempo é o que você mede, com cronômetro, antes e depois.
> Não é promessa de resultado, não é guia de monetização e não torna o Telegram um lugar confidencial: chats em nuvem não têm criptografia de ponta a ponta.
> Pesquisa lida em 2026-10-21. Preços e recursos mudam: confirme na fonte antes de decidir. As marcas [verificado] e [não verificado] seguem a pesquisa.

## Regras desta trilha
- **Token é senha.** O token do @BotFather é algo que "qualquer pessoa pode usar para controlar seu bot", e a documentação manda tratá-lo como senha. Fica em variável de ambiente ou cofre, nunca no repositório, em prompt de IA, em chat com IA, em print ou em log. Se vazou: `/token` no @BotFather, atualize todos os serviços e confira o que o bot fez. Fontes: https://core.telegram.org/bots/features [verificado] e https://core.telegram.org/bots/tutorial [verificado].
- **Criptografia, a conclusão correta.** Chats em nuvem não têm criptografia de ponta a ponta (E2E); só os Chats secretos têm. Um bot recebe em claro o texto que você manda a ele, e plataformas no meio (n8n, Zapier, Make, provedor de LLM) também veem o conteúdo (esta última parte é inferência da pesquisa). A frase literal "bots não têm E2E" NÃO existe na documentação que a pesquisa leu: é inferência, tirada de "chats em nuvem não usam E2E" mais "o bot vê as mensagens enviadas a ele". Fontes: https://tsf.telegram.org/manuals/e2ee-simple [verificado] e https://telegram.org/faq [verificado].
- **Não envie por um bot:** senhas, chaves de API, tokens (inclusive o do próprio bot), frases-semente, chaves privadas, códigos 2FA ou de uso único, documentos pessoais, dados bancários e de saúde, segredos de clientes ou da empresa, dados de terceiros sem consentimento. Obrigações legais sobre dados de terceiros (LGPD) a pesquisa não verificou: isto não é aconselhamento jurídico. Veja também [segurança](../seguranca.md).
- **Tudo que chega é dado não confiável:** mensagem, legenda, nome de arquivo, PDF, transcrição de áudio, página web. A lista de IDs permitidos fica no código, fora do prompt. Ação com efeito externo (enviar, apagar, pagar, publicar) só depois de aprovação humana por botão. Exemplo real da própria pesquisa: ao ler a página do Telegram Trigger do n8n, a ferramenta de leitura avisou de uma instrução embutida mandando enviar consultas a um endpoint externo; ela foi ignorada, e a origem não foi verificada.
- **Um bot por ambiente.** O Telegram aceita um único webhook por bot, então usar o mesmo token em teste e em produção faz um sobrescrever o outro. Em grupo, mantenha o modo de privacidade ligado, a menos que seja absolutamente necessário.
- **Meça antes de acreditar.** Tempos e custos abaixo são estimativas da pesquisa, não medidas suas: cronometre antes e depois. Todo código citado vem da pesquisa ou do repositório e não foi executado por quem escreveu esta trilha. A Bot API muda rápido (versão 10.3, de 24/08/2026), então reabra a página oficial antes de depender de um número.

## Bibliotecas e limites (lidos em 2026-10-21)

**Aviso para as duas tabelas:** a pesquisa leu resumos de um modelo auxiliar, não o HTML bruto das páginas: reabra a página oficial antes de depender de um número. Bot API atual na pesquisa: 10.3, de 24/08/2026 (https://core.telegram.org/bots/api-changelog [verificado]).

**Bibliotecas**

"Último release" é a data `published_at` da API do GitHub (UTC); "push" é a última atividade no repositório.

| Biblioteca | Linguagem | Versão e data do último release | Bot API coberta | Licença | Manutenção | Marca |
|---|---|---|---|---|---|---|
| python-telegram-bot | Python (`>=3.11` no master e no README; o JSON do PyPI mostra `>=3.10`) | v22.8, 2026-06-12 | 10.0 | LGPL-3.0-only (PyPI e `pyproject.toml`; o GitHub exibe "GPL-3.0 and 2 other licenses") | Push em 2026-10-19; está atrás da API (10.0 contra 10.3) | [verificado], via resumo |
| aiogram | Python (`>=3.10,<3.15`) | v3.31.0, 2026-08-25 | 10.3 | MIT | Push em 2026-10-20 | [verificado], via resumo |
| grammY | TypeScript/JavaScript (Node.js e Deno) | v1.46.0, 2026-08-26 | 10.3 | MIT | Push em 2026-10-16 | [verificado], via resumo |
| Telegraf | JavaScript/TypeScript (Node.js) | v4.16.3, 2024-02-29 | README diz 7.1 | MIT | Sem release desde 2024-02-29; commits de manutenção em 2026-09-24, também sem release; issue #2050 "Support API v8.0" aberta desde 2024-11-30 | [verificado], via resumo |

Demais bibliotecas, em uma linha: pyTelegramBotAPI (Python) 4.37.0, 2026-09-21, Bot API 10.3, GPL-2.0; go-telegram/bot (Go) v1.27.0, 2026-09-11, MIT; node-telegram-bot-api (JavaScript) v2.1.0, 2026-08-24, MIT; teloxide (Rust) v0.17.0, 2025-07-11, MIT; Telegram.Bot (C#) v22.4.4, 2025-02-24 no GitHub, MIT; Telethon (Python) 1.45.0 no PyPI, MIT, que é cliente MTProto e não um wrapper da Bot API. Marca: [verificado] para release e licença, via resumo; [não verificado] para a Bot API coberta por go-telegram/bot, teloxide, Telegram.Bot e node-telegram-bot-api, para o que mudou no node-telegram-bot-api 2.1.0, para a data do release do Telethon (o repositório devolveu 404) e para uma versão mais nova do Telegram.Bot no NuGet. A pesquisa leu resumos de um modelo auxiliar: reabra a página oficial antes de depender de um número.

[opinião] Em TypeScript, a grammY está alinhada à 10.3 e o Telegraf, sem release desde fev/2024, não é a escolha para projeto novo que precise de recursos de 2025 em diante. Em Python, a python-telegram-bot tem a maior base de exemplos e a aiogram acompanha a Bot API mais depressa. Sobre licenças, a pesquisa só as lê: isto não é aconselhamento jurídico.

Fontes das bibliotecas: https://api.github.com/repos/python-telegram-bot/python-telegram-bot/releases/latest [verificado] ; https://api.github.com/repos/aiogram/aiogram/releases/latest [verificado] ; https://api.github.com/repos/grammyjs/grammY/releases/latest [verificado] ; https://registry.npmjs.org/telegraf/latest [verificado] ; https://api.github.com/repos/telegraf/telegraf/commits?per_page=8 [verificado] ; https://pypi.org/pypi/telethon/json [verificado]

**Limites que mais importam**

| Limite | Valor | Marca |
|---|---|---|
| Baixar arquivo (`getFile`) | Bots baixam arquivos de até 20 MB; o link vale por no mínimo 1 hora e depois exige nova chamada a `getFile` | [verificado], via resumo |
| Enviar arquivo | Documento de qualquer tipo até 50 MB; foto até 10 MB; com servidor local da Bot API, até 2000 MB | [verificado], via resumo |
| Texto de mensagem | 1 a 4096 caracteres após o parse das entidades (`sendMessage` e `editMessageText`) | [verificado], via resumo |
| Taxa de envio | Evitar passar de cerca de 1 mensagem por segundo no mesmo chat (rajadas curtas podem passar, mas vêm erros 429); cerca de 30 por segundo no total; em grupo, no máximo 20 por minuto | [verificado], via resumo |
| `callback_data` de botão inline | 1 a 64 bytes (bytes, não caracteres) | [verificado], via resumo |
| Nome de comando | 1 a 32 caracteres, só letras minúsculas inglesas, dígitos e `_`, sem acento; até 100 comandos em `setMyCommands` | [verificado], via resumo |
| Retenção de updates | O servidor guarda os updates até o bot recebê-los, por no máximo 24 horas | [verificado], via resumo |
| `secret_token` do webhook | 1 a 256 caracteres (letras, dígitos, `_` e `-`), enviado no cabeçalho `X-Telegram-Bot-Api-Secret-Token` em cada requisição | [verificado], via resumo |
| Retentativas do webhook | Documentado só como "um número razoável de tentativas"; sem número, intervalo ou recuo | [verificado], via resumo (que não há número) |

Fontes dos limites: https://core.telegram.org/bots/api [verificado] ; https://core.telegram.org/bots/faq [verificado] ; https://core.telegram.org/bots/features [verificado] ; https://core.telegram.org/bots/webhooks [verificado]

## Dicas

### PH-TEL-01 · Aviso de qualquer script em uma linha
**Sabia que você pode** receber no celular um aviso de qualquer script (backup, deploy, teste) com uma chamada `curl` ao `sendMessage` **para melhorar** o tempo que você leva para perceber que algo que roda sozinho terminou ou falhou?

- **Faça:** 1) `/newbot` no @BotFather e guarde o token em variável de ambiente. 2) Mande uma mensagem ao seu bot. 3) Descubra o seu `chat_id` lendo o resultado de `getUpdates` (campo `message.chat.id`; o nome do campo é padrão e a pesquisa não o conferiu em 2026-10-21; `getUpdates` não funciona com webhook configurado) ou use o ID numérico do seu usuário. 4) Chame a API com o trecho abaixo (o `curl` foi testado em bash contra o Telegram falso local, com `http://127.0.0.1` no lugar da URL real; o `https://api.telegram.org` de verdade não foi chamado). 5) Ponha a chamada no fim do script, sem passar de cerca de 1 mensagem por segundo por chat.

  ```bash
  export BOT_TOKEN="...do BotFather..."    # nunca no repositório
  export CHAT_ID="...seu id numérico..."
  # a URL (com o token) entra pela configuração lida do stdin: `printf` é interno do shell e o token não aparece na lista de processos
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$BOT_TOKEN" | curl -sS -K - \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "text=Backup terminou: OK"
  ```

- **Tempo e custo:** 10 a 15 minutos (estimativa da pesquisa; cronometre o seu) · R$ 0 (criar um bot é grátis)
- **Cuidado:** o token vai na URL. A forma mais simples, `curl "https://api.telegram.org/bot${BOT_TOKEN}/..."`, deixa o token como argumento do processo (visível a outros usuários da máquina em `ps`), além do histórico do shell e de logs de proxy (inferência): por isso o trecho acima passa a URL pelo stdin. Use variável de ambiente e não imprima o comando. Os comandos acima são de bash; no PowerShell a sintaxe muda. Nunca cole o token em chat com IA nem o suba para o repositório. O texto do aviso vai para um chat em nuvem sem E2E: não mande log bruto, senha, chave ou dado de cliente, só o status. A mensagem "chegou" não prova que o script fez o certo: aviso de "OK" que sempre diz OK não serve.
- **Entra em:** etapa 2
- **Vira projeto?** sim: PP-01
- **Fontes:** https://core.telegram.org/bots/features [verificado]; https://core.telegram.org/bots/api [verificado]; https://core.telegram.org/bots/faq [verificado]

### PH-TEL-02 · Relatório diário no celular com GitHub Actions
**Sabia que você pode** agendar um workflow do GitHub Actions para mandar um relatório diário ao seu Telegram **para melhorar** o acompanhamento de testes, builds ou métricas sem abrir o painel (meça: quantas vezes por semana você abre o painel só para ver o status)?

- **Faça:** 1) Guarde `BOT_TOKEN` e `CHAT_ID` em Settings > Secrets and variables > Actions. 2) Crie o workflow com `on: schedule` e cron. 3) Passe os segredos pelo bloco `env:` e chame o `curl` da dica PH-TEL-01, como no trecho abaixo (o YAML não foi executado no GitHub; o `curl` foi testado contra o Telegram falso). Teste primeiro por `workflow_dispatch`. 4) No dia seguinte, confira se a mensagem chegou e anote a hora real, para saber o atraso do agendador.

  ```yaml
  on:
    workflow_dispatch:            # permite testar na hora, sem esperar o horário
    schedule:
      - cron: "0 11 * * *"        # em UTC por padrão: 11h UTC = 8h em Brasília (a doc do GitHub lida em 2026-10-21; confirme)
  permissions: {}                 # este job não precisa de nenhuma permissão do GITHUB_TOKEN
  jobs:
    report:
      runs-on: ubuntu-latest
      steps:
        - name: Enviar relatório
          env:
            BOT_TOKEN: ${{ secrets.BOT_TOKEN }}
            CHAT_ID: ${{ secrets.CHAT_ID }}
          run: |
            printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$BOT_TOKEN" | curl -sS -K - \
              --data-urlencode "chat_id=${CHAT_ID}" \
              --data-urlencode "text=Relatório diário: tudo certo"
  ```

- **Tempo e custo:** 20 a 30 minutos (estimativa da pesquisa) · R$ 0 no uso leve: lido em 2026-10-21, repositório público é grátis nos runners padrão e o plano Free de repositório privado inclui 2.000 min/mês (detalhes e fonte em PH-AUT-05); confirme na página antes de contar com isso
- **Cuidado:** limites do `schedule` segundo a documentação do GitHub: roda só no branch padrão, intervalo mínimo de 5 minutos, "pode atrasar sob alta carga" e, em repositório público, é desativado após 60 dias sem atividade. Segredos não chegam ao runner em workflows de forks. Evite segredo na linha de comando e prefira `env:`, como a documentação recomenda. Segredo nunca no YAML. O relatório vai para um chat sem E2E: só números e status, nada de dado de cliente.
- **Entra em:** etapa 2
- **Vira projeto?** sim: PP-01, PP-06
- **Fontes:** https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows [verificado]; https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions [verificado]; https://core.telegram.org/bots/api [verificado]

### PH-TEL-03 · Bot só seu: lista de IDs permitidos
**Sabia que você pode** limitar o bot aos IDs numéricos que você autorizar **para melhorar** a segurança de um assistente que tem acesso às suas coisas (meça: quantas respostas o bot envia a quem não está na lista; o alvo é zero)?

- **Faça:** 1) Guarde `ALLOWED_IDS` em variável de ambiente, com IDs numéricos. 2) No início de todo tratador, antes de qualquer outra coisa, ignore em silêncio quem não está na lista; no n8n, use as opções "Restrict to User IDs" e "Restrict to Chat IDs" do Telegram Trigger. 3) Em grupo, confira também o chat. 4) Registre que um update foi ignorado, sem gravar o conteúdo da mensagem (o evento de erro do seu próprio tratador guarda um trecho da mensagem do erro, já mascarado: não ponha texto de usuário nas mensagens de erro). 5) Veja um processador de updates com lista de IDs numéricos, silêncio para quem não está na lista e registro sem conteúdo em [ponte-telegram.mjs](../referencia/ponte-telegram.mjs) (código de referência do repositório, não da pesquisa: leia antes de usar).
- **Tempo e custo:** 10 minutos (estimativa da pesquisa) · R$ 0
- **Cuidado:** use o ID numérico, não o `@username`. Comando exposto no menu não é autorização: confira o usuário em todo tratador, e valide os comandos recebidos no servidor. A lista fica no código, nunca no prompt: o modelo não decide quem pode usar o bot. Silêncio evita revelar que o bot existe e funciona, mas lista errada deixa você mesmo de fora: confira o seu ID. Quem está na lista fala com o bot por um chat sem E2E.
- **Entra em:** etapa 11
- **Vira projeto?** sim: PP-02, PP-05
- **Fontes:** https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/ [verificado]; https://core.telegram.org/bots/features [verificado]; [opinião] (preferir ID numérico a `@username` porque o username pode mudar)

### PH-TEL-04 · Botão Confirmar antes de agir
**Sabia que você pode** pedir confirmação por botão inline antes de apagar, enviar ou pagar algo **para melhorar** a segurança de um assistente que age por conta própria (meça: ações irreversíveis executadas sem clique e cliques duplos que executam duas vezes; o alvo é zero nos dois)?

- **Faça:** 1) O bot guarda a ação pendente no servidor, com um ID curto. 2) Responde com um teclado inline "Confirmar" e "Cancelar" cujo `callback_data` leva só esse ID (1 a 64 bytes). 3) No clique, chame `answerCallbackQuery` sempre, mesmo sem notificação: até você responder, o cliente mostra uma barra de progresso. 4) Valide quem clicou e se a ação ainda está pendente. 5) Execute uma única vez: o segundo clique no mesmo botão deve ser inofensivo. Se o seu tratador de mensagem ESPERA a aprovação, o laço que lê os updates não pode esperar esse tratador, senão o clique (outro update) fica preso até o prazo: em `ponte-telegram.mjs` as mensagens rodam em segundo plano. Parâmetros grandes demais para você revisar tornam o pedido negado. Referência: o canal de aprovação em [ponte-telegram.mjs](../referencia/ponte-telegram.mjs) e a demonstração [demo-aprovacao.mjs](../referencia/demo-aprovacao.mjs) (código do repositório, não da pesquisa: leia antes de usar).
- **Tempo e custo:** 1 a 2 horas (estimativa da pesquisa) · R$ 0
- **Cuidado:** o `callback_data` vem do cliente: nunca ponha nele o comando a executar nem dado sensível, só o ID curto. Em grupo, qualquer membro pode clicar, então valide o usuário. A mensagem do botão deve dizer exatamente o que vai acontecer, ou o clique vira carimbo (veja PH-TEL-07). Texto lido (nota, e-mail, transcrição) nunca decide a ação: quem aprova é você. Nomes verificados na documentação das bibliotecas: em Python (python-telegram-bot) `InlineKeyboardButton`, `InlineKeyboardMarkup`, `CallbackQueryHandler`, `query.answer()`; em TypeScript (grammY) `InlineKeyboard`, `bot.callbackQuery(...)`, `ctx.answerCallbackQuery(...)`.
- **Entra em:** etapa 11
- **Vira projeto?** sim: PP-02, PP-05
- **Fontes:** https://core.telegram.org/bots/features [verificado]; https://core.telegram.org/bots/api [verificado]; https://docs.python-telegram-bot.org/en/stable/examples.inlinekeyboard.html [verificado]; https://grammy.dev/plugins/keyboard [verificado]

### PH-TEL-05 · Ignore updates repetidos pelo update_id
**Sabia que você pode** gravar cada `update_id` processado numa tabela com chave única **para melhorar** a confiabilidade do bot (meça: envie o mesmo update 3 vezes ao seu bot de teste e confira que o efeito, como gravar, apagar ou pagar, acontece uma vez só)?

- **Faça:** 1) Crie uma tabela (SQLite ou Redis) com `update_id` como chave única. 2) Ao receber um update, tente inserir o ID; se já existir, responda 200 e ignore. 3) Faça o trabalho longo numa fila e responda 200 rápido. 4) Teste com o mesmo update enviado 3 vezes.
- **Tempo e custo:** 1 a 2 horas (estimativa da pesquisa) · R$ 0
- **Cuidado:** a Bot API diz que o `update_id` "permite ignorar updates repetidos". Num webhook, resposta que não seja 2xx é repetida e o servidor "desiste depois de um número razoável de tentativas"; a documentação não dá número, intervalo nem política de recuo, então não conte com nenhum. Com `getUpdates`, o que você não confirma com `offset` volta. Updates ficam guardados no máximo 24 horas. Os IDs crescem em sequência, mas, depois de uma semana sem updates, o próximo ID é escolhido aleatoriamente: use unicidade, não "maior que o último". O prazo de 10 s do webhook que a pesquisa viu é regra do grammY, não do Telegram. Não registre o corpo inteiro do update em log (contém dados do usuário). [opinião] Se o tratador falhar depois de gravar o ID, o update se perde: decida se marca como "em andamento" e conclui depois.
- **Entra em:** etapa 2
- **Vira projeto?** sim: PP-02
- **Fontes:** https://core.telegram.org/bots/api [verificado]; https://grammy.dev/guide/deployment-types [verificado]

### PH-TEL-06 · Teste seu bot sem token real: um Telegram falso
**Sabia que você pode** apontar o seu bot para um servidor local que imita uma parte da Bot API **para melhorar** a velocidade e a repetibilidade dos testes (meça: quantos testes rodam sem rede e sem token, e quanto tempo a suíte leva)?

- **Faça:** 1) Suba o servidor local de [telegram-falso.mjs](../referencia/telegram-falso.mjs), que imita só uma parte simplificada da Bot API (leia o arquivo para saber quais métodos). 2) Aponte a biblioteca para a URL base local: na python-telegram-bot, `base_url` e `base_file_url`; na aiogram, `AiohttpSession(api=TelegramAPIServer.from_base(...))`; na grammY, `client: { apiRoot: ... }`, com `botInfo` para pular o `getMe` inicial. Em código próprio, deixe a URL base configurável (padrão `https://api.telegram.org`). 3) Use um token falso e teste que ele nunca aparece em stdout nem em stderr. 4) Separe o "cérebro" (função que recebe texto e devolve ações) e teste sem rede, com fixtures JSON de `Update` (`update_id`, `message`, `callback_query`). 5) Antes de confiar no bot, rode um teste contra o Telegram real com um bot de teste.
- **Tempo e custo:** cerca de 1 hora para apontar um bot existente para o servidor falso (estimativa de quem escreveu, não da pesquisa: cronometre) · R$ 0
- **Cuidado:** o Telegram falso NÃO substitui um teste contra o Telegram real: ele imita só uma parte simplificada da Bot API, e o formato exato dos erros pode diferir do real (a documentação diz que o `error_code` "pode mudar no futuro" e que erros podem trazer `parameters` com `retry_after`). Passar no falso não prova que passa no real. A pesquisa não testou se a python-telegram-bot aceita um token falso sem outras chamadas [não verificado]. Nunca ponha token real em fixture, em teste ou em log; use um bot de teste separado do de produção.
- **Entra em:** etapa 2, etapa 15
- **Vira projeto?** não
- **Fontes:** https://docs.python-telegram-bot.org/en/stable/telegram.ext.applicationbuilder.html [verificado]; https://docs.aiogram.dev/en/latest/api/session/custom_server.html [verificado]; https://grammy.dev/ref/core/apiclientoptions [verificado]; https://grammy.dev/ref/core/botconfig [verificado]; https://core.telegram.org/bots/api [verificado]

### PH-TEL-07 · Aprovação humana de agente no n8n, pelo Telegram
**Sabia que você pode** fazer o agente de IA do n8n pedir a sua aprovação pelo Telegram antes de usar uma ferramenta **para melhorar** o controle sobre ações irreversíveis (meça: quantas ações com efeito externo o agente executou sem aprovação, e quantas aprovações você deu sem ler; o alvo é zero nas duas)?

- **Faça:** 1) No nó AI Agent, abra o Tools Panel e adicione um passo de revisão humana. 2) Escolha o canal Telegram. 3) Ligue as ferramentas que exigem aprovação (enviar, apagar, pagar): o fluxo pausa até você aprovar ou negar. 4) Faça a mensagem de aprovação mostrar os parâmetros exatos que a ferramenta vai receber (destinatário, texto completo, valor, o que será apagado), e não um resumo escrito pelo modelo. 5) Teste primeiro com uma ferramenta inofensiva.
- **Tempo e custo:** 30 a 60 minutos (estimativa da pesquisa) · custo do n8n, na nuvem ou self-hosted, não pesquisado (não confirmado em 2026-10-21); confirme na página antes de contar com isso, e some o custo do modelo
- **Cuidado:** aprovar o que o modelo preencheu pode virar carimbo: com muitos pedidos, você aprova sem ler (fadiga de aprovação). Por isso a mensagem precisa trazer os parâmetros exatos. A OWASP recomenda aprovação humana para ações privilegiadas, mas isso não elimina a injeção de prompt: o que o agente leu (e-mail, página, PDF) é dado não confiável e pode ter moldado os parâmetros que você vê. A pesquisa confirmou que o Telegram está na lista de canais de revisão do n8n, mas não confirmou a operação "Send and Wait for Response" no nó Telegram [não verificado]. O pedido de aprovação passa por um chat sem E2E e pela plataforma do n8n: não ponha segredo nos parâmetros mostrados. Restrinja quem pode responder, como em PH-TEL-03.
- **Entra em:** etapa 11
- **Vira projeto?** não
- **Fontes:** https://docs.n8n.io/advanced-ai/human-in-the-loop-tools/ [verificado]; https://genai.owasp.org/llmrisk/llm01-prompt-injection/ [verificado]; [opinião] (mostrar os parâmetros exatos para evitar o carimbo)

### PH-TEL-08 · Claude Code pelo Telegram (prévia de pesquisa)
**Sabia que você pode** mandar uma tarefa do celular, por Telegram, para o Claude Code rodando na sua máquina e receber a resposta no mesmo chat **para melhorar** a rotina longe do computador (meça: quantas tarefas pequenas você resolve sem voltar à mesa, e quantas aprovações de ferramenta você deu pelo celular)?

- **Faça:** 1) Crie o bot no @BotFather (`/newbot`). 2) Instale o plugin com `/plugin install telegram@claude-plugins-official`. A página oficial diz que ele exige o Bun, que é software de terceiros: instale do site oficial. 3) Em vez de digitar o token na sessão (`/telegram:configure <token>` o colocaria no prompt do Claude Code e no histórico), defina `TELEGRAM_BOT_TOKEN` no ambiente do terminal ANTES de iniciar o Claude Code, e inicie com `claude --channels plugin:telegram@claude-plugins-official`. 4) Mande uma mensagem ao bot, pegue o código de pareamento e rode `/telegram:access pair <código>`. 5) Trave o acesso com `/telegram:access policy allowlist`, deixando só o seu ID. Os comandos vêm da página oficial, lida na pesquisa e conferida de novo por uma revisão independente (por resumo); por ser prévia, reabra a página antes de usar.
- **Tempo e custo:** 30 a 45 minutos (estimativa da pesquisa) · usa a sua assinatura ou chave de API do Claude Code; preços não pesquisados (não confirmado em 2026-10-21), então confirme na página antes de contar com isso
- **Cuidado:** é "research preview": flags e contrato podem mudar, e a pesquisa registrou que não está disponível em Amazon Bedrock, Google Cloud Agent Platform nem Microsoft Foundry. Só mensagens de IDs na allowlist chegam, mas "quem pode responder pelo canal pode aprovar ou negar uso de ferramentas" (relé de permissão): a allowlist deve ter só você. O token fica em `~/.claude/channels/telegram/.env`: trate esse arquivo como segredo. Até você ligar a allowlist, quem achar o bot pode pedir um código de pareamento; só aprove o seu [opinião]. Eventos só chegam com a sessão aberta. `--dangerously-skip-permissions` em ambiente não confiável é perigoso. O chat é em nuvem, sem E2E: não mande segredos nem dados de terceiros. Se você digitou o token na sessão (pelo comando de configuração), considere-o exposto à conversa: troque-o com `/token` no @BotFather.
- **Entra em:** etapa 13
- **Vira projeto?** não
- **Fontes:** https://code.claude.com/docs/en/channels [verificado]; https://core.telegram.org/bots/api [verificado]; [opinião] (não digitar o token na sessão; aprovar só o seu código de pareamento)

## Incidentes e golpes com bots (fontes identificáveis, lidas por resumo)

- **2024-02, tokens de bot dentro de malware.** A Checkmarx descreveu como infiltrou bots de um atacante a partir de pacotes maliciosos que traziam o token embutido: quem tem o token lê o que o bot recebeu e pode redirecionar o webhook. Lição: token em código distribuído é token vazado. https://checkmarx.com/blog/how-we-were-able-to-infiltrate-attacker-telegram-bots.md [verificado, via resumo]
- **2026-06, pacote npm que vazou o próprio token.** A OX Security relatou um pacote que coletava dados do computador e os enviava a um canal do Telegram, deixando o token do bot no pacote. Lição: se você instalou o pacote, revogue e troque as suas credenciais. https://www.ox.security/blog/malware-slop-2-malicious-npm-package-leaks-its-own-bots-telegram-private-token/ [verificado, via resumo]
- **2025-12, canais falsos de "suporte".** A SEAL Intel contou cerca de 4 mil canais falsos de suporte de protocolos cripto, com bots para "abrir ticket" e criar confiança; ferramentas ladras de frase-semente trazem token de bot embutido para enviar o que roubam. Lição: nunca digite frase-semente, senha ou código num chat de bot, e um canal "oficial" aparente não é prova. https://radar.securityalliance.org/psa-fake-telegram-support-channels-drainers/ [verificado, via resumo]
- **Detector de segredos.** A GitGuardian mantém um detector de token de bot em código e descreve o impacto do vazamento: spam, phishing, tomada do bot e exposição de conversas. https://www.gitguardian.com/remediation/telegram-bot-token [verificado, via resumo]
- Um relato em fórum sobre um token entregue a um agente de IA num chat, com o bot tomado depois, não pôde ser aberto [não verificado].
- A pesquisa **não encontrou** um incidente documentado de injeção de prompt contra um assistente ligado ao Telegram: a ameaça é descrita (OWASP LLM01), não demonstrada em incidente público achado.

## Projetos desta trilha
- [PP-01](../projetos-que-rendem.md) · `tg-notify`: avisos e relatório diário no Telegram
- [PP-02](../projetos-que-rendem.md) · Bot privado de anotações, com confirmação
- [PP-05](../projetos-que-rendem.md) · Porta de aprovação no Telegram para o time de agentes
- [PP-06](../projetos-que-rendem.md) · Digest agendado, sem duplicar e com teto de custo

## O que não foi verificado
- "Bots não têm E2E" como frase oficial: não aparece em nenhuma página oficial que a pesquisa abriu. O que está verificado é "chats em nuvem não usam E2E" e "bots veem as mensagens enviadas a eles". A página `techfaq` do Telegram falhou na leitura.
- Retentativas do webhook: sem número, intervalo ou política de recuo na Bot API. O prazo de 10 s é do grammY, não do Telegram.
- Que o bot não inicia a conversa sozinho: frase explícita não encontrada; só o botão Start (PH-TEL-01).
- n8n: a operação "Send and Wait for Response" no nó Telegram não foi confirmada; preços do n8n, Zapier e Make não foram pesquisados (PH-TEL-07).
- Bibliotecas: a assincronia de várias delas, a Bot API coberta por go-telegram/bot, teloxide, Telegram.Bot e node-telegram-bot-api, o que mudou no node-telegram-bot-api 2.1.0, a data do release do Telethon (repositório com 404), a versão mais nova do Telegram.Bot no NuGet, se a python-telegram-bot aceita token falso em testes (PH-TEL-06) e se existe um branch v5 do Telegraf.
- Cobertura da Bot API: as páginas foram lidas em fatias, por resumo de modelo auxiliar; o changelog só do 9.3 ao 10.3; parâmetros completos de `getUpdates` não confirmados.
- GitHub Actions (PH-TEL-02): o YAML nunca foi executado no GitHub; o fuso (UTC) e os minutos gratuitos vêm da leitura de PH-AUT-05, por resumo.
- Claude Code pelo Telegram (PH-TEL-08): não consta no relatório de Telegram; os comandos e os riscos vêm da página oficial lida em outra rodada de pesquisa do projeto, por resumo, e não foram reabertos. Recurso em prévia: pode mudar.
- LGPD e obrigações legais sobre dados de terceiros: não pesquisadas; isto não é aconselhamento jurídico.
- Os trechos de código `curl` e YAML são da pesquisa, montados com nomes que ela conferiu, e nenhum foi executado. Os arquivos de `../referencia/` são do repositório e não fazem parte da pesquisa.
