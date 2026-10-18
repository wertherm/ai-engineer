# Exemplo 01 · Preparação de dataset em JavaScript

**Conceito novo:** transformar dados brutos e sujos num JSONL de fine-tuning (formato chat) com um pipeline
reprodutível: limpeza, máscara de PII, padronização de rótulos, deduplicação, balanceamento, split
estratificado, validador e relatório de qualidade.

**Domínio:** triagem de tickets de suporte da "Loja Exemplo" (fictícia) em 5 categorias. **Todos os dados são
sintéticos**, gerados por `gerar-brutos.js` com semente fixa.

**Pré-requisito:** `npm install` na pasta do módulo. Teoria em [docs/02](../../docs/02-preparacao-de-datasets.md).

| Arquivo | Papel |
|---|---|
| `gerar-brutos.js` | gera `dados/tickets-brutos.jsonl` (456 tickets com HTML, PII, duplicatas, rótulos variados) |
| `preparacao.js` | funções puras de cada etapa |
| `preparar.js` | pipeline → `dados/treino.jsonl`, `dados/validacao.jsonl`, `dados/relatorio-qualidade.json` |
| `validar-jsonl.js` | validador de formato + domínio + vazamento (sai com código 1 se reprovar) |
| `preparacao.test.js` | testes (`node --test`) |

## Como rodar

```bash
cd modulos/09-dados-e-fine-tuning
npm run ex01:brutos     # gera os dados brutos sintéticos
npm run ex01            # limpa, balanceia, divide e grava o JSONL
npm run ex01:validar    # valida o JSONL
npm test                # testes das etapas
```

## Saída esperada

```text
$ npm run ex01:brutos
Gerados 456 tickets brutos (SINTÉTICOS) em dados/tickets-brutos.jsonl
Exemplo de linha suja: {"id":5,"canal":"app","texto":"<p>Aparece&nbsp;erro&nbsp;403&nbsp;quando&nbsp;tento&nbsp;acessar&nbsp;meus&nbsp;pedidos.&nbsp;Grata!</p><br>","categoria":"acesso"}

$ npm run ex01
Relatório de qualidade do dataset
{
  "entrada": 456,
  "descartes": { "texto_curto_ou_vazio": 2, "rotulo_fora_do_dominio": 3 },
  "aposLimpeza": 451,
  "distribuicaoAntes": { "cobranca": 107, "acesso": 74, "entrega": 178, "defeito": 58, "cancelamento": 34 },
  "duplicatasExatas": 41,
  "quaseDuplicatas": 21,
  "conflitosDeRotulo": 0,
  "aposDedup": 389,
  "distribuicaoDepois": { "cobranca": 48, "acesso": 48, "entrega": 48, "defeito": 48, "cancelamento": 32 },
  "vazamentoTreinoValidacao": 0,
  "treino": 178,
  "validacao": 46,
  "diversidadeTreino": { "ttr": 0.129, "distinct2": 0.342, "mediaPalavras": 11.8 }
}

Primeira linha de dados/treino.jsonl:
{"messages":[{"role":"system","content":"Classifique o ticket de suporte em UMA categoria: cobranca, acesso, entrega, defeito ou cancelamento. Responda somente com a categoria."},{"role":"user","content":"Olá, O código de verificação por SMS não chega. Aguardo retorno."},{"role":"assistant","content":"acesso"}]}

$ npm run ex01:validar
dados/treino.jsonl: 178 exemplos, ~11843 tokens, rótulos {"acesso":38,"entrega":38,"cobranca":38,"defeito":38,"cancelamento":26}
dados/validacao.jsonl: 46 exemplos, ~3038 tokens, rótulos {"cancelamento":6,"defeito":10,"acesso":10,"entrega":10,"cobranca":10}
vazamento treino→validação: 0 exemplo(s)
RESULTADO: aprovado

$ npm test
✔ limparTexto remove HTML, mascara PII e normaliza caixa alta
...
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

PII mascarada no treino (ex.: `"... desliga sozinho. CPF <CPF>, tel <TELEFONE>"`), sem nenhum `@`, `&nbsp;` ou `<p>`.

## Experimente

1. `node exemplos/01-preparacao-de-dataset/preparar.js --sem-balancear` e compare `distribuicaoDepois`.
2. Baixe o limiar de quase-duplicata em `deduplicar(registros, 0.9)` para `0.7` e veja quantos exemplos somem.
3. Edite uma linha de `dados/treino.jsonl` trocando `"assistant"` por `"bot"` e rode o validador.

## Versão Python

Em [`python/`](python/): `gerar_brutos.py`, `preparacao.py` (funções puras), `preparar.py`, `validar_jsonl.py` e
`test_preparacao.py` (pytest). Mesma semente e o **mesmo mulberry32** do JS (portado bit a bit), consumido na mesma
ordem; regex com `re.ASCII` onde o JS usa `\w`/`\d`; `Math.round` → `math.floor(x + 0.5)`; `toFixed` → `Decimal`
com `ROUND_HALF_UP`; JSON gravado como o `JSON.stringify` (`ensure_ascii=False`, sem espaços). Por padrão grava em
`dados/python/` (ignorado pelo git) para não sobrescrever os arquivos do JS — e eles saem **byte a byte iguais**.

**Como rodar** (da pasta do módulo, depois de `uv sync`):

```bash
uv run python exemplos/01-preparacao-de-dataset/python/gerar_brutos.py
uv run python exemplos/01-preparacao-de-dataset/python/preparar.py
uv run python exemplos/01-preparacao-de-dataset/python/validar_jsonl.py dados/python/treino.jsonl dados/python/validacao.jsonl
for f in tickets-brutos.jsonl treino.jsonl validacao.jsonl relatorio-qualidade.json; do cmp dados/python/$f dados/$f && echo "$f IDENTICO"; done
uv run pytest exemplos/01-preparacao-de-dataset -q
```

**Saída esperada (Python)** — saída real:

```text
Gerados 456 tickets brutos (SINTÉTICOS) em dados/python/tickets-brutos.jsonl
Exemplo de linha suja: {"id":5,"canal":"app","texto":"<p>Aparece&nbsp;erro&nbsp;403&nbsp;quando&nbsp;tento&nbsp;acessar&nbsp;meus&nbsp;pedidos.&nbsp;Grata!</p><br>","categoria":"acesso"}
Relatório de qualidade do dataset
{
  "entrada": 456,
  "descartes": {
    "texto_curto_ou_vazio": 2,
    "rotulo_fora_do_dominio": 3
  },
  "aposLimpeza": 451,
  ...
  "duplicatasExatas": 41,
  "quaseDuplicatas": 21,
  "conflitosDeRotulo": 0,
  "aposDedup": 389,
  ...
  "vazamentoTreinoValidacao": 0,
  "treino": 178,
  "validacao": 46,
  "diversidadeTreino": {
    "ttr": 0.129,
    "distinct2": 0.342,
    "mediaPalavras": 11.8
  }
}
dados/python/treino.jsonl: 178 exemplos, ~11843 tokens, rótulos {"acesso":38,"entrega":38,"cobranca":38,"defeito":38,"cancelamento":26}
dados/python/validacao.jsonl: 46 exemplos, ~3038 tokens, rótulos {"cancelamento":6,"defeito":10,"acesso":10,"entrega":10,"cobranca":10}
vazamento treino→validação: 0 exemplo(s)
RESULTADO: aprovado
tickets-brutos.jsonl IDENTICO
treino.jsonl IDENTICO
validacao.jsonl IDENTICO
relatorio-qualidade.json IDENTICO
.......                                                                  [100%]
7 passed
```

Os 5 testes do JS foram portados e há 2 extras: o mulberry32 devolve os mesmos 3 primeiros valores do Node e o
pipeline completo reproduz `dados/tickets-brutos.jsonl` e `dados/relatorio-qualidade.json` do JS.
