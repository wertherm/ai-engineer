# Exemplo 05 · Gerenciamento de contexto: pruning, sumarização e stitching

**Conceito novo**: o **contexto ativo** (o que vai na próxima chamada) é montado de propósito, sob um
orçamento de tokens, em vez de "mandar o histórico inteiro". Funções puras em [`contexto.js`](contexto.js):

| Função | Técnica |
|---|---|
| `estimarTokens` | estimativa barata (~4 caracteres/token) para o orçamento |
| `podarToolsAntigas` | **pruning** 1: encurta resultados de tool antigos (os maiores e mais "velhos") |
| `janela` | **pruning** 2: janela deslizante com o que cabe no orçamento |
| `sumarizar` | **sumarização** do que saiu da janela (1 chamada ao LLM) |
| `costurar` | **stitching**: global → fatos fixados → resumo → contexto local → janela recente |

O `quadro` em [`main.js`](main.js) simula o **contexto compartilhado entre agentes**: a parte `global`
(cliente, objetivo) vai para todos; a parte `local` de cada agente (política do suporte, limite de crédito do
financeiro) só vai para quem precisa.

Teoria: [doc 02 · gerenciamento de contexto](../../docs/02-tools-memoria-e-contexto.md#gerenciamento-de-contexto).

**Pré-requisito**: [exemplo 01](../01-agent-loop-do-zero/).

## Como rodar

```bash
cd modulos/04-agentes-autonomos
npm run ex05
```

3 chamadas ao LLM (resumo + versão A + versão B). Com o Ollama livre, menos de 1 min; nesta execução o
servidor estava disputado por outros processos: a chamada A esperou 28 min na fila e a B levou 4 s.

## Saída esperada

Saída real:

```
Histórico completo: 22 mensagens, ~545 tokens (orçamento: 220)
Após podar tools antigas: ~458 tokens
Janela: mantém 10 mensagens recentes, descarta 12 antigas

Resumo das 12 mensagens descartadas: Ana (Padaria Pão Quente) relata que o pedido 8812 de 40 caixas de farinha está em trânsito pela RodoSul. As entregas para as semanas 1, 2 e 3 ocorrem nas janelas 08h-10h ou 14h-16h, sujeitas a confirmação.

[A · só janela] ~260 tokens estimados / 406 reais, 1686s
  resposta: Não tenho acesso às informações sobre o seu pedido específico, como o número do pedido ou a quantidade de caixas.

[B · podado + resumo + stitching] ~369 tokens estimados / 552 reais, 4s
  resposta: O seu pedido é o 8812 e continha 40 caixas de farinha.

3 chamadas ao LLM · 1332 tokens de prompt · 129 de resposta · 1701.4s no modelo
```

### O que observar

- **A (só janela)** perdeu o fato que só aparecia no começo e respondeu honestamente "não tenho acesso"
  (graças ao system prompt "se não souber, diga").
- **B** recuperou "8812" e "40 caixas": o número do pedido veio dos fatos fixados, e as **40 caixas só do
  resumo**. O resumo preservou ids e números porque o prompt de sumarização pede isso.
- **A estimativa erra**: ~260 estimados contra 406 reais. A diferença é o template de chat do modelo
  (tokens de papel, marcadores) e a tokenização do português. Use a estimativa para decidir o corte e confira
  em `usage.prompt_tokens`; deixe folga.

## Experimente

1. Tire `'Pedido principal: 8812'` de `fatos` e veja se só o resumo basta.
2. Troque `ORCAMENTO` para 600: a janela passa a caber tudo e a versão A também acerta (mas com mais tokens).
3. Passe `quadro.local.financeiro` em vez de `suporte` e pergunte sobre frete grátis: o agente não sabe, porque
   aquela política é contexto local de outro agente.

## Versão Python

Pasta [`python/`](python/): `contexto.py` (as mesmas funções, puras exceto `sumarizar`), `main.py` e
`test_contexto.py` (pytest das funções puras, sem LLM). Mesmos números do JS: ~545 → ~458 tokens, janela de 10
mensagens, 1332 tokens de prompt reais. Cuidado ao portar a estimativa: `len()` do Python conta *code points* e o
`.length` do JS conta unidades UTF-16 (diferem só com emoji e afins); e `lista[:-0]` é vazio, como `slice(0, -0)`.

### Como rodar

```bash
cd modulos/04-agentes-autonomos
uv run python exemplos/05-gerenciamento-de-contexto/python/main.py
uv run pytest exemplos/05-gerenciamento-de-contexto     # 4 testes, sem LLM
```

### Saída esperada (Python)

Saída real:

```
Histórico completo: 22 mensagens, ~545 tokens (orçamento: 220)
Após podar tools antigas: ~458 tokens
Janela: mantém 10 mensagens recentes, descarta 12 antigas

Resumo das 12 mensagens descartadas: Ana (Padaria Pão Quente) relata que o pedido 8812 de 40 caixas de farinha está em trânsito pela RodoSul. As entregas para as semanas 1, 2 e 3 ocorrem nas janelas 08h-10h ou 14h-16h, sujeitas a confirmação.

[A · só janela] ~260 tokens estimados / 406 reais, 68s
  resposta: Não tenho acesso às informações sobre o seu pedido específico, como o número do pedido ou a quantidade de caixas.

[B · podado + resumo + stitching] ~369 tokens estimados / 552 reais, 54s
  resposta: O seu pedido é o 8812 e continha 40 caixas de farinha.

3 chamadas ao LLM · 1332 tokens de prompt · 129 de resposta · 206.6s no modelo
```
