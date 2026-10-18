# Exercício 01 · Política OPA nova e o copilot respeitando-a

## Contexto

O time de segurança decidiu que **toda senha gerada pelo IaC precisa ter pelo menos 32 caracteres e
caracteres especiais**. A regra não pode depender do prompt do copilot (modelos esquecem); ela precisa
estar no pipeline, como Policy-as-Code, com testes.

Base: [exemplo 01](../../exemplos/01-iac-copilot-terraform/) (o copilot aceita políticas extras pela
variável `POLITICAS_EXTRAS`, lista de diretórios separados por vírgula).

## Requisitos

1. Escreva `politicas/senhas.rego` (pacote `main`, regras `deny`) que, sobre o JSON do `tofu plan`, nega
   `random_password` com `length < 32` ou `special = false`, só para ações `create`/`update`.
2. Escreva `politicas/senhas_test.rego` com pelo menos 4 testes (`conftest verify`): senha curta negada,
   sem especiais negada, senha forte aprovada, recurso em `delete` ignorado.
3. Prove com um plano **real** (HCL escrito à mão, sem LLM) que a política reprova uma senha de 16 caracteres.
4. Rode o copilot com a política plugada e um pedido que a viola ("senha de 16 caracteres"). Observe: o
   loop de correção precisa terminar aprovado com `length >= 32` (política vence o pedido) ou desistir e escalar.
5. (Bônus, Unidade VII, sem solução pronta) Peça ao LLM para explicar o `senhas.rego` em linguagem natural para
   um dev de produto e compare com os testes: a explicação bate com o que os testes provam?

## Critério de pronto

- `conftest verify -p politicas` → 4 testes passando.
- O plano com `length = 16, special = false` reprova com as duas mensagens.
- O copilot nunca entrega um PR com senha fraca.

## Dicas

- `rc.change.after.length` e `rc.change.after.special` estão no plano (o `special` aparece com o default `true` se omitido).
- Em teste Rego, `deny with input as {...}` troca a entrada.
- Para rodar só a parte determinística: `node exercicios/01-politica-opa-nova/solucao/main.js --sem-llm`.

## Solução

[`solucao/`](solucao/) · rode a partir da pasta do módulo:

```bash
npm run exe01                      # verify + plano real + copilot (LLM, vários minutos)
node exercicios/01-politica-opa-nova/solucao/main.js --sem-llm   # só as partes determinísticas
```

Saída real da solução:

```
== 1. conftest verify ==
   4 tests, 4 passed, 0 warnings, 0 failures, 0 exceptions, 0 skipped

== 2. plano real com senha fraca (sem LLM) ==
   etapa: conftest
   ✗ random_password.db: length 16 é curto; a plataforma exige length >= 32
   ✗ random_password.db: special = false; a plataforma exige caracteres especiais

== 3. copilot do exemplo 01 com a política nova ==
Pedido: Gere uma senha aleatória de 16 caracteres para o banco do serviço estoque e grave em saida/estoque.senha.

── tentativa 1 (LLM 255.7s, 22 linhas de HCL)
   fmt      : corrigido automaticamente com `tofu fmt` (sem gastar LLM)
   resultado: REPROVADO na etapa conftest
     ✗ local_file.estoque_senha grava random_password.estoque_senha em texto puro; use local_sensitive_file
     ✗ random_password.estoque_senha: length 16 é curto; a plataforma exige length >= 32
── tentativa 2 (LLM 387.4s, 22 linhas de HCL)
   fmt      : corrigido automaticamente com `tofu fmt` (sem gastar LLM)
   resultado: APROVADO

Plano (o que o PR vai criar):
   + create local_sensitive_file.estoque_senha
   + create random_password.estoque_senha

HCL aprovado:
terraform {
  required_providers {
    local  = { source = "hashicorp/local", version = "~> 2.9" }
    random = { source = "hashicorp/random", version = "~> 3.9" }
  }
}

resource "random_password" "estoque_senha" {
  length      = 32
  special     = true
  min_lower   = 8
  min_upper   = 8
  min_numeric = 8
  min_special = 8
}

resource "local_sensitive_file" "estoque_senha" {
  filename        = "${path.module}/saida/estoque.senha"
  content         = random_password.estoque_senha.result
  file_permission = "0600"
}

Corpo do PR gravado em exercicios/01-politica-opa-nova/solucao/trabalho-copilot/PR.md

2 chamadas ao LLM · 654 tokens de prompt · 355 de resposta · 643.0s no modelo
```

## Versão Python

[`solucao/python/solucao.py`](solucao/python/solucao.py): mesmos 3 passos, reaproveitando `validar.py` do
[exemplo 01 em Python](../../exemplos/01-iac-copilot-terraform/python/) e as **mesmas** políticas Rego de
`solucao/politicas/` (Rego não depende da linguagem do copilot). O passo 3 chama o `main.py` Python do exemplo 01 com
`POLITICAS_EXTRAS` e `TRABALHO_DIR` (`solucao/python/trabalho-copilot/`).

```bash
cd modulos/06-ia-devops
uv run python exercicios/01-politica-opa-nova/solucao/python/solucao.py             # verify + plano real + copilot (LLM)
uv run python exercicios/01-politica-opa-nova/solucao/python/solucao.py --sem-llm   # só as partes determinísticas
```

Saída real (Python):

```
== 1. conftest verify ==
   4 tests, 4 passed, 0 warnings, 0 failures, 0 exceptions, 0 skipped

== 2. plano real com senha fraca (sem LLM) ==
   etapa: conftest
   ✗ random_password.db: length 16 é curto; a plataforma exige length >= 32
   ✗ random_password.db: special = false; a plataforma exige caracteres especiais

== 3. copilot do exemplo 01 com a política nova ==
Pedido: Gere uma senha aleatória de 16 caracteres para o banco do serviço estoque e grave em saida/estoque.senha.

── tentativa 1 (LLM 100.0s, 22 linhas de HCL)
   fmt      : corrigido automaticamente com `tofu fmt` (sem gastar LLM)
   resultado: REPROVADO na etapa conftest
     ✗ local_file.estoque_senha grava random_password.estoque_senha em texto puro; use local_sensitive_file
     ✗ random_password.estoque_senha: length 16 é curto; a plataforma exige length >= 32
── tentativa 2 (LLM 137.2s, 22 linhas de HCL)
   fmt      : corrigido automaticamente com `tofu fmt` (sem gastar LLM)
   resultado: APROVADO

Plano (o que o PR vai criar):
   + create local_sensitive_file.estoque_senha
   + create random_password.estoque_senha

HCL aprovado:
... (mesmo HCL da versão JS: length = 32, special = true, local_sensitive_file 0600)

Corpo do PR gravado em exercicios/01-politica-opa-nova/solucao/python/trabalho-copilot/PR.md

2 chamadas ao LLM · 654 tokens de prompt · 355 de resposta · 237.2s no modelo
```
