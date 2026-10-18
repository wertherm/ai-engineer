# Exercício 01 · Detector de risco de cronograma por anomalia no histórico

## Contexto

O PMO quer um "AIOps de projeto": ao fechar cada sprint, um script olha o histórico e avisa, **antes**
da reunião de status, se há risco de escopo, cronograma, recursos, qualidade ou bloqueio, já com a
mitigação sugerida. O histórico está em `solucao/historico-sprints.json` (12 sprints com planejado,
entregue, escopo adicionado, horas extras, dias bloqueados e bugs novos).

Teoria: [doc 02 · U5 Riscos e mitigações](../../docs/02-cronograma-estimativas-e-riscos.md).

## Requisitos

1. `detectarRiscos(historico)` compara a **última** sprint com as anteriores e devolve uma lista de
   `{ tipo, severidade, evidencia[], mitigacao }`.
2. Anomalia pontual por **z-score robusto** (mediana e MAD, `z = 0,6745 × (x − mediana) / MAD`),
   limiar |z| ≥ 3,5, para: entregue (cronograma), escopo adicionado (escopo), horas extras (recursos),
   bugs novos (qualidade), dias bloqueados (bloqueio).
3. Tendência: inclinação (mínimos quadrados) da taxa entregue/planejado nas últimas 4 sprints; abaixo
   de −3 p.p. por sprint = risco de cronograma (severidade média).
4. Regra: escopo adicionado > 20% do planejado = risco de escopo (média).
5. Um risco por tipo (junte as evidências; vale a maior severidade), riscos "alta" primeiro.
6. Mitigação vem de uma tabela de heurísticas por tipo (não do LLM).
7. Testes com `node:test`.

## Critério de pronto

- A sprint 12 gera riscos de **escopo, recursos e cronograma**.
- Rodando só com as 6 primeiras sprints (controle saudável), **zero** riscos (sem falso positivo).
- `node --test` passa.

## Dicas

- Proteja o MAD = 0 (série constante) para não dividir por zero.
- Por que robusto? Com média/desvio, um outlier antigo infla o desvio e esconde o atual.
- Bônus: peça a um LLM só para **redigir** o e-mail ao gestor com os riscos já detectados.

## Solução

`solucao/detector.js` (funções puras), `solucao/main.js`, `solucao/detector.test.js`.

```bash
cd modulos/07-ia-gestao-de-projetos
npm run exe01
node --test exercicios/01-detector-risco-cronograma/solucao/detector.test.js
```

Saída real:

```text
Analisando sprint 12 contra 11 sprints anteriores

[ALTA] risco de escopo
   evidência: escopoAdicionado=9 é anômalo (z robusto 4.0)
   evidência: escopo adicionado = 30% do planejado (limite 20%)
   mitigação: Congelar escopo da sprint; mudanças entram só pelo PO via change request priorizado.
[ALTA] risco de recursos
   evidência: horasExtras=21 é anômalo (z robusto 5.4)
   mitigação: Limitar horas extras, redistribuir carga e checar dependência de uma única pessoa.
[MEDIA] risco de cronograma
   evidência: taxa de entrega caindo -7.8 p.p./sprint nas últimas 4
   mitigação: Replanejar com previsão Monte Carlo (P85) e negociar corte de escopo ou nova data.

Sprint 6 (controle): 0 risco(s)
```

```text
✔ z robusto ignora outlier antigo
✔ inclinação de reta
✔ sprint 12 tem riscos de escopo, cronograma e recursos
✔ sprint saudável não gera falso positivo
ℹ pass 4
```

Repare: "entregue = 18" **não** passou do limiar de anomalia (as sprints 9–11 já vinham caindo e
puxaram a mediana), mas a **tendência** pegou. Anomalia e tendência se complementam.

## Versão Python

Solução em [`solucao/python/`](solucao/python/): `detector.py` (usa `statistics.median`), `main.py` e
`test_detector.py` (pytest). Lê o mesmo `historico-sprints.json`. As evidências usam `to_fixed`/`js_round`
de [`comum_py/js.py`](../../comum_py/js.py) para imprimir exatamente como o `toFixed`/`Math.round` do JS.

### Como rodar

```bash
cd modulos/07-ia-gestao-de-projetos
uv run python exercicios/01-detector-risco-cronograma/solucao/python/main.py
uv run pytest exercicios/01-detector-risco-cronograma/solucao/python
```

### Saída esperada (Python)

Saída real (idêntica à do JS):

```text
Analisando sprint 12 contra 11 sprints anteriores

[ALTA] risco de escopo
   evidência: escopoAdicionado=9 é anômalo (z robusto 4.0)
   evidência: escopo adicionado = 30% do planejado (limite 20%)
   mitigação: Congelar escopo da sprint; mudanças entram só pelo PO via change request priorizado.
[ALTA] risco de recursos
   evidência: horasExtras=21 é anômalo (z robusto 5.4)
   mitigação: Limitar horas extras, redistribuir carga e checar dependência de uma única pessoa.
[MEDIA] risco de cronograma
   evidência: taxa de entrega caindo -7.8 p.p./sprint nas últimas 4
   mitigação: Replanejar com previsão Monte Carlo (P85) e negociar corte de escopo ou nova data.

Sprint 6 (controle): 0 risco(s)
```

```text
....                                                                     [100%]
4 passed
```
