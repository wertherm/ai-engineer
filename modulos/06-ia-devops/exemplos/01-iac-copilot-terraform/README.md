# Exemplo 01 · IaC Copilot: linguagem natural → OpenTofu validado por OPA

**Conceito novo**: o LLM só **propõe** HCL; um pipeline determinístico decide se serve —
`tofu fmt` (corrige sozinho, sem gastar token) → `tofu init` → `tofu validate` → `tofu plan` →
`tofu show -json` → `conftest` (políticas Rego sobre o **plano**). Cada erro volta ao LLM como feedback, com
limite de 5 tentativas (`MAX_TENTATIVAS`); aprovado, o copilot **não aplica**: grava o corpo de um PR (`trabalho/PR.md`) para
revisão humana (workflow PR-first).

Teoria: [doc 02 · IaC Copilot](../../docs/02-iac-cicd-seguranca-e-finops.md) e
[doc 01 · o princípio do módulo](../../docs/01-fundamentos-ia-generativa-para-infra.md#o-princípio-do-módulo).

**Pré-requisito**: infra no ar (`bash infra/subir-ia.sh` na raiz), `npm install` no módulo, `tofu` e
`conftest` em `~/.local/bin` (ver README do módulo). Os providers `hashicorp/local` e `hashicorp/random`
são baixados do registry do OpenTofu na 1ª execução e ficam em `~/.cache/ai-engineer-m06/` (fora do repo; sem nuvem, sem conta).

## Arquivos

| Arquivo | Papel |
|---|---|
| `main.js` | prompt de infra (escopo fechado + grounding de versões), loop de correção, corpo do PR |
| `validar.js` | pipeline determinístico (reutilizado no exercício 01) |
| `politicas/arquivos.rego` | regras da casa: arquivo sem acesso para "outros"; segredo nunca em `local_file` |

## Como rodar

```bash
cd modulos/06-ia-devops
npm run ex01
# outro pedido:
node exemplos/01-iac-copilot-terraform/main.js "Gere um arquivo saida/motd.txt com a mensagem Bem-vindo"
```

Tempo: 1 a 5 chamadas ao LLM; com o Ollama em CPU e compartilhado, **cada uma levou de 3 a 8 min** aqui.

## Saída esperada

```
Pedido: Crie a configuração do serviço "pagamentos" no ambiente homolog: um arquivo saida/pagamentos.conf com as linhas porta=8080 e ambiente=homolog, e uma senha aleatória de 24 caracteres para o banco gravada em saida/pagamentos.senha.

── tentativa 1 (LLM 348.6s, 38 linhas de HCL)
   fmt      : corrigido automaticamente com `tofu fmt` (sem gastar LLM)
   resultado: REPROVADO na etapa validate
     ✗ Unsupported argument: An argument named "min_uppercase" is not expected here. (linha 27)
     ✗ Unsupported argument: An argument named "min_lowercase" is not expected here. (linha 28)
     ✗ Unsupported argument: An argument named "min_numbers" is not expected here. (linha 29)
     ✗ Incorrect attribute value type: Inappropriate value for attribute "min_special": number required, but have bool. (linha 30)
     ✗ Argumentos válidos de local_file: content (string), content_base64 (string), directory_permission (string), file_permission (string), filename (string), sensitive_content (string), source (string)
     ✗ Argumentos válidos de local_sensitive_file: content (string), content_base64 (string), directory_permission (string), file_permission (string), filename (string), source (string)
     ✗ Argumentos válidos de random_password: keepers (map), length (number), lower (bool), min_lower (number), min_numeric (number), min_special (number), min_upper (number), number (bool), numeric (bool), override_special (string), special (bool), upper (bool)
── tentativa 2 (LLM 260.9s, 39 linhas de HCL)
   fmt      : corrigido automaticamente com `tofu fmt` (sem gastar LLM)
   resultado: REPROVADO na etapa conftest
     ✗ local_file.config: file_permission "0644" dá acesso a outros usuários; use "0640" ou mais restrito
── tentativa 3 (LLM 470.3s, 39 linhas de HCL)
   fmt      : corrigido automaticamente com `tofu fmt` (sem gastar LLM)
   resultado: APROVADO

Plano (o que o PR vai criar):
   + create local_file.config
   + create local_sensitive_file.password
   + create random_password.db_password

HCL aprovado:
terraform {
  required_providers {
    local  = { source = "hashicorp/local", version = "~> 2.9" }
    random = { source = "hashicorp/random", version = "~> 3.9" }
  }
}

output "config_file_path" {
  description = "Caminho do arquivo de configuração gerado"
  value       = "${path.module}/saida/pagamentos.conf"
}

output "password_file_path" {
  description = "Caminho do arquivo de senha gerado"
  value       = "${path.module}/saida/pagamentos.senha"
}

resource "local_file" "config" {
  filename        = "${path.module}/saida/pagamentos.conf"
  content         = "porta=8080\nambiente=homolog"
  file_permission = "0640"
}

resource "random_password" "db_password" {
  length      = 24
  special     = true
  min_lower   = 1
  min_upper   = 1
  min_numeric = 1
  min_special = 1
  number      = false
}

resource "local_sensitive_file" "password" {
  filename        = "${path.module}/saida/pagamentos.senha"
  content         = random_password.db_password.result
  file_permission = "0600"
}

Corpo do PR gravado em exemplos/01-iac-copilot-terraform/trabalho/PR.md

3 chamadas ao LLM · 1658 tokens de prompt · 930 de resposta · 1079.8s no modelo
```

Cada camada pegou um tipo de erro diferente: o `validate` pegou argumentos inventados (`min_uppercase`) e de tipo
errado (`min_special = true`); a dica com a **lista real de argumentos do schema** (`tofu providers schema -json`)
foi o que fez o modelo acertar os nomes na tentativa 2; o `conftest` pegou o `0644`. Mesmo aprovado, o PR ainda
precisa do revisor humano: `number = false` (argumento depreciado) junto com `min_numeric = 1` é contraditório e
nenhum check reclamou.

### Sem a dica do schema (execução anterior, também real)

Com o validate devolvendo só "An argument named \"min_uppercase\" is not expected here", o modelo repetiu os
mesmos nomes inventados nas 3 tentativas e o copilot desistiu (`Desisti após 3 tentativas: escalar para um humano`).
Erro sem contexto não ensina modelo pequeno.

### Sem grounding de versões (execução anterior, também real)

Antes de colar o bloco `required_providers` com as versões reais no prompt, as 3 tentativas falharam no
`init`/`validate` com alucinações clássicas (argumento inexistente e versão de provider que não existe):

```
── tentativa 1 (LLM 182.0s, 36 linhas de HCL)
   resultado: REPROVADO na etapa init
     ✗ Error: Unsupported argument | ... in output "pagamentos_config": | 15:   value_file = "${path.module}/saida/pagamentos.conf" | An argument named "value_file" is not expected here.
── tentativa 2 (LLM 326.7s, 36 linhas de HCL)
   resultado: REPROVADO na etapa init
     ✗ Error: Failed to resolve provider packages | Could not resolve provider hashicorp/local: no available releases match the | given constraints ~> 3.0
── tentativa 3 (LLM 449.8s, 36 linhas de HCL)
   resultado: REPROVADO na etapa init
     ✗ ... Could not resolve provider hashicorp/local: no available releases match the | given constraints 3.2.0

Desisti após 3 tentativas: escalar para um humano. 3 chamadas ao LLM · 1164 tokens de prompt · 704 de resposta · 958.5s no modelo
```

Isso é o comportamento **correto** do copilot: nada inválido chega ao PR.

## Experimente

1. Tire `politicas/` do caminho (`POLITICAS_EXTRAS` não adiciona; edite `POLITICAS` em `main.js`) e veja um
   `local_file` com `0777` "aprovado": é o que o OPA evita.
2. Peça "grave a senha em texto num local_file" e veja a regra 2 reprovar até o LLM trocar para `local_sensitive_file`.
3. Mude `MAX_TENTATIVAS=1 npm run ex01` e meça quantas vezes o modelo acerta de primeira (taxa de acerto
   sem loop de correção): é o número que justifica (ou não) o loop.
