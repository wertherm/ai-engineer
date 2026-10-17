# Exercício 02 · Escopos de permissão por tool e rate limit por token

## Contexto

O [exemplo 04](../../exemplos/04-mcp-http-producao/) exige um escopo para o endpoint inteiro e aplica o mesmo
limite a todos. Agora o catálogo ganhou uma tool de escrita (`ajustar_preco`) e dois tipos de cliente: um
dashboard no plano **free** (só leitura) e o backoffice no plano **pro** (leitura e escrita).

## Requisitos

1. Servidor Streamable HTTP stateless com `requireBearerAuth` do SDK; tokens guardados como hash.
2. Escopos: `catalogo:ler` para `consultar_preco`, `catalogo:escrever` para `ajustar_preco`.
   - O `tools/list` de cada token mostra **só** as tools que ele pode usar.
   - O handler confere o escopo de novo via `extra.authInfo.scopes` (defesa em profundidade).
3. Regra de negócio no servidor: `ajustar_preco` recusa variação acima de 20% (`isError`) e grava auditoria.
4. Rate limit **por token** com **token bucket** e cota por plano: free = 3 fichas (recarga 0,05/s);
   pro = 20 fichas (recarga 1/s). Estourou: 429 com `Retry-After`.
5. Script de teste que sobe o servidor, verifica tudo com `assert` e derruba o processo pelo PID.

## Critério de pronto

`npm run exe02` termina com `OK: escopos e cotas funcionando.`

## Dicas

- O `verifyAccessToken` pode devolver `extra: { plano }`; isso chega em `req.auth.extra` no middleware.
- Em modo stateless o servidor é criado por requisição: dá para registrar as tools conforme `req.auth.scopes`.
- Token bucket: `fichas = min(capacidade, fichas + Δt × recarga)`; se `fichas < 1`, 429; senão `fichas -= 1`.

## Saída real da solução

```text
$ npm run exe02
tools/list leitor: [ 'consultar_preco' ] | editor: [ 'consultar_preco', 'ajustar_preco' ]
leitor chama ajustar_preco -> {"content":[{"type":"text","text":"MCP error -32602: Tool ajustar_preco not found"}],"isError":true}
editor ajusta CAF-001 para 45 -> {"sku":"CAF-001","preco":45}
editor ajusta para 4.5 -> Variação acima de 20% exige aprovação humana
free (3 chamadas): 200 429 429 | pro (10 chamadas): 200
auditoria: {"auditoria":"ajuste_preco","cliente":"backoffice","sku":"CAF-001","de":42.9,"para":45}
OK: escopos e cotas funcionando.
```

Solução em [`solucao/`](./solucao/) (`server.js` + `teste.js`).
