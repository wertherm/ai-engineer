# Exercício 01 · Chain de reembolso com validação, retry e grounding

## Contexto

O financeiro recebe pedidos de reembolso em texto livre no chat ("almocei com cliente, deu R$ 62,40").
Você vai automatizar a triagem sem deixar o LLM **decidir** nada: ele extrai e redige; a regra decide.

## Requisitos

1. **Elo 1 — extrair** um JSON com `colaborador`, `valor` (número > 0), `categoria`
   (`alimentacao | transporte | hospedagem | outros`) e `data` (`AAAA-MM-DD`), usando structured output
   (`response_format` com JSON Schema) **e** validação com zod.
2. **Retry com feedback**: se o JSON não parsear ou não validar, devolva o erro ao modelo e tente de novo,
   até **3 tentativas**. Esgotou? Retorne `{ ok: false, status: "revisao_humana", erro }` — nunca chute.
3. **Grounding**: rejeite (e faça retry) se o `valor` extraído **não aparece no texto** (aceite `62,40`,
   `62.40` e `187`).
4. **Regra no código**: limites por categoria — alimentação R$ 80, transporte R$ 150, hospedagem R$ 400,
   outros R$ 50. Acima do limite → `negado`.
5. **Elo 2 — redigir** uma frase cordial ao colaborador comunicando a decisão já tomada.
6. **Testes com vitest** usando um cliente falso (sem rede) que cubram: sucesso de primeira; data no formato
   errado → 2ª tentativa com o erro no feedback; valor inventado → `revisao_humana` após 3 tentativas;
   JSON quebrado → recupera.

## Critério de pronto

- `npx vitest run exercicios/01-chain-com-validacao-e-retry` passa (5 testes).
- `node exercicios/01-chain-com-validacao-e-retry/solucao/main.js` processa os dois pedidos de exemplo:
  o de R$ 62,40 (alimentação) é **aprovado** e o de 187 reais (transporte) é **negado**.

## Dicas

- Injete o cliente (`extrair(cliente, texto)`): no teste, ele vira `{ chat: { completions: { create: vi.fn() } } }`.
- `mockResolvedValueOnce` encadeado simula "1ª resposta ruim, 2ª boa".
- O schema zod pode ir direto para o `response_format` com `zodResponseFormat` (de `openai/helpers/zod`).
- Converta números do texto no formato brasileiro (`1.234,56`) antes de comparar.

## Solução

[`solucao/reembolso.js`](solucao/reembolso.js) (lógica), [`solucao/main.js`](solucao/main.js) (execução real)
e [`solucao/reembolso.test.js`](solucao/reembolso.test.js) (testes).

### Saída real da solução

```bash
cd modulos/02-apis-ia-generativa
npx vitest run exercicios/01-chain-com-validacao-e-retry   # Test Files 1 passed (1) · Tests 5 passed (5)
npm run exe01                                              # ~4 min em CPU (4 chamadas ao LLM)
```

```
> Oi, aqui é a Marina Souza. Almocei com um cliente em 03/10 e gastei R$ 62,40. Pode reembolsar?
  · {"tentativa":1,"ok":true}
  dados: {"colaborador":"Marina Souza","valor":62.4,"categoria":"alimentacao","data":"2026-10-03"}
  decisão (código): {"decisao":"aprovado","motivo":"dentro do limite de R$ 80 para alimentacao"}
  resposta (LLM): Marina, sua solicitação de R$ 62,40 foi aprovada, pois se enquadra perfeitamente no limite máximo de R$ 80,00 destinado à alimentação.

> Sou o Pedro Lima, peguei um táxi do aeroporto até o hotel no dia 12/10, deu 187 reais.
  · {"tentativa":1,"ok":true}
  dados: {"colaborador":"Pedro Lima","valor":187,"categoria":"transporte","data":"2026-10-12"}
  decisão (código): {"decisao":"negado","motivo":"acima do limite de R$ 150 para transporte"}
  resposta (LLM): Pedro Lima, após uma análise detalhada, informamos que o valor solicitado de R$ 187 foi negado pois ultrapassa o limite máximo de reembolso para transporte estabelecido em R$ 150.
```

Repare que, com o modelo real, os dois pedidos passaram de primeira (`tentativa: 1`): o retry quase nunca é
exercitado em produção — por isso ele é testado com o cliente falso, não "na sorte".

## Versão Python

[`solucao/python/reembolso.py`](solucao/python/reembolso.py) (modelo pydantic `Reembolso`, `extrair` com
3 tentativas + feedback + grounding, `decidir`, `redigir`), [`solucao/python/main.py`](solucao/python/main.py)
e [`solucao/python/test_reembolso.py`](solucao/python/test_reembolso.py): os mesmos 5 testes, com o cliente
falso feito de `unittest.mock.Mock` + `side_effect` (uma resposta por chamada, como o `mockResolvedValueOnce`).

### Como rodar

```bash
cd modulos/02-apis-ia-generativa
uv run pytest exercicios/01-chain-com-validacao-e-retry -v
uv run python exercicios/01-chain-com-validacao-e-retry/solucao/python/main.py     # ~4 min em CPU
```

### Saída esperada (Python)

```
exercicios/01-chain-com-validacao-e-retry/solucao/python/test_reembolso.py .....
============================== 5 passed in 0.36s ===============================
```

```
> Oi, aqui é a Marina Souza. Almocei com um cliente em 03/10 e gastei R$ 62,40. Pode reembolsar?
  · {"tentativa": 1, "ok": true}
  dados: {"colaborador":"Marina Souza","valor":62.4,"categoria":"alimentacao","data":"2026-10-03"}
  decisão (código): {"decisao": "aprovado", "motivo": "dentro do limite de R$ 80 para alimentacao"}
  resposta (LLM): Marina, sua solicitação de R$ 62,40 foi aprovada, pois se enquadra perfeitamente no limite máximo de R$ 80,00 destinado à alimentação.

> Sou o Pedro Lima, peguei um táxi do aeroporto até o hotel no dia 12/10, deu 187 reais.
  · {"tentativa": 1, "ok": true}
  dados: {"colaborador":"Pedro Lima","valor":187.0,"categoria":"transporte","data":"2026-10-12"}
  decisão (código): {"decisao": "negado", "motivo": "acima do limite de R$ 150 para transporte"}
  resposta (LLM): Pedro Lima, após uma análise detalhada, informamos que o valor solicitado de R$ 187 foi negado pois ultrapassa o limite máximo de reembolso para transporte estabelecido em R$ 150.
```

Mesmo resultado do JS. Detalhe Python: o `valor` é `float`, então `187` vira `187.0` no JSON; na frase ao
colaborador usamos `f"{valor:g}"` para não escrever "R$ 187.0".
