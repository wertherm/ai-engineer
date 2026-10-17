# Exemplo 02 · "Empresa como MCP": mini-CRM/billing no Postgres

**Conceito novo:** expor um serviço interno real (dados no Postgres, schema `m03`) como servidor MCP, com
schemas zod restritivos, `outputSchema`/`structuredContent`, `annotations` de leitura/escrita, erro de negócio
com `isError`, resource template com listagem e `instructions` do servidor.

**Pré-requisito:** exemplo 01; infra no ar (`bash infra/subir-ia.sh` na raiz do repo).

- `db.js`: pool `pg` com `search_path=m03` e seed idempotente (3 clientes, 5 faturas). `node db.js` recria os dados.
- `crm.js`: **fábrica** `criarServidorCrm(pool)` sem transporte (reutilizada nos exemplos 03 e 05).
- `server.js`: entrada stdio (é o comando que Claude Desktop/VS Code executariam).
- `client.js`: recria os dados e faz o fluxo de um atendente.

## Como rodar

```bash
cd modulos/03-mcp
npm run ex02        # ou: node exemplos/02-empresa-como-mcp/client.js
```

## Saída esperada

```text
Instruções do servidor: CRM e faturamento da Exemplo SA. Busque o cliente pelo nome antes de consultar faturas.
- buscar_clientes {"readOnlyHint":true}
- listar_faturas {"readOnlyHint":true}
- registrar_pagamento {"readOnlyHint":false,"destructiveHint":false,"idempotentHint":true}

buscar_clientes({"termo":"padaria"})
  {"clientes":[{"id":1,"nome":"Padaria Pão Quente","email":"contato@paoquente.example","plano":"basico"}]}

listar_faturas({"cliente_id":1,"status":"aberta"})
  {"faturas":[{"id":2,"cliente_id":1,"valor":199.9,"vencimento":"2026-10-10","status":"aberta"},{"id":3,"cliente_id":1,"valor":49.9,"vencimento":"2026-10-20","status":"aberta"}],"total":249.8}

registrar_pagamento({"fatura_id":2})
  {"fatura":{"id":2,"cliente_id":1,"valor":199.9,"vencimento":"2026-10-10","status":"paga"}}

listar_faturas({"cliente_id":1,"status":"aberta"})
  {"faturas":[{"id":3,"cliente_id":1,"valor":49.9,"vencimento":"2026-10-20","status":"aberta"}],"total":49.9}

registrar_pagamento({"fatura_id":999}) [ERRO]
  Fatura 999 não existe.

listar_faturas({"cliente_id":-1}) [ERRO]
  MCP error -32602: Input validation error: Invalid arguments for tool listar_faturas: Too small: expected number to be >0 at cliente_id

Resources: crm://clientes/1 (Padaria Pão Quente), crm://clientes/2 (Oficina Turbo), crm://clientes/3 (Clínica Sorriso)
crm://clientes/2 -> {"id":2,"nome":"Oficina Turbo","email":"financeiro@turbo.example","plano":"pro"}
```

## Experimente

1. Rode com outro fuso (`TZ=Asia/Tokyo npm run ex02`) e confira que `vencimento` não muda. Depois remova o
   `setTypeParser(1082, ...)` de `db.js` e use `toISOString()`: o dia passa a depender do fuso.
2. Tire o `env: { ..., DATABASE_URL }` do `client.js`, defina `DATABASE_URL` com outra porta no shell e veja que o
   filho continua no padrão: o SDK não repassa variáveis arbitrárias ao processo stdio.
3. Crie a tool `resumo_financeiro` (total aberto e pago por cliente) com `outputSchema` e teste no client.
