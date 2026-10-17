# Exemplo 05 · Bot de cards com aprovação, lembretes e trilha de auditoria

**Conceito novo**: linguagem natural → **workflow** com humano no circuito. O bot lê o estado do board,
o LLM propõe um plano de operações (schema com enums gerados do board), uma **política em código**
decide o que exige aprovação, as operações vão para a API (mock local do Trello), regras de lembrete
geram a notificação no formato Slack e cada decisão entra numa trilha encadeada por hash no Postgres
(schema `m07`).

**Pré-requisito**: [exemplo 04](../04-reuniao-ata-status-report/) (schema dinâmico com enums) e o
Postgres da infra (`postgres://ia:ia@localhost:5433/ia`).

| Arquivo | Papel |
|---|---|
| `mock-trello.js` | Express 5 em memória com caminhos da API do Trello (`/1/...`), porta 30707 |
| `trello.js` | cliente mínimo; `TRELLO_BASE_URL`, `TRELLO_KEY`, `TRELLO_TOKEN` apontam para o real |
| `politica.js` | aprovação, lembretes e payload Slack (Block Kit) |
| `trilha.js` | tabela `m07.trilha_bot` com hash encadeado e verificação |
| `bot.js` | orquestra pedido → plano → política → API → trilha |
| `auditar-trilha.js` | lista a trilha e recalcula a cadeia |
| `integracoes-reais.js` | Jira, Slack, Asana, Notion reais — ⚠️ não executado localmente (exige contas e tokens) |

## Como rodar

```bash
cd modulos/07-ia-gestao-de-projetos
npm run mock-trello &                  # terminal 1 (ou em segundo plano); pare depois com kill %1
npm run ex05                           # pedido padrão: criar + mover
npm run ex05 -- "Arquive o card Tema escuro no portal"                       # fica aguardando aprovação
npm run ex05 -- "Arquive o card Tema escuro no portal" --aprovador=marina    # aprovado e executado
npm run auditar-trilha
node --test exemplos/05-bot-cards-aprovacao/politica.test.js
```

Cada chamada ao LLM leva ~30–60 s em CPU. O mock guarda tudo em memória: reinicie-o para voltar ao
estado inicial. Para zerar a trilha: `psql postgres://ia:ia@localhost:5433/ia -c "DROP TABLE m07.trilha_bot"`.

## Saída esperada

Saída real das três execuções e da auditoria:

```text
Pedido: Crie um card "Aviso por e-mail" no Backlog com prioridade média e mova a Regra dos 60 dias para Feito
Plano do LLM: [
  { acao: 'criar', card: 'Aviso por e-mail', lista: 'Backlog', prioridade: 'media' },
  { acao: 'mover', card: 'Regra dos 60 dias', lista: 'Feito', prioridade: 'manter' }
]
✅ criado id101 "Aviso por e-mail"
✅ movido "Regra dos 60 dias" → Feito

Slack (não enviado): {"channel":"#portal-boletos","text":"2 lembrete(s) do board","blocks":[{"type":"section","text":{"type":"mrkdwn","text":"🟡 \"Subir homologação\" vence em 48h e está sem responsável\n🔴 \"Texto do e-mail no jurídico\" venceu há 24h"}}]}

Trilha íntegra? { ok: true, total: 2 }
Pedido: Arquive o card Tema escuro no portal
Plano do LLM: [
  { acao: 'arquivar', card: 'Tema escuro no portal', lista: 'Backlog', prioridade: 'manter' }
]
⏸  arquivar "Tema escuro no portal": aguardando aprovação (arquivar card é irreversível para o time)
...
Trilha íntegra? { ok: true, total: 3 }
Pedido: Arquive o card Tema escuro no portal
...
✅ arquivado "Tema escuro no portal"
...
Trilha íntegra? { ok: true, total: 4 }
```

```text
┌─────────┬─────┬────────────┬────────────┬─────────────────────────┬────────────────────────┬────────────────────────────────────────────┬──────────────┐
│ (index) │ id  │ hora       │ acao       │ card                    │ status                 │ motivo                                     │ hash         │
├─────────┼─────┼────────────┼────────────┼─────────────────────────┼────────────────────────┼────────────────────────────────────────────┼──────────────┤
│ 0       │ '1' │ '19:28:36' │ 'criar'    │ 'Aviso por e-mail'      │ 'executado'            │ null                                       │ '9a5309446c' │
│ 1       │ '2' │ '19:28:36' │ 'mover'    │ 'Regra dos 60 dias'     │ 'executado'            │ null                                       │ '471a782368' │
│ 2       │ '3' │ '19:29:32' │ 'arquivar' │ 'Tema escuro no portal' │ 'aguardando_aprovacao' │ 'arquivar card é irreversível para o time' │ '63a797bc24' │
│ 3       │ '4' │ '19:30:54' │ 'arquivar' │ 'Tema escuro no portal' │ 'aprovado_e_executado' │ 'aprovado por marina'                      │ '5361c74ec0' │
└─────────┴─────┴────────────┴────────────┴─────────────────────────┴────────────────────────┴────────────────────────────────────────────┴──────────────┘
✅ cadeia íntegra (4 linhas)
```

Adulterando a linha 3 direto no banco
(`UPDATE m07.trilha_bot SET status='executado' WHERE id=3`) e auditando de novo:

```text
❌ cadeia quebrada na linha 3: alguém editou a trilha
```

```text
✔ arquivar e prioridade alta exigem aprovação
✔ lembra card sem dono vencendo em 48h e ignora o que está Feito
✔ hash da trilha não depende da ordem das chaves (jsonb reordena)
ℹ pass 3
```

Histórico de ajustes (erros reais do qwen3.5:4b que moldaram o código):

- Sem a tabela verbo → ação no prompt, "arquive" virou `mover` com `prioridade: 'alta'` e "mova para
  Feito" foi para "Fazendo". A política barrou mesmo assim (pediu aprovação), o que mostra por que ela
  existe.
- O exemplo few-shot com `"prioridade":"manter"` fez o modelo ignorar "prioridade média"; foi preciso
  uma linha explícita sobre o campo.

## Integrações reais

`integracoes-reais.js` — ⚠️ **não executado localmente**: precisa de contas e tokens de Jira, Slack,
Asana e Notion (o briefing proíbe criar conta ou usar chave). Sem as variáveis, falha cedo:

```bash
node exemplos/05-bot-cards-aprovacao/integracoes-reais.js jira
# Error: defina JIRA_SITE no ambiente
```

Variáveis por ferramenta: `JIRA_SITE`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT` ·
`SLACK_BOT_TOKEN`, `SLACK_CANAL` · `ASANA_PAT`, `ASANA_PROJECT_GID` · `NOTION_TOKEN`,
`NOTION_DATA_SOURCE_ID`. Para o Trello real, o próprio bot serve:
`TRELLO_BASE_URL=https://api.trello.com/1 TRELLO_KEY=... TRELLO_TOKEN=... TRELLO_BOARD=<id> npm run ex05`.

## Experimente

1. Peça `"Coloque prioridade alta no card Subir homologação"` e veja a aprovação ser exigida.
2. Peça algo sobre um card que não existe (`"mova o card Login social para Feito"`) e confira a linha
   `erro` na trilha.
3. Torne a trilha idempotente: grave um hash do pedido e recuse rodar duas vezes o mesmo pedido já
   executado.
