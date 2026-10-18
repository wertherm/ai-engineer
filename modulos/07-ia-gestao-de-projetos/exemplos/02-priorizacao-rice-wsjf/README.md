# Exemplo 02 · Priorização RICE + WSJF + MoSCoW, roadmap e OKRs

**Conceito novo**: o código calcula os scores (RICE, WSJF), classifica MoSCoW por **regra explícita**,
encaixa o roadmap por capacidade e dependência, mede alinhamento a OKRs e roda um what-if. O LLM só
recebe os números prontos e escreve a justificativa para o comitê.

**Pré-requisito**: [exemplo 01](../01-requirements-copilot/) (o backlog aqui é a continuação dele).

Arquivos: `backlog.json` (itens, OKRs, capacidade), `priorizar.js` (funções puras), `main.js`,
`priorizar.test.js`.

## Como rodar

```bash
cd modulos/07-ia-gestao-de-projetos
npm run ex02                                              # ~1,5 min (só a justificativa usa LLM)
node --test exemplos/02-priorizacao-rice-wsjf/priorizar.test.js
```

## Saída esperada

Saída real:

```text
┌─────────┬─────────┬───────────────────────────────────┬──────┬──────┬──────────┬─────────┐
│ (index) │ id      │ titulo                            │ RICE │ WSJF │ MoSCoW   │ KR      │
├─────────┼─────────┼───────────────────────────────────┼──────┼──────┼──────────┼─────────┤
│ 0       │ 'HU-02' │ 'Bloquear reemissão > 60 dias'    │ 300  │ 31   │ 'Must'   │ 'KR2.1' │
│ 1       │ 'HU-06' │ 'Pix copia-e-cola na segunda via' │ 1867 │ 6.7  │ 'Should' │ 'KR1.2' │
│ 2       │ 'HU-03' │ 'Aviso por e-mail 3 dias antes'   │ 2100 │ 5    │ 'Should' │ 'KR2.1' │
│ 3       │ 'HU-01' │ 'Segunda via no portal'           │ 1280 │ 4.8  │ 'Must'   │ 'KR1.1' │
│ 4       │ 'HU-05' │ 'Tema escuro no portal'           │ 225  │ 2    │ "Won't"  │ '-'     │
│ 5       │ 'HU-04' │ 'Chatbot de dúvidas de boleto'    │ 300  │ 1.4  │ 'Could'  │ 'KR1.2' │
└─────────┴─────────┴───────────────────────────────────┴──────┴──────┴──────────┴─────────┘
Sprint 1: HU-01, HU-03
Sprint 2: HU-02, HU-06
Sprint 3: HU-04

Esforço por KR: KR1.1=23% · KR1.2=50% · KR2.1=18%
KRs sem iniciativa: [] | Itens sem KR: [ 'HU-05' ]

What-if HU-04 confidence 0.4→0.9: ranking RICE HU-03>HU-06>HU-01>HU-02>HU-04>HU-05  ⟶  HU-03>HU-06>HU-01>HU-04>HU-02>HU-05

Justificativa (LLM):
A ordem é justificada pelo valor relativo de prioridade (WSJF/RICE), onde HU-02 lidera com o maior valor absoluto e deve ser executada obrigatoriamente, seguida por HU-06 que possui um RICE significativamente superior ao da HU-03. Embora a HU-03 tenha um RICE ligeiramente menor, seu WSJF é inferior ao da HU-06, indicando que os benefícios de negócio dela são menores em relação ao esforço necessário.
```

```text
✔ RICE e WSJF batem com a fórmula
✔ regulatório vira Must e propaga para a dependência
✔ roadmap respeita dependência e capacidade
✔ alinhamento acusa item sem KR
ℹ pass 4
```

O que observar:

- HU-02 é pequena, regulatória e urgente: lidera o WSJF (31) apesar do RICE baixo. RICE e WSJF medem
  coisas diferentes; por isso o roadmap usa MoSCoW primeiro e WSJF como desempate.
- HU-01 é Must **porque** a HU-02 (regulatória) depende dela: a regra propaga, e o roadmap a coloca
  na sprint 1 para destravar a HU-02 na sprint 2.
- HU-05 não move nenhum KR → Won't, e fica fora do roadmap.
- A justificativa do LLM **erra uma comparação**: diz que o RICE da HU-06 é "significativamente
  superior" ao da HU-03 (1867 < 2100). É exatamente por isso que o número vem da tabela, não do texto.

## Experimente

1. Mude `capacidadePorSprint` para 6 e veja o roadmap se esticar (e o erro claro se um item não couber
   em sprint nenhuma).
2. Marque a HU-03 como `"regulatorio": true` e observe a reclassificação MoSCoW.
3. Crie um KR novo em `okrs` sem nenhum item e confira "KRs sem iniciativa" apontando a lacuna.

## Versão Python

Pasta [`python/`](python/): `priorizar.py` (funções puras, lê o mesmo `backlog.json`), `main.py` e
`test_priorizar.py`. Os números **batem com o JS** porque os arredondamentos usam os helpers de
[`comum_py/js.py`](../../comum_py/js.py): `js_round` (= `Math.round`, empate para cima) e `to_fixed`
(= `toFixed`, sobre o valor exato do double). O `round()` do Python arredonda empate para o par.

### Como rodar

```bash
cd modulos/07-ia-gestao-de-projetos
uv run python exemplos/02-priorizacao-rice-wsjf/python/main.py    # ~1,5 min (só a justificativa usa LLM)
uv run pytest exemplos/02-priorizacao-rice-wsjf/python
```

### Saída esperada (Python)

Saída real (tabela, roadmap, OKR e what-if idênticos ao JS; a justificativa também saiu igual):

```text
│ # │ id    │ titulo                          │ RICE │ WSJF │ MoSCoW │ KR    │
├───┼───────┼─────────────────────────────────┼──────┼──────┼────────┼───────┤
│ 0 │ HU-02 │ Bloquear reemissão > 60 dias    │ 300  │ 31   │ Must   │ KR2.1 │
│ 1 │ HU-06 │ Pix copia-e-cola na segunda via │ 1867 │ 6.7  │ Should │ KR1.2 │
│ 2 │ HU-03 │ Aviso por e-mail 3 dias antes   │ 2100 │ 5    │ Should │ KR2.1 │
│ 3 │ HU-01 │ Segunda via no portal           │ 1280 │ 4.8  │ Must   │ KR1.1 │
│ 4 │ HU-05 │ Tema escuro no portal           │ 225  │ 2    │ Won't  │ -     │
│ 5 │ HU-04 │ Chatbot de dúvidas de boleto    │ 300  │ 1.4  │ Could  │ KR1.2 │
Sprint 1: HU-01, HU-03
Sprint 2: HU-02, HU-06
Sprint 3: HU-04

Esforço por KR: KR1.1=23% · KR1.2=50% · KR2.1=18%
KRs sem iniciativa: [] | Itens sem KR: ['HU-05']

What-if HU-04 confidence 0.4→0.9: ranking RICE HU-03>HU-06>HU-01>HU-02>HU-04>HU-05  ⟶  HU-03>HU-06>HU-01>HU-04>HU-02>HU-05

Justificativa (LLM):
A ordem é justificada pelo valor relativo de prioridade (WSJF/RICE), onde HU-02 lidera com o maior valor absoluto e deve ser executada obrigatoriamente, seguida por HU-06 que possui um RICE significativamente superior ao da HU-03. ...
```

```text
....                                                                     [100%]
4 passed
```
