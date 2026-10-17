# Exemplo 01 · Agent loop do zero (sem framework)

**Conceito novo**: o agente é um laço **percepção → raciocínio → ação → feedback** em volta de uma chamada de
Chat Completions com *function calling*. Os componentes ficam explícitos: **toolbox** (`ferramentas.js`: schema
JSON + handler), **memory store** de curto prazo (o array `memoria`), **planner** (a chamada ao LLM) e
**executor** (valida os argumentos contra o schema e roda o handler; erro vira feedback, não exceção).

Teoria: [doc 01](../../docs/01-arquitetura-e-padroes-de-raciocinio.md) e
[doc 02 · design de schemas](../../docs/02-tools-memoria-e-contexto.md#design-de-schemas-json).

**Pré-requisito**: infra no ar (`bash infra/subir-ia.sh` na raiz) e `npm install` na pasta do módulo.

## Arquivos

| Arquivo | Papel |
|---|---|
| `ferramentas.js` | toolbox: `consultar_estoque` (com `enum`) e `calcular` (avaliador seguro, sem `eval` livre) + `validarArgs` |
| `agente.js` | o loop, com limite de passos e trace de cada fase |
| `main.js` | roda uma tarefa (ou a que você passar como argumento) e imprime o resumo de uso |

## Como rodar

```bash
cd modulos/04-agentes-autonomos
npm run ex01
# ou com outra tarefa:
node exemplos/01-agent-loop-do-zero/main.js "Quantos monitores e mouses temos no total?"
```

Tempo: 2 chamadas ao LLM, ~1–2 min no CPU (mais se outros processos usam o Ollama).

## Saída esperada

Saída real (a duração varia com a carga do Ollama):

```
Tarefa: Temos teclados suficientes para 3 pedidos de 12 unidades cada? Quantos sobram?

── passo 1 ──
[percepção] 2 mensagens no contexto (última: user)
[raciocínio] 44.8s, 434+30 tokens
[ação] consultar_estoque({"produto":"teclado"})
[feedback] {"produto":"teclado","quantidade":40}

── passo 2 ──
[percepção] 4 mensagens no contexto (última: tool)
[raciocínio] 63.3s, 489+25 tokens
[fim] objetivo atingido: Sim, temos teclados suficientes para 3 pedidos de 12 unidades cada, sobrando 4 unidades.

Resumo: 2 passos em 108.1s · 2 chamadas ao LLM · 923 tokens de prompt · 55 de resposta · 108.1s no modelo
```

Repare: mesmo com a instrução "use as ferramentas para toda conta", o `qwen3.5:4b` fez `40 - 36` de cabeça
(acertou, mas não é garantido). É o motivo de o exemplo 02 comparar com um executor determinístico.
Repare também que ~430 dos tokens do primeiro passo são system prompt + schemas das tools: cada tool custa
tokens em **toda** chamada.

## Experimente

1. Peça um produto fora do `enum`: `node exemplos/01-agent-loop-do-zero/main.js "Quantas cadeiras temos?"`.
   Veja o modelo escolher outro produto, recusar, ou receber `{ "erro": "produto deve ser um de: ..." }` como
   feedback e se corrigir.
2. Troque `maxPassos` para `1` em `main.js` (`executarAgente(tarefa, { maxPassos: 1 })`) e veja o guardrail de
   passos encerrar o loop sem resposta.
3. Remova `enum` do schema e peça "Quantos Teclados temos?": o handler recebe `Teclados` e devolve
   `undefined`. Schema bem desenhado previne erro que o código teria que tratar.
