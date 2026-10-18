# Exercício 01 · Reescrever um README fraco até passar no checklist

## Contexto

Você construiu o portão de promoção de LLMs do [projeto final da trilha LLMOps](../../../../trilhas-extras/llmops-vllm-openshift/projeto-final/)
e quer usá-lo como peça principal do portfólio. O README que você escreveu às pressas está em
[`readme-fraco.md`](readme-fraco.md): "Testado e funcionando, bem rápido!". Nenhum recrutador passa disso.

## Requisitos

1. Escreva `solucao/README-reescrito.md` para o mesmo projeto.
2. Use **apenas números reais** — os da execução registrada em
   `trilhas-extras/llmops-vllm-openshift/projeto-final/relatorio.md` e no README daquele projeto.
   Nada de inventar acurácia ou latência.
3. Inclua: propósito em 1–2 frases, resultado medido logo no topo, diagrama Mermaid com as decisões, demo,
   pré-requisitos, como rodar, saída real (inclusive um caso em que o portão **barra**), limitações honestas.
4. Escreva `solucao/verificar.js`, que roda o checklist do [exemplo 01](../../exemplos/01-auditoria-de-readme/)
   nos dois READMEs e imprime o antes/depois.

## Critério de pronto

- `npm run exe01` imprime `PASSA` (nota >= 80% e todos os critérios obrigatórios).
- Cada número do README reescrito pode ser apontado na saída real do projeto.

## Dicas

- O checklist conta "número com unidade" (ms, %, tokens/s, US$): "29.5 tokens/s" conta, "bem rápido" não.
- "Limitações" não é fraqueza: dizer "medido em CPU; não executado em cluster" mostra senioridade.
- Os critérios estão em `exemplos/01-auditoria-de-readme/checklist.js`. Não "otimize para o checklist" com
  palavras soltas: o objetivo é um README que um humano leia em 30 segundos.

## Saída real da solução

```text
critério          antes  depois
proposito          [ ]   [x]
como-rodar         [ ]   [x]
pre-requisitos     [ ]   [x]
saida-real         [ ]   [x]
metricas           [ ]   [x]
diagrama           [ ]   [x]
demo               [ ]   [x]
limitacoes         [ ]   [x]
testes             [ ]   [ ]
versoes            [ ]   [x]

nota: 0% -> 93% · PASSA
```

O critério `testes` ficou de fora de propósito: o README cita `casos.yaml`, mas não um comando de teste
separado. Para fechar 100%, documente um `pytest` dos casos ou um `make test`.

## Versão Python da solução

`solucao/python/verificar.py` reaproveita `exemplos/01-auditoria-de-readme/python/checklist.py` e lê os
mesmos `readme-fraco.md` e `solucao/README-reescrito.md`. Sai com código 0 quando passa.

```bash
cd modulos/12-carreira
uv run python exercicios/01-readme-que-passa/solucao/python/verificar.py
```

Saída real (2026-10-17), idêntica à do JS:

```text
critério          antes  depois
proposito          [ ]   [x]
como-rodar         [ ]   [x]
pre-requisitos     [ ]   [x]
saida-real         [ ]   [x]
metricas           [ ]   [x]
diagrama           [ ]   [x]
demo               [ ]   [x]
limitacoes         [ ]   [x]
testes             [ ]   [ ]
versoes            [ ]   [x]

nota: 0% -> 93% · PASSA
```
