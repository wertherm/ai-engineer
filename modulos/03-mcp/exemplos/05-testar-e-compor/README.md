# Exemplo 05 · Testar com o MCP Inspector CLI, compor MCPs e ligar uma UI

**Conceito novo:** testar servidores sem escrever client (MCP Inspector v2 em modo `--cli`, pronto para CI) e
**compor** vários servidores (stdio + HTTP) num único catálogo de tools com prefixo por servidor; por cima, um
backend BFF com uma página HTML consome essa composição.

**Pré-requisito:** exemplos 02 e 04 (são os servidores compostos); infra no ar (Postgres); `jq` para o script do Inspector.

- `inspector.sh`: chama o Inspector CLI (`npx -y @modelcontextprotocol/inspector@2.11.0 --cli`) contra o servidor
  stdio do exemplo 01 e contra o HTTP do exemplo 04 (porta 30353, com `--header`), incluindo casos de falha.
- `composicao.js`: `conectarTudo()` conecta no CRM (stdio) e no catálogo (HTTP + token), agrega as tools como
  `crm__*` e `catalogo__*` e roteia as chamadas.
- `compor.js`: demonstração em linha de comando.
- `gateway.js`: BFF na porta 30351 (`GET /`, `GET /api/tools`, `POST /api/tools/:nome`). Guarda os tokens no
  backend e só libera para a UI as tools com `readOnlyHint`.

## Como rodar

```bash
cd modulos/03-mcp
npm run ex05:inspector    # Inspector CLI (a 1ª vez baixa o pacote; ~30 s)
npm run ex05              # composição
npm run ex05:gateway      # BFF + UI em http://127.0.0.1:30351 (Ctrl+C para parar)
# em outro terminal:
curl -s http://127.0.0.1:30351/api/tools | jq -c '[.[].name]'
curl -s -X POST http://127.0.0.1:30351/api/tools/crm__buscar_clientes -H 'Content-Type: application/json' -d '{"termo":"clínica"}'
curl -s -w ' HTTP %{http_code}\n' -X POST http://127.0.0.1:30351/api/tools/crm__registrar_pagamento -H 'Content-Type: application/json' -d '{"fatura_id":2}'
```

## Saída esperada

`npm run ex05:inspector`:

```text
== stdio: tools/list (nomes)
["somar","dia_da_semana"]
== stdio: tools/call somar a=2 b=3
{"resultado":5}
== stdio: resources/read saudacao://Ana
Olá, Ana! Bem-vindo ao MCP.
== stdio: prompts/get revisar_codigo
"Revise este código e aponte bugs:\n\nx=1"
== stdio: argumento inválido -> exit code diferente de 0 (bom para CI)
exit code: 5
== http: tools/list com service token
["listar_produtos","consultar_estoque","quem_sou_eu"]
== http: tools/call consultar_estoque
{"sku":"CAF-002","preco":29.5,"estoque":0}
== http: sem token -> falha (--stored-auth-only evita o Inspector tentar OAuth interativo no 401)
{"error":{"code":"auth_required","message":"Error POSTing to endpoint: {\"error\":\"invalid_token\",\"error_description\":\"Missing Authorization header\"}"}}
exit code: 3
```

`npm run ex05`:

```text
Tools agregadas (6):
 - crm__buscar_clientes
 - crm__listar_faturas
 - crm__registrar_pagamento
 - catalogo__listar_produtos
 - catalogo__consultar_estoque
 - catalogo__quem_sou_eu

Oficina Turbo (plano pro) quer 1 moedor: preço R$ 189, estoque 7 -> pode vender
Servidor inexistente -> Servidor desconhecido: erp
```

`npm run ex05:gateway` + os `curl` acima:

```text
Gateway em http://127.0.0.1:30351 (tools liberadas: crm__buscar_clientes, crm__listar_faturas, catalogo__listar_produtos, catalogo__consultar_estoque, catalogo__quem_sou_eu)
["crm__buscar_clientes","crm__listar_faturas","catalogo__listar_produtos","catalogo__consultar_estoque","catalogo__quem_sou_eu"]
{"isError":false,"texto":"{\"clientes\":[{\"id\":3,\"nome\":\"Clínica Sorriso\",\"email\":\"adm@sorriso.example\",\"plano\":\"enterprise\"}]}"}
{"erro":"Tool crm__registrar_pagamento não liberada para a UI"} HTTP 403
```

A página em `http://127.0.0.1:30351/` (select com as tools, caixa de argumentos JSON e botão "Chamar") usa
esses mesmos endpoints; ela foi conferida via `curl` (HTML servido), sem abrir navegador.

Observação: a primeira execução do Inspector cria `~/.mcp-inspector/` (armazenamento do Inspector).

## Experimente

1. Rode o Inspector com UI web para explorar visualmente: `npx -y @modelcontextprotocol/inspector@2.11.0 node exemplos/01-servidor-stdio/server.js`.
2. Some um terceiro servidor à composição (o de suporte do exercício 01) com o prefixo `suporte__`.
3. Ligue o loop LLM do exemplo 03 em cima de `conectarTudo()`: o modelo passa a cruzar CRM e catálogo na mesma conversa.
