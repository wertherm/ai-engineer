# Solução do exercício 02

`node exercicios/02-decision-framework/solucao/decidir.js` (da pasta do módulo). Saída real no [enunciado](../enunciado.md).

## Versão Python

[`python/decidir.py`](python/decidir.py): casos como `dataclass`, as mesmas regras e `toFixed(2)` via `Decimal`
(`ROUND_HALF_UP`).

**Como rodar** (da pasta do módulo): `uv run python exercicios/02-decision-framework/solucao/python/decidir.py`

**Saída esperada (Python)** — saída real, **idêntica** à do JS (`diff` vazio):

```text
Jurídico: responder dúvidas sobre 3.000 contratos que mudam toda semana
  -> RAG (modelo pequeno + 2k tokens de contexto)
     porquê: conhecimento muda e precisa de fonte: pesos congelam o conhecimento, o RAG atualiza no índice
       prompt (modelo pequeno + few-shot)             US$ 4.40/mês
     * RAG (modelo pequeno + 2k tokens de contexto)   US$ 12.20/mês
       fine-tuning (pequeno ajustado)                 US$ 6.40/mês
       modelo maior (sem ajuste)                      US$ 88.00/mês

Suporte: classificar 300 mil tickets/mês em 5 categorias, com latência baixa
  -> fine-tuning (pequeno ajustado)
     ...
     * fine-tuning (pequeno ajustado)                 US$ 8.89/mês

Financeiro: parecer de crédito com análise de 10 indicadores, 500 casos/mês
  -> modelo maior (sem ajuste)
     ...
     * modelo maior (sem ajuste)                      US$ 6.80/mês

(* = escolhida; custo não é o único critério: dados disponíveis, manutenção e risco pesam)
```
