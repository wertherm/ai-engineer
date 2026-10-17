# Exercício 02 · Agentic RAG: o agente decide quando buscar

## Contexto

No [exemplo 04](../../exemplos/04-padroes-de-rag/) toda pergunta passa pela busca. Isso gasta tokens de contexto em
perguntas que não precisam ("quanto é 12 × 8?"). No **Agentic RAG** a recuperação vira uma **ferramenta**: o modelo
decide se busca, o que busca (reformula a consulta) e quando parar.

## Requisitos

1. Ferramenta `buscar_documentos({ consulta })` que usa a busca híbrida do exemplo 04 (corpus em `m08.rag_docs`).
2. Loop com no máximo 3 passos; no último passo não ofereça ferramentas (força a resposta).
3. Responda 3 perguntas: uma de conhecimento geral, uma com código de produto (`CCB-78`) e uma de política interna.
4. Mostre, por pergunta, a decisão (buscou ou não, com qual consulta), a resposta, tokens e tempo.
5. **Valide as citações**: todo `[id]` citado tem de ter sido recuperado.

## Critério de pronto

- A pergunta de conta é respondida sem busca; as outras duas citam o documento certo (`[d7]`, `[p2]`).

## Dicas

- Na primeira versão da solução, o modelo **não buscou** para "Qual o prazo da CCB-78?" e inventou
  "30 dias após a data do vencimento ... [id]". Modelo pequeno decide mal quando buscar. A correção é de
  **arquitetura**: um guardrail determinístico (regex de código `LETRAS-NÚMEROS`) torna a busca obrigatória nesses
  casos, e o LLM decide só no resto (o decision framework do [doc 01](../../docs/01-fundamentos-ai-first.md)).

## Solução

[`solucao/main.js`](solucao/main.js). Rode com `npm run exe02` (5 chamadas ao LLM local, alguns minutos em CPU).
Saída real:

```text
P: Quanto é 12 vezes 8?
   decisão: respondeu sem buscar
   R: O resultado de 12 vezes 8 é 96.
   citações válidas? sim
   381 tokens · 38 s

P: Qual o prazo da CCB-78?
   decisão: busca forçada pela regra ("Qual o prazo da CCB-78?")
   R: O prazo da CCB-78 é de 12 a 60 meses [d7].
   citações válidas? sim
   466 tokens · 60 s

P: Posso trabalhar de casa quantos dias?
   decisão: buscar("trabalho remoto dias permitido home office")
   R: Você pode trabalhar de casa até 3 dias por semana, desde que tenha a aprovação do seu gestor direto [p2].
   citações válidas? sim
   932 tokens · 146 s
```

Repare que o modelo **reformulou** a consulta da 3ª pergunta ("trabalho remoto dias permitido home office") e que a
busca custou ~2,5× os tokens de responder direto: é essa a economia que o Agentic RAG captura.
