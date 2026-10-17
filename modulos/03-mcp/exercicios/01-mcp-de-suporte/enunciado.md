# Exercício 01 · MCP de um serviço novo (central de suporte) com testes

## Contexto

O time de atendimento quer que o assistente corporativo e o copilot da IDE consigam abrir, listar e fechar
tickets. Você vai expor a "central de suporte" como servidor MCP, no mesmo padrão do
[exemplo 02](../../exemplos/02-empresa-como-mcp/): fábrica do servidor separada do transporte.

## Requisitos

1. `suporte.js` exporta `criarServidorSuporte(repo)`; o repositório é injetado (use um em memória).
2. Tools com schema zod restritivo, `outputSchema` e `annotations`:
   - `abrir_ticket(cliente, assunto, prioridade)`: `prioridade` é `baixa | media | alta`, padrão `media`; `assunto` entre 5 e 200 caracteres.
   - `listar_tickets(status?)`: `aberto | fechado`; somente leitura.
   - `fechar_ticket(id, resolucao)`: id inteiro positivo; idempotente.
3. Erros de negócio como `isError: true` com mensagem clara: ticket inexistente, ticket já fechado.
4. Resource template `suporte://tickets/{id}` que devolve o ticket em JSON.
5. `server.js`: entrada stdio.
6. Testes automatizados com `node:test` e `InMemoryTransport` cobrindo: tools expostas e schemas, abertura com
   prioridade padrão, fechamento duplo, validação de argumentos e leitura do resource.

## Critério de pronto

- `npm run exe01` passa todos os testes.
- O Inspector CLI consegue chamar a tool pelo servidor stdio:
  `npx -y @modelcontextprotocol/inspector@2.11.0 --cli node exercicios/01-mcp-de-suporte/solucao/server.js --method tools/list`.

## Dicas

- `const [a, b] = InMemoryTransport.createLinkedPair()`: conecte o servidor em um lado e o `Client` no outro.
- Crie um servidor novo em cada teste (`beforeEach`) para isolar o estado.
- `node --test` recebe um glob (`'pasta/*.test.js'`), não a pasta.

## Saída real da solução

```text
$ npm run exe01
✔ expõe as 3 tools com schema e annotations (196.510126ms)
✔ abre ticket com prioridade padrão e lista por status (25.322354ms)
✔ fecha ticket e não deixa fechar de novo (15.93511ms)
✔ ticket inexistente e argumentos inválidos viram isError (14.395548ms)
✔ resource suporte://tickets/{id} devolve o ticket (17.141388ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0

$ npx -y @modelcontextprotocol/inspector@2.11.0 --cli node exercicios/01-mcp-de-suporte/solucao/server.js -q --format json \
    --method tools/call --tool-name abrir_ticket --tool-arg cliente=Oficina --tool-arg "assunto=Boleto não chegou" | jq -c .result.structuredContent
{"ticket":{"id":1,"status":"aberto","resolucao":null,"cliente":"Oficina","assunto":"Boleto não chegou","prioridade":"media"}}
```

Solução em [`solucao/`](./solucao/).
