# Exercício 01 · Cota diária por cliente (plano free × pro)

## Contexto

O Micro-SaaS já tem **rate limit** por tenant (60 requisições/minuto, em `app/src/api.js`): ele protege
o **servidor** de rajadas. Mas quem paga a conta do LLM é você: o plano free (padaria) não pode fazer
tantas perguntas quanto o pro (Acme). Falta a **cota diária**, que protege a **margem** do negócio. A
coluna `m11.tenants.cota_diaria` já existe (20 para a padaria, 200 para a Acme) e o autenticador já
devolve `tenant.cotaDiaria`.

## Requisitos

1. Só `POST /v1/perguntas` consome cota (busca e listagem não usam LLM de chat).
2. Ao passar do limite: **429** com mensagem de negócio (mencionar upgrade), não um erro genérico.
3. Cabeçalhos `X-Cota-Limite` e `X-Cota-Restante` em toda pergunta.
4. A cota zera na virada do dia.
5. A cota de um tenant não afeta o outro.
6. `GET /v1/uso` devolve `{ tenant, plano, limite, usadasHoje }`.
7. O contador precisa funcionar com **várias réplicas** da API (dica: o estado não pode ficar só na memória do processo) e sem condição de corrida.
8. Não altere `app/src/api.js`: use o parâmetro `ganchos` do `buildApp` (cada gancho recebe o escopo `/v1`, já autenticado).

## Critério de pronto

- Testes (vitest) cobrindo os requisitos 1 a 6 com dublê do serviço (sem LLM).
- Um teste contra o Postgres real disparando 20 incrementos **simultâneos** e verificando que nenhum valor se repete.
- `npm run exe01` verde.

## Dicas

- Separe a **política** (gancho Fastify) do **armazenamento** (contador): um contador em memória para testes e um no Postgres para produção, com a mesma interface `{ incrementar, consultar }`.
- No Postgres, `INSERT ... ON CONFLICT (tenant_id, dia) DO UPDATE SET perguntas = perguntas + 1 RETURNING perguntas` é atômico; "ler, somar 1 e gravar" em duas queries não é.
- Para testar a virada do dia sem esperar até meia-noite, injete o relógio (`agora = () => new Date()`).
- O hook certo é `preHandler` (roda depois da autenticação do `onRequest`, quando `req.tenant` já existe).

## Solução

[`solucao/cota.js`](solucao/cota.js) e [`solucao/cota.test.js`](solucao/cota.test.js). Para ligar na API
de verdade, em `app/src/server.js`:

```js
import { cotaDiaria, criarContadorPg } from '../../exercicios/01-cota-por-cliente/solucao/cota.js';
const app = await buildApp({ ..., ganchos: [cotaDiaria(await criarContadorPg(pool))] });
```

Saída real de `npm run exe01`:

```
 ✓ exercicios/01-cota-por-cliente/solucao/cota.test.js > cota diária por tenant > plano free: 2 perguntas passam, a 3ª recebe 429 com mensagem de upgrade 628ms
 ✓ exercicios/01-cota-por-cliente/solucao/cota.test.js > cota diária por tenant > a cota de um tenant não afeta o outro 205ms
 ✓ exercicios/01-cota-por-cliente/solucao/cota.test.js > cota diária por tenant > a cota zera na virada do dia 115ms
 ✓ exercicios/01-cota-por-cliente/solucao/cota.test.js > cota diária por tenant > só POST /v1/perguntas consome cota; GET /v1/uso mostra o consumo 76ms
 ✓ exercicios/01-cota-por-cliente/solucao/cota.test.js > contador no Postgres > incremento atômico com 20 requisições simultâneas 159ms
      Tests  5 passed (5)
```

## Versão Python

[`solucao/python/cota.py`](solucao/python/cota.py) e [`solucao/python/test_cota.py`](solucao/python/test_cota.py),
sobre a API FastAPI de [`app_py/`](../../app_py/). Mesma separação: `ContadorMemoria` (relógio injetável) e
`ContadorPg` (UPSERT atômico em `m11.uso_diario_py`) com a interface `incrementar`/`consultar`, e o gancho
`cota_diaria(contador)` para o `build_app(..., ganchos=[...])`, sem alterar `app_py/api.py`.

O gancho recebe o `APIRouter` de `/v1` (já autenticado pela guarda ASGI: `request.state.tenant` existe),
acrescenta uma **dependência** que só age em `POST /v1/perguntas` e registra `GET /v1/uso`. Uma diferença de
framework: no Fastify o `preHandler` roda **depois** da validação; no FastAPI as dependências rodam antes de o
erro de validação ser levantado. Por isso a dependência valida o corpo com `PerguntaIn` antes de contar — um
pedido inválido (400) não consome cota (o teste confere). Para ligar na API de verdade, crie o contador no
lifespan (`await criar_contador_pg(pool)`) e passe `ganchos=[cota_diaria(contador)]`.

Como rodar:

```bash
cd modulos/11-capstone-micro-saas
INTEGRACAO=1 uv run pytest exercicios/01-cota-por-cliente -v
```

Saída real (o último teste dispara 20 `incrementar` simultâneos com `asyncio.gather` sobre um pool de 5 conexões):

```
exercicios/01-cota-por-cliente/solucao/python/test_cota.py::test_plano_free_2_perguntas_passam_a_3a_recebe_429_com_upgrade PASSED [ 20%]
exercicios/01-cota-por-cliente/solucao/python/test_cota.py::test_a_cota_de_um_tenant_nao_afeta_o_outro PASSED [ 40%]
exercicios/01-cota-por-cliente/solucao/python/test_cota.py::test_a_cota_zera_na_virada_do_dia PASSED [ 60%]
exercicios/01-cota-por-cliente/solucao/python/test_cota.py::test_so_post_perguntas_consome_cota_e_get_uso_mostra_o_consumo PASSED [ 80%]
exercicios/01-cota-por-cliente/solucao/python/test_cota.py::test_contador_pg_incremento_atomico_com_20_requisicoes_simultaneas PASSED [100%]
============================== 5 passed in 0.95s ===============================
```
