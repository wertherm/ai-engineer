# Exemplo 03 · Cronograma dinâmico, capacidade e Monte Carlo

**Conceito novo**: previsão probabilística de prazo. CPM (caminho crítico e folgas) sobre o grafo de
dependências, conversão de esforço em calendário pela capacidade de cada pessoa, Monte Carlo de
10.000 cenários com durações triangulares (P50/P85/P95 e % de vezes que cada tarefa foi crítica),
cenários what-if e previsão do backlog por throughput histórico com sugestão de corte de escopo.
Sem LLM: tudo é estatística determinística (PRNG com semente, saída reprodutível).

**Pré-requisito**: [exemplo 02](../02-priorizacao-rice-wsjf/) (as tarefas detalham o roadmap).

Arquivos: `projeto.json`, `cronograma.js` (funções puras), `main.js`, `cronograma.test.js`.

## Como rodar

```bash
cd modulos/07-ia-gestao-de-projetos
npm run ex03                                              # < 1 s
node --test exemplos/03-cronograma-monte-carlo/cronograma.test.js
```

## Saída esperada

Saída real:

```text
== CPM com duração provável (dias úteis) ==
┌─────────┬────┬────┬───────┐
│ (index) │ ES │ EF │ folga │
├─────────┼────┼────┼───────┤
│ T1      │ 0  │ 5  │ 0     │
│ T2      │ 0  │ 3  │ 4     │
│ T5      │ 0  │ 8  │ 1     │
│ T3      │ 5  │ 9  │ 0     │
│ T4      │ 5  │ 7  │ 2     │
│ T6      │ 9  │ 12 │ 0     │
└─────────┴────┴────┴───────┘
Caminho crítico: T1 → T3 → T6 | fim em 12 dias (2026-11-18)

Carga em dias de calendário: ana=9 · bruno=8 · carla=8

== Monte Carlo (10.000 cenários, durações triangulares) ==
P50=14.6d (2026-11-23) · P85=16.5d (2026-11-25) · P95=17.6d
% de cenários em que a tarefa foi crítica: T1=66% T2=0% T3=64% T4=2% T5=33% T6=100%

What-if "T4 não depende de T1": P85 16.5d → 16.5d (T4 quase nunca é crítica: mexer nela não adianta)
What-if "carla em tempo integral": P85 16.5d → 16.1d

== Backlog de 28 itens pelo throughput histórico ==
P50=6 semanas · P85=7 semanas · P95=8 semanas
Alvo 5 semanas estoura no P85: sugerido cortar o escopo para ~19 itens (média 4.7/semana).
```

```text
✔ CPM acha o caminho crítico e a folga
✔ ciclo de dependência é erro
✔ triangular fica dentro do intervalo
✔ throughput constante dá previsão exata
ℹ pass 4
```

O que observar:

- O plano "provável" diz 12 dias; o P50 diz 14,6 e o P85 16,5. Prometer a data do CPM determinístico
  é prometer algo que acontece em menos da metade dos cenários.
- T5 tem folga de 1 dia no CPM, mas foi crítica em 33% dos cenários: caminho "quase crítico" também
  precisa de atenção.
- O what-if mostra onde **não** adianta investir (T4) e quanto rende colocar a Carla em tempo integral.

## Experimente

1. Aumente o `pessimista` da T1 para 15 e veja o P85 e a % crítica da T5 mudarem.
2. Crie um ciclo (T1 dependendo de T6) e confira o erro `Ciclo de dependências detectado`.
3. Troque `throughputSemanalHistorico` por números do seu time (itens fechados por semana no Monday/Jira)
   e compare o P85 com a data que foi prometida.

## Versão Python

Pasta [`python/`](python/): `cronograma.py` (Kahn, CPM, triangular, Monte Carlo), `main.py` e
`test_cronograma.py`. O `mulberry32` foi portado bit a bit: o Python tem inteiros sem limite, então cada
passo é recortado em 32 bits (`& 0xFFFFFFFF`), `Math.imul` vira multiplicação mascarada com sinal e `>>>`
vira `(x & 0xFFFFFFFF) >> n`. Com a mesma semente e a mesma ordem de sorteios, os percentis saem
**idênticos ao JS até o último dígito** (há um teste que confere `14.555358611650355`, `16.46508020144106`
e `17.616741258077038`, os valores impressos pelo Node).

### Como rodar

```bash
cd modulos/07-ia-gestao-de-projetos
uv run python exemplos/03-cronograma-monte-carlo/python/main.py   # ~1 s
uv run pytest exemplos/03-cronograma-monte-carlo/python
```

### Saída esperada (Python)

Saída real:

```text
== CPM com duração provável (dias úteis) ==
│ tarefa │ ES │ EF │ folga │
├────────┼────┼────┼───────┤
│ T1     │ 0  │ 5  │ 0     │
│ T2     │ 0  │ 3  │ 4     │
│ T5     │ 0  │ 8  │ 1     │
│ T3     │ 5  │ 9  │ 0     │
│ T4     │ 5  │ 7  │ 2     │
│ T6     │ 9  │ 12 │ 0     │
Caminho crítico: T1 → T3 → T6 | fim em 12 dias (2026-11-18)

Carga em dias de calendário: ana=9 · bruno=8 · carla=8

== Monte Carlo (10.000 cenários, durações triangulares) ==
P50=14.6d (2026-11-23) · P85=16.5d (2026-11-25) · P95=17.6d
% de cenários em que a tarefa foi crítica: T1=66% T2=0% T3=64% T4=2% T5=33% T6=100%
(percentis exatos: P50=14.555358611650355 P85=16.46508020144106 P95=17.616741258077038)

What-if "T4 não depende de T1": P85 16.5d → 16.5d (T4 quase nunca é crítica: mexer nela não adianta)
What-if "carla em tempo integral": P85 16.5d → 16.1d

== Backlog de 28 itens pelo throughput histórico ==
P50=6 semanas · P85=7 semanas · P95=8 semanas
Alvo 5 semanas estoura no P85: sugerido cortar o escopo para ~19 itens (média 4.7/semana).
```

```text
......                                                                   [100%]
6 passed
```
