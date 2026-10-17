# Exemplo 04 · IA no cliente × no servidor: busca semântica e chatbot com a chave só no back-end

**Conceito novo:** a lógica de IA mora no **servidor** (proxy de IA): o navegador só conhece `/api/busca` e
`/api/chat`; a chave e o endpoint do modelo ficam nas variáveis de ambiente do servidor, que também valida a
entrada e aplica rate limit **antes** de gastar token. O verificador **prova** isso espionando o tráfego do Chrome.

**Pré-requisito:** [exemplo 03](../03-app-com-mcp-e2e/) (Playwright dirigindo a UI por rótulos) e a infra com
Postgres + pgvector. A busca usa a técnica do [RAG do módulo 01](../../../01-fundamentos-ia-llms/exemplos/05-primeiro-rag/).

## Arquivos

| Arquivo | Papel |
|---|---|
| [`faq.js`](faq.js) | Base de conhecimento do suporte (9 perguntas, 5 categorias) |
| [`busca.js`](busca.js) | Indexa a FAQ no schema `m05` (embeddings 1024-d) e busca por similaridade de cosseno, com bônus de personalização |
| [`servidor.js`](servidor.js) | Express: estáticos + `/api/busca` + `/api/chat` (RAG curto), validação e rate limit por IP |
| [`public/index.html`](public/index.html) | Front sem chave: busca, chatbot e `interesses` no `localStorage` |
| [`verificar.js`](verificar.js) | Chrome headless: busca, personalização, chatbot, vazamento de chave, validação e 429 |
| [`anti-padrao-chave-no-browser.html`](anti-padrao-chave-no-browser.html) | O que **não** fazer (não é servido) |

## Como rodar

```bash
cd modulos/05-ia-ux-ui
npm run ex04           # verificação completa (1 chamada ao chat + embeddings; 1 a 10 min)
npm run ex04:server    # uso manual: http://127.0.0.1:30520 (Ctrl+C para parar)
```

Na 1ª execução a FAQ é indexada em `m05.faq` (9 embeddings); nas seguintes, reaproveitada.

## Saída esperada

Saída real:

```
Busca "em quantos dias meu café chega?" -> ["Qual o prazo de entrega?","Como funciona a assinatura de café?","O moedor chegou com defeito"]
Personalização "quero cancelar": antes ["entrega · score 0.484","assinatura · score 0.46","trocas · score 0.361"]
                                depois ["assinatura · score 0.509","assinatura · score 0.418","pagamento · score 0.361"] (interesses=["assinatura"])
Chatbot: Sim, aceitamos Pix com 5% de desconto. Caso precise de mais ajuda, posso encaminhar você a um atendente.
Requisições do browser: 5, todas para http://127.0.0.1:30521? true
Browser chamou http://localhost:11434? false | chave apareceu em alguma resposta? false
Pergunta com 301 caracteres -> HTTP 400
Rajada de 7 buscas inválidas (limite 6/min) -> 400, 400, 400, 429, 429, 429, 429
Verificação OK
```

A rajada mostra a ordem dos middlewares: as 3 primeiras ainda cabiam no limite (o browser já tinha usado 3) e
voltaram 400 da validação; da 4ª em diante, 429 sem nem olhar o corpo.

O que observar:

- **Busca semântica:** "em quantos dias meu café chega?" acha "Qual o prazo de entrega?" sem palavras em comum.
- **Personalização em tempo real:** depois do clique num resultado de *assinatura*, a mesma busca ambígua
  ("quero cancelar") sobe a categoria preferida (+0,05 no score).
- **Chave e endpoint só no servidor:** o browser fez requisições **apenas** para a própria origem e nenhuma resposta
  continha a chave (o verificador usa uma "chave sentinela"; o Ollama aceita qualquer valor).
- **Proteções que não gastam token:** pergunta grande → 400; rajada além do limite → 429 (o rate limit roda antes
  da validação e do embedding).

## Experimente

1. Abra `npm run ex04:server`, faça uma pergunta e veja no DevTools (aba Network) que só há chamadas a `/api/*`.
2. Troque `OPENAI_BASE_URL`/`OPENAI_API_KEY`/`MODELO_CHAT` para a OpenAI ou o OpenRouter: o front não muda.
3. Leia o [`anti-padrao-chave-no-browser.html`](anti-padrao-chave-no-browser.html) e liste tudo o que um visitante
   consegue fazer com a chave; compare com o [doc 04](../../docs/04-ia-no-cliente-e-no-servidor.md) (Firebase AI Logic + App Check).
