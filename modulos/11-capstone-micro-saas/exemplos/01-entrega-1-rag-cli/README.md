# Entrega 1 · Protótipo funcional do RAG com CLI

**Conceito novo**: validar a lógica do produto (RAG multi-tenant com citações verificadas e um agente que
usa o RAG como ferramenta) **antes** de existir API ou tela. Um CLI é o jeito mais barato de errar cedo.

O que esta entrega introduz em [`app/src/`](../../app/src/): `db.js` (schema `m11`, HNSW, `tsvector`
gerado), `rag.js` (chunking, busca híbrida RRF, prompt com fontes numeradas, guarda de citações),
`servico.js` (fachada: PII, cache semântico, corte de relevância, auditoria), `agente.js` (agent loop) e
`seed.js` (2 empresas de demonstração). Teoria no [doc 02](../../docs/02-rag-agentes-e-mcp.md).

**Pré-requisito**: infra no ar (`bash infra/subir-ia.sh` na raiz do repo) e `npm install` na pasta do módulo.

## Como rodar

```bash
cd modulos/11-capstone-micro-saas
npm run e1 -- indexar                                   # = npm run seed (migra, cria tenants, indexa)
npm run e1 -- buscar acme "limite de alimentação em viagem"
npm run e1 -- buscar padaria "limite de alimentação em viagem"
npm run e1 -- perguntar acme "Posso dividir minhas férias em partes?"
npm run e1 -- perguntar padaria "Qual o limite de alimentação em viagem? Meu CPF é 529.982.247-25"
npm run e1 -- perguntar acme "Vou viajar a trabalho por 3 dias: quanto posso gastar com alimentação no total e posso pegar táxi do hotel para o cliente?" --agente
```

## Saída esperada

Indexação (o tempo depende da fila do Ollama):

```
[seed] acme     ferias.md                    5 chunks
[seed] acme     home-office.md               5 chunks
[seed] acme     reembolso.md                 5 chunks
[seed] acme     seguranca-da-informacao.md   5 chunks
[seed] padaria  ferias.md                    4 chunks
[seed] padaria  turnos-e-faltas.md           4 chunks
[seed] padaria  uniforme-e-higiene.md        4 chunks
[seed] pronto em 41.8s
```

Busca (sem LLM): a mesma consulta em dois tenants. A padaria não tem política de viagem, e o melhor
trecho dela tem similaridade ~0,41 — abaixo do corte de 0,5 que o `perguntar` usa:

```
Tenant: Acme Software · consulta: "limite de alimentação em viagem"
  1. [reembolso.md] sim=0.730 rrf=0.0328 · Política de reembolso de despesas (Acme Software): O limite de alimentação em viagem é de ...
  2. [reembolso.md] sim=0.379 rrf=0.0320 · Política de reembolso de despesas (Acme Software): Despesas de viagem a trabalho são reemb...
  3. [reembolso.md] sim=0.381 rrf=0.0161 · Política de reembolso de despesas (Acme Software): Táxi e aplicativo de transporte são ree...
Tenant: Padaria Pão Quente · consulta: "limite de alimentação em viagem"
  1. [uniforme-e-higiene.md] sim=0.334 rrf=0.0325 · Política de uniforme e higiene (Padaria Pão Quente): Colaborador com sintomas de gripe ou ...
  2. [ferias.md] sim=0.413 rrf=0.0164 · Política de férias (Padaria Pão Quente): As férias podem ser divididas em no máximo 2 perí...
  3. [turnos-e-faltas.md] sim=0.333 rrf=0.0159 · Política de turnos e faltas (Padaria Pão Quente): Atestado médico deve ser entregue em até...
```

Pergunta (RAG + LLM; 1 chamada, lenta em CPU com fila) e a mesma pergunta de novo (cache semântico):

```
Tenant: Acme Software · modo: rag
Pergunta: Posso dividir minhas férias em partes?

Resposta: Sim, você pode dividir suas férias em até três períodos. Um deles deve ter no mínimo 14 dias corridos e os demais, no mínimo 5 dias cada [1].
  [1] ferias.md · Política de férias (Acme Software): As férias podem ser divididas em até 3 perío...
verificado=true · cache=false · 337.6s · 387 tokens

...
verificado=true · cache=true · 4.0s · 387 tokens
```

PII mascarada antes do LLM + "não encontrei" sem gastar LLM (assunto fora das políticas da padaria):

```
Tenant: Padaria Pão Quente · modo: rag
Pergunta: Qual o limite de alimentação em viagem? Meu CPF é 529.982.247-25
[pii] mascarado antes do LLM: {"CPF":1}

Resposta: Não encontrei isso nas políticas da empresa.
verificado=true · cache=false · 4.8s
```

Modo agente (pergunta composta: busca + conta 3 × R$ 90; 2 chamadas ao LLM):

```
Tenant: Acme Software · modo: agente
Pergunta: Vou viajar a trabalho por 3 dias: quanto posso gastar com alimentação no total e posso pegar táxi do hotel para o cliente?
[passo 1] 388.6s -> buscar_politicas({"consulta":"viagem de trabalho alimentação táxi"})
[passo 2] 331.1s -> resposta final

Resposta: Para 3 dias de viagem, o limite total para alimentação é de R$ 270,00. O uso de táxi é permitido apenas se for entre o hotel e o cliente. [reembolso.md]
  reembolso.md
verificado=true · cache=false · 725.7s
```

Os testes das partes críticas (chunking, extração de citações, guarda, neutralização de tags) rodam sem
LLM: `npm test` (ver [`app/test/rag.test.js`](../../app/test/rag.test.js)). O isolamento entre tenants no
banco real: `npm run test:integracao`.

## Experimente

1. Pergunte algo que mistura PII e política: `perguntar acme "Meu e-mail é ana@exemplo.com, posso vender férias?"` e veja o `[pii]` e a auditoria: `psql postgres://ia:ia@localhost:5433/ia -c "select canal, acao, detalhe from m11.auditoria order by id desc limit 3"` (a pergunta gravada está mascarada).
2. Mude `LIMIAR_RELEVANCIA` em `app/src/servico.js` para `0.3` e repita a pergunta da padaria sobre viagem: agora o LLM é chamado com trechos irrelevantes — e a guarda decide se a resposta passa.
3. Edite `app/dados/acme/ferias.md` (ex.: "até 2 períodos"), rode `indexar` e pergunte de novo: o cache do tenant foi invalidado e a resposta muda.

## Versão Python

O mesmo protótipo sobre o back-end Python [`app_py/`](../../app_py/) (`db.py`, `rag.py`, `servico.py`,
`agente.py`, `seed.py`): psycopg 3 assíncrono + pgvector, mesmo schema `m11` com tabelas `_py`
(`tenants_py`, `chunks_py`, `cache_py`, `auditoria_py`), mesmo corpus `app/dados/` e mesmas chaves de demonstração.
CLI em [`python/cli.py`](python/cli.py).

### Como rodar

```bash
cd modulos/11-capstone-micro-saas
uv sync
uv run python exemplos/01-entrega-1-rag-cli/python/cli.py indexar      # = uv run python -m app_py.seed
uv run python exemplos/01-entrega-1-rag-cli/python/cli.py buscar acme "limite de alimentação em viagem"
uv run python exemplos/01-entrega-1-rag-cli/python/cli.py buscar padaria "limite de alimentação em viagem"
uv run python exemplos/01-entrega-1-rag-cli/python/cli.py perguntar acme "Posso dividir minhas férias em partes?"
uv run python exemplos/01-entrega-1-rag-cli/python/cli.py perguntar padaria "Qual o limite de alimentação em viagem? Meu CPF é 529.982.247-25"
uv run python exemplos/01-entrega-1-rag-cli/python/cli.py perguntar acme "Vou viajar a trabalho por 3 dias: quanto posso gastar com alimentação no total e posso pegar táxi do hotel para o cliente?" --agente
uv run pytest app_py/tests                                              # unidade + contrato REST/MCP (sem LLM)
INTEGRACAO=1 uv run pytest app_py/tests/test_integracao.py              # isolamento multi-tenant no banco real
```

### Saída esperada (Python)

Saída real (2026-10-18). Busca e "não encontrei" saem iguais ao JS, número a número; os tempos de LLM são
menores porque o Ollama estava sem fila nessa hora:

```
[seed] acme     ferias.md                    5 chunks
...
[seed] padaria  uniforme-e-higiene.md        4 chunks
[seed] pronto em 6.8s

Tenant: Acme Software · consulta: "limite de alimentação em viagem"
  1. [reembolso.md] sim=0.730 rrf=0.0328 · Política de reembolso de despesas (Acme Software): O limite de alimentação em viagem é de ...
  2. [reembolso.md] sim=0.379 rrf=0.0320 · Política de reembolso de despesas (Acme Software): Despesas de viagem a trabalho são reemb...
  3. [reembolso.md] sim=0.381 rrf=0.0161 · Política de reembolso de despesas (Acme Software): Táxi e aplicativo de transporte são ree...
Tenant: Padaria Pão Quente · consulta: "limite de alimentação em viagem"
  1. [uniforme-e-higiene.md] sim=0.334 rrf=0.0325 · Política de uniforme e higiene (Padaria Pão Quente): Colaborador com sintomas de gripe ou ...
  2. [ferias.md] sim=0.413 rrf=0.0164 · Política de férias (Padaria Pão Quente): As férias podem ser divididas em no máximo 2 perí...
  3. [turnos-e-faltas.md] sim=0.333 rrf=0.0159 · Política de turnos e faltas (Padaria Pão Quente): Atestado médico deve ser entregue em até...

Tenant: Acme Software · modo: rag
Pergunta: Posso dividir minhas férias em partes?

Resposta: Sim, você pode dividir suas férias em até três períodos. Um deles deve ter no mínimo 14 dias corridos e os demais, no mínimo 5 dias cada [1].
  [1] ferias.md · Política de férias (Acme Software): As férias podem ser divididas em até 3 perío...
verificado=true · cache=false · 13.5s · 387 tokens
...
verificado=true · cache=true · 0.6s · 387 tokens

Tenant: Padaria Pão Quente · modo: rag
Pergunta: Qual o limite de alimentação em viagem? Meu CPF é 529.982.247-25
[pii] mascarado antes do LLM: {"CPF":1}

Resposta: Não encontrei isso nas políticas da empresa.
verificado=true · cache=false · 0.6s

Tenant: Acme Software · modo: agente
Pergunta: Vou viajar a trabalho por 3 dias: quanto posso gastar com alimentação no total e posso pegar táxi do hotel para o cliente?
[passo 1] 30.5s -> buscar_politicas({"consulta":"viagem de trabalho alimentação táxi"})
[passo 2] 18.0s -> resposta final

Resposta: Para 3 dias de viagem, o limite total para alimentação é de R$ 270,00. O uso de táxi é permitido apenas se for entre o hotel e o cliente. [reembolso.md]
  reembolso.md
verificado=true · cache=false · 49.5s
```

Testes (`INTEGRACAO=1 uv run pytest app_py/tests`): `23 passed` (9 de RAG, 10 de contrato REST/MCP, 4 de integração).

Diferenças de implementação (o comportamento é o mesmo): o pool é `psycopg_pool.AsyncConnectionPool` com
`autocommit=True` e `register_vector_async` (o vetor vai como `pgvector.Vector`, sem montar texto `[...]`);
a reindexação usa `async with conn.transaction()`; o `Set` ordenado do JS virou `dict` (preserva a ordem).
