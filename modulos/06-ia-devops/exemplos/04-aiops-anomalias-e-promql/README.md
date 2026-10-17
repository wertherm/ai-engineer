# Exemplo 04 · AIOps: anomalias com Isolation Forest, forecast e NL → PromQL validado

**Conceitos novos**:

1. **Detecção de anomalias com ML** (`anomalias.py`, Python/scikit-learn, sem LLM): série sintética de
   latência com sazonalidade diária e anomalias **injetadas** (gabarito), comparando limiar estático ×
   Isolation Forest × Isolation Forest + debounce em precisão/recall; **forecast** de CPU do nó (tendência +
   Fourier, backtest com MAE) gerando um **alerta preditivo**; e um dashboard HTML estático.
2. **NL → PromQL** (`promql.js`): o LLM traduz a pergunta e duas validações determinísticas decidem —
   sintaxe pelo parser oficial (`promtool check rules`, via imagem Docker `prom/prometheus:v3.15.0`) e
   catálogo de métricas/labels (anti-alucinação). Erro volta ao LLM uma vez.

Teoria: [doc 03 · AIOps](../../docs/03-kubernetes-troubleshooting-e-aiops.md#aiops-nl--promql-e-logql).

**Pré-requisito**: `uv sync` na raiz (scikit-learn, pandas já estão no `pyproject.toml` da raiz); Docker com
a imagem `prom/prometheus:v3.15.0` (já baixada pela trilha llmops; senão `docker pull`).

## Como rodar

```bash
cd modulos/06-ia-devops
npm run ex04:anomalias     # = uv run python exemplos/04-aiops-anomalias-e-promql/anomalias.py  (segundos)
npm run ex04:promql        # 3 perguntas → 3+ chamadas ao LLM (minutos)
xdg-open exemplos/04-aiops-anomalias-e-promql/saida/dashboard.html
```

## Saída esperada

`anomalias.py` (determinístico, `random_state` fixo):

```
Série: 4320 pontos (1/min, 3 dias) · 52 minutos anômalos plantados

limiar estático (p99)            alertas=  44  precisão=0.91  recall=0.77
Isolation Forest                 alertas=  65  precisão=0.80  recall=1.00
Isolation Forest + debounce 2min alertas=  53  precisão=0.91  recall=0.92

Forecast de CPU do nó: MAE no backtest (72h) = 2.11 p.p.
Alerta preditivo: CPU média passa de 85% em 2026-10-12 13h

Dashboard: exemplos/04-aiops-anomalias-e-promql/saida/dashboard.html
```

Leitura: o limiar estático não vê os 3 picos de madrugada (estão acima do normal **para a hora**, mas abaixo
do pico normal das 14h); o Isolation Forest com features sazonais pega todos; o debounce troca um pouco de
recall por menos alertas falsos.

`promql.js`:

```
Autoteste do validador:
   sintaxe quebrada  → /dev/stdin: 5:15: group "nl2promql", rule 1, "q:0": could not parse expression: 1:34: parse error: unclosed left parenthesis
   métrica alucinada → métrica inexistente: http_errors_total

Pergunta: Qual a porcentagem de respostas 5xx do serviço checkout nos últimos 5 minutos?
   tentativa 1 (402s): sum(rate(http_requests_total{service="checkout",status=~"5.."}[5m]))/sum(rate(http_requests_total{service="checkout"}[5m])*100)
   ✓ aprovada

Pergunta: Qual a latência p95 do serviço checkout nos últimos 5 minutos?
   tentativa 1 (314s): sum(rate(http_request_duration_seconds_bucket{service="checkout", le="+Inf"}[5m])) * exp(0.69314718056)
     ✗ sintaxe: /dev/stdin: 5:15: group "nl2promql", rule 1, "q:0": could not parse expression: 1:90: parse error: expected type instant vector in call to function "exp", got scalar
   tentativa 2 (267s): sum(rate(http_request_duration_seconds_bucket{service="checkout", le="+Inf"}[5m])) * exp(0.69314718056)
     ✗ sintaxe: /dev/stdin: 5:15: group "nl2promql", rule 1, "q:0": could not parse expression: 1:90: parse error: expected type instant vector in call to function "exp", got scalar
   ✗ descartada (não vai para o dashboard)

Pergunta: Quais pods do namespace prod reiniciaram mais de 3 vezes na última hora?
   tentativa 1 (211s): sum by (pod) (increase(kube_pod_container_status_restarts_total{namespace="prod"}[1h])) > 3
   ✓ aprovada

2/3 consultas aprovadas · 4 chamadas ao LLM · 617 tokens de prompt · 144 de resposta · 1193.3s no modelo
```

Leia com atenção, porque esta saída ensina os **limites** da validação:

- A pergunta de p95 foi descartada com razão: o modelo nem usou `histogram_quantile` e o `promtool` reprovou
  `exp(<escalar>)`. Note que a 2ª tentativa repetiu a mesma expressão: modelo pequeno nem sempre aproveita o feedback.
- A 1ª consulta foi **aprovada mas está semanticamente errada**: o `*100` ficou **dentro** do denominador
  (`/sum(rate(...)*100)`), então o resultado é a fração dividida por 100, não a porcentagem. Sintaxe e catálogo
  não pegam significado. O próximo portão é um **golden set**: pares pergunta → consulta esperada avaliados
  contra dados de teste (mesmo resultado numérico), e revisão humana antes de virar painel ou alerta.

## Experimente

1. Em `anomalias.py`, troque as features por só `latencia_ms` crua: o Isolation Forest passa a "detectar" o pico das 14h.
2. Mude `contamination` para 0.05 e veja precisão despencar (mais alertas, mais falsos positivos).
3. Em `promql.js`, remova `kube_pod_container_status_restarts_total` do catálogo e veja a 3ª pergunta ser descartada.
