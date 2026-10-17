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
