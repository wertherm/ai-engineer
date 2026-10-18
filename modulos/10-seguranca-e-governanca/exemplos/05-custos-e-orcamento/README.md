# 05 · Custos: calculadora de custo total e orçamento com alerta

**Conceito novo:** custo total de uma feature de IA (entrada, cache, saída, retentativas, guardrails) e
API x self-hosting com ponto de equilíbrio; depois, **orçamento diário no Postgres** (schema `m10`) com
alerta em 80%, corte em 100% e cota por usuário. Teoria em [docs/04](../../docs/04-custos-financeiros.md).
**Pré-requisito:** Postgres do repo no ar (`bash infra/subir-ia.sh` na raiz) e `npm install`. Não usa o LLM.

> Os preços em `premissas.json` são **hipotéticos**. Troque pelos da página oficial do seu provedor
> (links no doc 04) antes de qualquer decisão.

## Como rodar

```bash
cd modulos/10-seguranca-e-governanca
node exemplos/05-custos-e-orcamento/custos.js                 # calculadora (npm run ex05)
node exemplos/05-custos-e-orcamento/custos.js minhas.json     # com as suas premissas
node exemplos/05-custos-e-orcamento/orcamento.js              # orçamento só por feature
node exemplos/05-custos-e-orcamento/orcamento.js --com-cota   # + cota por usuário
```

## Saída esperada

Saída real (2026-10-16):

```
Feature: assistente de suporte com RAG · 630.000 chamadas/mês (com retentativas)

API (pago por token):
  entrada (sem cache)  US$     630.00  (R$ 3465)
  entrada (cache)      US$      94.50  (R$ 520)
  saida                US$     756.00  (R$ 4158)
  guardrails           US$      26.46  (R$ 146)
  TOTAL                US$    1506.96  (R$ 8288)   -> 2.392 US$/mil chamadas
  (sem cache seria US$    2357.46  (R$ 12966): o cache economiza 36%)

Self-hosting (pago por hora de GPU):
  TOTAL                US$    6650.00  (R$ 36575)   utilização da capacidade: 2.4%

Ponto de equilíbrio: ~88.257 chamadas/dia (4.4x o volume atual).
Hoje: API sai mais barato.
```

```
Cenário: orçamento por feature (sem cota por usuário)
chamada 1330: ALERTA    gasto US$ 4.0019 (80% do orçamento)
chamada 1458: BLOQUEADO gasto US$ 5.0013 (100% do orçamento)

Chamadas bloqueadas pelo orçamento da feature: 543 (181 de clientes legítimos) · barradas pela cota do usuário: 0
Quem mais gastou hoje (por feature e usuário):
  suporte  u-loop    172 chamadas  US$ 1.7888
  ...
Orçamento suporte : US$ 5.0013 de 5.00 -> BLOQUEADO
Orçamento resumo  : US$ 0.0046 de 2.00 -> ok
----
Cenário: orçamento por feature + cota por usuário

Chamadas bloqueadas pelo orçamento da feature: 0 (0 de clientes legítimos) · barradas pela cota do usuário: 509
Quem mais gastou hoje (por feature e usuário):
  suporte  u-loop     25 chamadas  US$ 0.2600
  ...
Orçamento suporte : US$ 3.9250 de 5.00 -> ok
```

O que observar:
- A **saída** custa mais que a entrada mesmo sendo 8x menos tokens (300 x 2.500): preço por token 4x maior.
- Self-hosting com 2,4% de utilização é pagar GPU ociosa; só compensa perto de 4,4x o volume.
- Sem cota por usuário, **um** loop derrubou a feature e 181 clientes legítimos ficaram sem resposta.

## Experimente

1. Mude `fracao_entrada_em_cache` para 0,9 e veja o novo ponto de equilíbrio.
2. Troque o orçamento para reserva atômica: `UPDATE ... SET gasto = gasto + $1 WHERE gasto + $1 <= limite`
   numa tabela de saldos, e rode 2 processos ao mesmo tempo.
3. Adicione um alerta por **taxa** de gasto (US$/min acima do normal), que pega o loop antes dos 80%.

## Versão Python

Arquivos em `python/`: `custos.py` (lê o MESMO `premissas.json` desta pasta) e `orcamento.py` (psycopg 3,
tabela `m10.uso_llm_py` para não colidir com a `m10.uso_llm` do JS).

### Como rodar

```bash
cd modulos/10-seguranca-e-governanca
uv sync
uv run python exemplos/05-custos-e-orcamento/python/custos.py               # mesmos números do JS
uv run python exemplos/05-custos-e-orcamento/python/custos.py minhas.json   # com as suas premissas
uv run python exemplos/05-custos-e-orcamento/python/orcamento.py
uv run python exemplos/05-custos-e-orcamento/python/orcamento.py --com-cota
```

### Saída esperada (Python)

`custos.py` (real, 2026-10-17): **idêntica byte a byte** à do JS acima (`diff` vazio), incluindo
`630.000 chamadas/mês`, `TOTAL US$ 1506.96 (R$ 8288)` e `Ponto de equilíbrio: ~88.257 chamadas/dia (4.4x o volume atual)`.
Para isso: `toFixed` → `to_fixed` (Decimal + ROUND_HALF_UP), `Math.round` → `floor(x + 0.5)` e
`toLocaleString('pt-BR')` → `fmt` (helpers em `comum_py/formato.py`).

`orcamento.py` (real, 2026-10-17):

```
Cenário: orçamento por feature (sem cota por usuário)
chamada 1330: ALERTA    gasto US$ 4.0019 (80% do orçamento)
chamada 1458: BLOQUEADO gasto US$ 5.0013 (100% do orçamento)

Chamadas bloqueadas pelo orçamento da feature: 543 (181 de clientes legítimos) · barradas pela cota do usuário: 0
Quem mais gastou hoje (por feature e usuário):
  suporte  u-loop    172 chamadas  US$ 1.7888
  suporte  u-31       26 chamadas  US$ 0.0650
  suporte  u-49       26 chamadas  US$ 0.0650
Orçamento suporte : US$ 5.0013 de 5.00 -> BLOQUEADO
Orçamento resumo  : US$ 0.0046 de 2.00 -> ok
----
Cenário: orçamento por feature + cota por usuário

Chamadas bloqueadas pelo orçamento da feature: 0 (0 de clientes legítimos) · barradas pela cota do usuário: 509
Quem mais gastou hoje (por feature e usuário):
  suporte  u-loop     25 chamadas  US$ 0.2600
  ...
Orçamento suporte : US$ 3.9250 de 5.00 -> ok
Orçamento resumo  : US$ 0.0046 de 2.00 -> ok
```

Mesmos números do JS. A conexão usa `autocommit=True`: sem isso o psycopg abre uma transação implícita e o
script inteiro (2.000 INSERTs) só seria gravado no fim, ao sair do `with`.
