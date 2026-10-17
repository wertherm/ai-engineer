# ADR 0001 · Gerar o PDF no backend

- Status: Aceito
- Data: 2026-10-10
- Decisores: Marina (PO), Ana (dev)

## Contexto
O front não pode recalcular juros e multa.

## Decisão
O backend calcula e gera o PDF.

## Consequências
Mais carga no backend; regra de cálculo num lugar só.
