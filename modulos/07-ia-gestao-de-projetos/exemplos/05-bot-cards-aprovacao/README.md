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

## Versão Python

Pasta [`python/`](python/):

| Arquivo | Papel |
|---|---|
| `mock_trello.py` | FastAPI + uvicorn em memória, mesmos caminhos `/1/...`, porta **30750** (`PORTA_MOCK`) |
| `trello.py` | cliente `httpx` com `key`/`token` na query; `TRELLO_BASE_URL` (default `http://localhost:30750/1`) |
| `politica.py` | aprovação, lembretes e payload Slack |
| `trilha.py` | `psycopg` 3, tabela **`m07.trilha_bot_py`** (não mistura com a cadeia do JS), hash encadeado |
| `bot.py` / `auditar_trilha.py` | mesmo fluxo do JS; plano com enums gerados do board via `create_model` |
| `integracoes_reais.py` | Jira, Slack, Asana, Notion com `httpx` — ⚠️ não executado localmente (exige contas e tokens) |

O JSON canônico é `json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`, byte a byte
igual ao `canonico()` do `trilha.js`. Prova: os hashes da trilha Python (`9a5309446c`, `471a782368`,
`63a797bc24`, `5361c74ec0`) são **os mesmos** da trilha do JS acima, e `test_hash_igual_ao_do_js` chama o
`hashDe()` do Node e compara (pulado se não houver Node/`npm install`).

### Como rodar

```bash
cd modulos/07-ia-gestao-de-projetos
uv run python exemplos/05-bot-cards-aprovacao/python/mock_trello.py &      # pare depois com kill %1
uv run python exemplos/05-bot-cards-aprovacao/python/bot.py
uv run python exemplos/05-bot-cards-aprovacao/python/bot.py "Arquive o card Tema escuro no portal"
uv run python exemplos/05-bot-cards-aprovacao/python/bot.py "Arquive o card Tema escuro no portal" --aprovador=marina
uv run python exemplos/05-bot-cards-aprovacao/python/auditar_trilha.py      # exit 1 se a cadeia estiver quebrada
uv run pytest exemplos/05-bot-cards-aprovacao/python
```

Para zerar a trilha Python: `psql postgres://ia:ia@localhost:5433/ia -c "DROP TABLE m07.trilha_bot_py"`.

### Saída esperada (Python)

Saída real das três execuções e da auditoria:

```text
Pedido: Crie um card "Aviso por e-mail" no Backlog com prioridade média e mova a Regra dos 60 dias para Feito
Plano do LLM:
   {'acao': 'criar', 'card': 'Aviso por e-mail', 'lista': 'Backlog', 'prioridade': 'media'}
   {'acao': 'mover', 'card': 'Regra dos 60 dias', 'lista': 'Feito', 'prioridade': 'manter'}
✅ criado id101 "Aviso por e-mail"
✅ movido "Regra dos 60 dias" → Feito

Slack (não enviado): {"channel":"#portal-boletos","text":"2 lembrete(s) do board","blocks":[{"type":"section","text":{"type":"mrkdwn","text":"🟡 \"Subir homologação\" vence em 48h e está sem responsável\n🔴 \"Texto do e-mail no jurídico\" venceu há 24h"}}]}

Trilha íntegra? {'ok': True, 'total': 2}
Pedido: Arquive o card Tema escuro no portal
Plano do LLM:
   {'acao': 'arquivar', 'card': 'Tema escuro no portal', 'lista': 'Backlog', 'prioridade': 'manter'}
⏸  arquivar "Tema escuro no portal": aguardando aprovação (arquivar card é irreversível para o time)
...
Trilha íntegra? {'ok': True, 'total': 3}
Pedido: Arquive o card Tema escuro no portal
...
✅ arquivado "Tema escuro no portal"
...
Trilha íntegra? {'ok': True, 'total': 4}
```

```text
│ id │ hora     │ acao     │ card                  │ status               │ motivo                                   │ hash       │
├────┼──────────┼──────────┼───────────────────────┼──────────────────────┼──────────────────────────────────────────┼────────────┤
│ 1  │ 23:04:25 │ criar    │ Aviso por e-mail      │ executado            │ -                                        │ 9a5309446c │
│ 2  │ 23:04:25 │ mover    │ Regra dos 60 dias     │ executado            │ -                                        │ 471a782368 │
│ 3  │ 23:05:03 │ arquivar │ Tema escuro no portal │ aguardando_aprovacao │ arquivar card é irreversível para o time │ 63a797bc24 │
│ 4  │ 23:06:08 │ arquivar │ Tema escuro no portal │ aprovado_e_executado │ aprovado por marina                      │ 5361c74ec0 │
✅ cadeia íntegra (4 linhas)
```

Adulterando (`UPDATE m07.trilha_bot_py SET status='executado' WHERE id=3`) e auditando de novo (exit 1):

```text
❌ cadeia quebrada na linha 3: alguém editou a trilha
```

Integrações reais sem variáveis falham cedo:

```text
RuntimeError: defina JIRA_SITE no ambiente
```

```text
....                                                                     [100%]
4 passed
```
