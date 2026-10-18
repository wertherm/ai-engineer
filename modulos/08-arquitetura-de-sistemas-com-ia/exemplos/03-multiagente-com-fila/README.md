# 03 · Multi-agente com fila: Sequential, Parallel e Supervisor, com falha de nó

**Conceito novo:** agentes que **não se chamam diretamente**: conversam por fila de mensagens (em memória e
**durável no Postgres** com `LISTEN/NOTIFY` + `FOR UPDATE SKIP LOCKED`), com retry, backoff, timeout,
degradação graciosa e DLQ (dead-letter queue). Os "agentes" são determinísticos com latência simulada para isolar
a **arquitetura**; o corpo de cada um seria uma chamada de LLM (ver [módulo 04](../../../04-agentes-autonomos/README.md)).
Teoria em [doc 02](../../docs/02-single-agent-e-multi-agent.md#padrões-multi-agent).

Arquivos: `fila.js` (FilaMemoria e FilaPostgres com a mesma interface), `agentes.js` (agentes + `comResiliencia`),
`main.js` (os 4 cenários), `resiliencia.test.js`.

**Pré-requisito:** [exemplo 02](../02-single-agent-simulado/). Postgres no ar (schema `m08`, tabela `m08.mensagens`).

## Como rodar

```bash
npm run ex03                                              # < 4 s, sem LLM
node --test 'exemplos/03-multiagente-com-fila/*.test.js'  # 3 testes
```

## Saída esperada

```text
== 1. Sequential (fila em memória): extrator -> risco -> fraude -> redator ==
  Padaria Sol: APROVADO
  ACME: ENCAMINHAR PARA ANALISTA
  tempo total: 194 ms · DLQ: 0 mensagens

== 2. Parallel (fan-out/fan-in): risco e fraude ao mesmo tempo ==
  fraude: tentativa 1/2 falhou (timeout 100 ms)
  fraude: tentativa 2/2 falhou (timeout 100 ms)
  risco=alto fraude=indisponivel (resultado parcial, degradação graciosa)
  ACME: ENCAMINHAR PARA ANALISTA · 275 ms

== 3. Supervisor: decide o próximo agente a partir do estado ==
  extrator -> risco -> redator => Padaria Sol: APROVADO
  fraude: tentativa 1/3 falhou (falha simulada #1)
  extrator -> risco -> fraude -> redator => ACME: ENCAMINHAR PARA ANALISTA

== 4. Sequential sobre fila DURÁVEL no Postgres (LISTEN/NOTIFY, m08.mensagens) ==
  extrator  feito     tentativas=1
  risco     feito     tentativas=1
  redator   dlq       tentativas=2 redator fora do ar
```

```text
✔ retry recupera um agente que falha 2 vezes
✔ timeout interrompe um agente travado e esgota as tentativas
✔ fila em memória manda para a DLQ depois de maxTentativas
ℹ pass 3
```

Repare: no cenário 1 o agente de fraude falhou 2 vezes e **a fila** reentregou (o agente nem sabe); no 3 o
supervisor pulou o agente de fraude para o pedido de risco baixo (economia de chamada); no 4 a mensagem quebrada
foi para a DLQ e ficou **consultável** na tabela, sem travar a fila.

## Experimente

1. No cenário 1, troque `instavel(agentes.fraude, 2)` por `instavel(agentes.fraude, 5)` e veja a mensagem ir para `fila.dlq`.
2. Rode dois processos consumindo a `FilaPostgres` ao mesmo tempo: o `SKIP LOCKED` garante que nenhum pedido é processado duas vezes.
3. Implemente **Handoff**: o redator, em vez de devolver parecer, publica no tópico `analista-humano` quando o risco é alto.

## Versão Python

[`python/agentes.py`](python/agentes.py) (agentes + `com_resiliencia` com `asyncio.wait_for`),
[`python/fila.py`](python/fila.py) (`FilaMemoria` com `asyncio` e `FilaPostgres` com psycopg 3 assíncrono:
`conn.notifies()` + `FOR UPDATE SKIP LOCKED`), [`python/main.py`](python/main.py) e
[`python/test_resiliencia.py`](python/test_resiliencia.py). A fila durável usa a tabela `m08.mensagens_py` e canais
`py_<tópico>`, para não colidir com o JS. Diferença de semântica: o `asyncio.wait_for` **cancela** a tentativa que
estourou o timeout; no JS o `Promise.race` só a abandona (ela continua rodando em segundo plano).

**Como rodar** (da pasta do módulo, depois de `uv sync`):

```bash
uv run python exemplos/03-multiagente-com-fila/python/main.py   # ~7 s, sem LLM (3 s de espera no cenário 4)
uv run pytest -vv exemplos/03-multiagente-com-fila              # 3 testes
```

**Saída esperada (Python)** — saída real:

```text
== 1. Sequential (fila em memória): extrator -> risco -> fraude -> redator ==
  Padaria Sol: APROVADO
  ACME: ENCAMINHAR PARA ANALISTA
  tempo total: 183 ms · DLQ: 0 mensagens

== 2. Parallel (fan-out/fan-in): risco e fraude ao mesmo tempo ==
  fraude: tentativa 1/2 falhou (timeout 100 ms)
  fraude: tentativa 2/2 falhou (timeout 100 ms)
  risco=alto fraude=indisponivel (resultado parcial, degradação graciosa)
  ACME: ENCAMINHAR PARA ANALISTA · 277 ms

== 3. Supervisor: decide o próximo agente a partir do estado ==
  extrator -> risco -> redator => Padaria Sol: APROVADO
  fraude: tentativa 1/3 falhou (falha simulada #1)
  extrator -> risco -> fraude -> redator => ACME: ENCAMINHAR PARA ANALISTA

== 4. Sequential sobre fila DURÁVEL no Postgres (LISTEN/NOTIFY, m08.mensagens_py) ==
  extrator  feito     tentativas=1
  risco     feito     tentativas=1
  redator   dlq       tentativas=2 redator fora do ar
```

```text
exemplos/03-multiagente-com-fila/python/test_resiliencia.py::test_retry_recupera_agente_que_falha_2_vezes PASSED
exemplos/03-multiagente-com-fila/python/test_resiliencia.py::test_timeout_interrompe_agente_travado_e_esgota_tentativas PASSED
exemplos/03-multiagente-com-fila/python/test_resiliencia.py::test_fila_em_memoria_manda_para_dlq_depois_de_max_tentativas PASSED
3 passed in 0.73s
```
