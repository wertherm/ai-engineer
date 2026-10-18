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

## Versão Python

Solução em [`solucao/python/`](./solucao/python/): `suporte.py` (fábrica `criar_servidor_suporte(repo)` com
`MCPServer`, modelos pydantic, `Literal` para os enums, `Annotated[..., Field(...)]` para os limites e `ToolError`
para erro de negócio), `server.py` (stdio) e `test_suporte.py` (**pytest**).

O equivalente Python do `InMemoryTransport` é passar o próprio servidor ao client: `Client(criar_servidor_suporte())`
conecta em processo, passando pelo protocolo MCP de verdade. Os testes `async` rodam com o plugin pytest do `anyio`
(que já vem com o `mcp`): `pytestmark = pytest.mark.anyio` + fixture `anyio_backend` devolvendo `"asyncio"`.

```bash
cd modulos/03-mcp
uv run pytest exercicios/01-mcp-de-suporte -vv
npx -y @modelcontextprotocol/inspector@2.11.0 --cli .venv/bin/python exercicios/01-mcp-de-suporte/solucao/python/server.py \
  -q --format json --method tools/call --tool-name abrir_ticket --tool-arg cliente=Oficina --tool-arg "assunto=Boleto não chegou" \
  | jq -c .result.structuredContent
```

Saída real (Python):

```text
test_expoe_as_3_tools_com_schema_e_annotations PASSED [ 20%]
test_abre_ticket_com_prioridade_padrao_e_lista_por_status PASSED [ 40%]
test_fecha_ticket_e_nao_deixa_fechar_de_novo PASSED [ 60%]
test_ticket_inexistente_e_argumentos_invalidos_viram_is_error PASSED [ 80%]
test_resource_suporte_tickets_id_devolve_o_ticket PASSED [100%]
============================== 5 passed in 0.64s ===============================

{"ticket":{"id":1,"cliente":"Oficina","assunto":"Boleto não chegou","prioridade":"media","status":"aberto","resolucao":null}}
```
