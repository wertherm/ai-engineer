# 06 · Human-in-the-Loop: Approval Gate, limiar de confiança e Audit Trail

**Conceito novo:** o agente **propõe**, uma política versionada (`politica.json`) **decide** se executa sozinho,
pede aprovação humana ou bloqueia; tudo vai para um **audit trail append-only** no Postgres com encadeamento de
hash (adulteração detectável). Teoria em [doc 03](../../docs/03-padroes-de-design-de-ia.md#human-in-the-loop).

Arquivos: `politica.json`, `gate.js` (função pura `avaliar`), `auditoria.js` (tabela `m08.auditoria`, trigger,
hash SHA-256 encadeado), `main.js`, `gate.test.js`.

**Pré-requisito:** [exemplo 05](../05-roteador-e-cache-semantico/). Postgres no ar. Não usa LLM (as propostas são
roteirizadas para isolar a arquitetura do gate).

## Como rodar

```bash
npm run ex06
node --test 'exemplos/06-hitl-approval-gate/*.test.js'
```

## Saída esperada

```text
acao                 | valor | conf | gate       | motivo                      | final
---------------------|-------|------|------------|-----------------------------|----------
a1 reenviar_boleto   | 320   | 0.97 | automatica | dentro da política          | executada
a2 conceder_desconto | 900   | 0.62 | pendente   | confiança 0.62 < 0.85       | rejeitada
a3 conceder_desconto | 12000 | 0.95 | pendente   | valor acima de 5000         | executada
a4 cancelar_operacao | 0     | 0.99 | pendente   | ação sensível exige humano  | executada
a5 excluir_cliente   | 0     | 0.99 | bloqueada  | ação proibida pela política | bloqueada

Trilha da ação a3:
  #7 agente-cobranca proposta  {"id": "a3", "tipo": "conceder_desconto", "valor": 12000, "confianca": 0.95}
  #8 gate            pendente  {"motivo": "valor acima de 5000", "politica": "2026-10-16"}
  #9 humano:ana      aprovada  {"nota": "acordo da diretoria"}
  #10 executor        executada {}

Eventos por tipo: {"aprovada":2,"automatica":1,"bloqueada":1,"executada":3,"pendente":3,"proposta":5,"rejeitada":1}
Cadeia íntegra? sim
UPDATE na auditoria → erro: auditoria é append-only (UPDATE bloqueado)
Depois de adulterar com o trigger desligado → primeira seq inválida: #9
```

```text
✔ alta confiança e valor baixo passa direto
✔ confiança abaixo do limiar vai para humano
✔ confiança alta NÃO libera ação sensível nem valor alto
✔ ação proibida é bloqueada antes de tudo
ℹ pass 4
```

## Experimente

1. Baixe `limiarConfianca` para `0.6` em `politica.json`: a2 passa a ser automática. Quem aprovou essa mudança? (versione a política.)
2. Consulte: `SELECT ator, count(*) FROM m08.auditoria GROUP BY ator;` — quantas decisões foram humanas?
3. Meça o custo humano: conte as ações `pendente` por dia e estime analistas necessários; ajuste o limiar com esse número.

## Versão Python

[`python/gate.py`](python/gate.py) (lê a mesma [`politica.json`](politica.json)), [`python/auditoria.py`](python/auditoria.py)
(tabela `m08.auditoria_py`, trigger `auditoria_py_imutavel`), [`python/main.py`](python/main.py) e
[`python/test_gate.py`](python/test_gate.py). O JSON canônico do hash é
`json.dumps(..., sort_keys=True, separators=(",", ":"), ensure_ascii=False)`: o mesmo texto que o
`JSON.stringify(canonico(...))` do JS. Conferido: o Python recalcula 15 dos 16 hashes da tabela `m08.auditoria`
gravada pelo JS (a 16ª é justamente a linha adulterada).

**Como rodar** (da pasta do módulo, depois de `uv sync`):

```bash
uv run python exemplos/06-hitl-approval-gate/python/main.py
uv run pytest -vv exemplos/06-hitl-approval-gate
```

**Saída esperada (Python)** — saída real:

```text
acao                 | valor | conf | gate       | motivo                      | final
---------------------|-------|------|------------|-----------------------------|----------
a1 reenviar_boleto   | 320   | 0.97 | automatica | dentro da política          | executada
a2 conceder_desconto | 900   | 0.62 | pendente   | confiança 0.62 < 0.85       | rejeitada
a3 conceder_desconto | 12000 | 0.95 | pendente   | valor acima de 5000         | executada
a4 cancelar_operacao | 0     | 0.99 | pendente   | ação sensível exige humano  | executada
a5 excluir_cliente   | 0     | 0.99 | bloqueada  | ação proibida pela política | bloqueada

Trilha da ação a3:
  #7 agente-cobranca proposta  {"id": "a3", "tipo": "conceder_desconto", "valor": 12000, "confianca": 0.95}
  #8 gate            pendente  {"motivo": "valor acima de 5000", "politica": "2026-10-16"}
  #9 humano:ana      aprovada  {"nota": "acordo da diretoria"}
  #10 executor        executada {}

Eventos por tipo: {"aprovada":2,"automatica":1,"bloqueada":1,"executada":3,"pendente":3,"proposta":5,"rejeitada":1}
Cadeia íntegra? sim
UPDATE na auditoria → erro: auditoria é append-only (UPDATE bloqueado)
Depois de adulterar com o trigger desligado → primeira seq inválida: #9
```

```text
exemplos/06-hitl-approval-gate/python/test_gate.py::test_alta_confianca_e_valor_baixo_passa_direto PASSED
exemplos/06-hitl-approval-gate/python/test_gate.py::test_confianca_abaixo_do_limiar_vai_para_humano PASSED
exemplos/06-hitl-approval-gate/python/test_gate.py::test_confianca_alta_nao_libera_acao_sensivel_nem_valor_alto PASSED
exemplos/06-hitl-approval-gate/python/test_gate.py::test_acao_proibida_e_bloqueada_antes_de_tudo PASSED
4 passed in 0.07s
```
