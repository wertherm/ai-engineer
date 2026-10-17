# Exercício 05 · Alerta de data drift

**Tópicos praticados:** exemplo 04 · [docs/03](../../docs/03-monitoramento-e-drift.md)

## Contexto

Todo dia chega um lote de exames (CSV). Antes de confiar nas previsões do modelo, a equipe quer um
verificador que **falhe** (código de saída 1) quando o lote não se parece com os dados de treino. É o
equivalente, para ML clássico, do alerta de SLO do [exercício 02 da trilha de LLMOps](../../../llmops-vllm-openshift/exercicios/02-alerta-de-slo/).

## Requisitos

1. `alerta_drift.py <producao.csv>` compara o lote com os dados de treino (o mesmo split do exemplo 01).
2. Esquema quebrado (coluna faltando) é alerta imediato.
3. Alerta se a **fração de colunas com drift** (KS, p ≤ 0,05) passar de `--max-colunas` (padrão 10%)
   **ou** se alguma coluna tiver **PSI** acima de `--psi` (padrão 0,25).
4. Imprime `OK: ...` ou `ALERTA: ...` e sai com 0 ou 1.

## Critério de pronto

```bash
cd exercicios/02-alerta-de-drift/solucao
uv run python gerar_lotes.py
uv run python alerta_drift.py lote_normal.csv; echo $?   # OK -> 0
uv run python alerta_drift.py lote_drift.csv;  echo $?   # ALERTA -> 1
```

## Dicas

- Reaproveite a função `psi` do exemplo 04.
- Por que dois critérios? Teste só com a fração de colunas e veja o que acontece com o `lote_drift.csv`.

A solução está em [`solucao/`](solucao/). Saída real:

```
OK: 0/30 colunas com drift (0%, limite 10%); PSI > 0.25: nenhuma
ALERTA: 2/30 colunas com drift (7%, limite 10%); PSI > 0.25: ['mean radius (1.08)', 'mean texture (2.00)']
```

Só pela fração (7% < 10%) o lote passaria. O PSI pegou a mudança grande em duas colunas.
