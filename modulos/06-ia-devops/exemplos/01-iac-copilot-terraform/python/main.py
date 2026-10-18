"""IaC Copilot: linguagem natural → OpenTofu/Terraform → validação determinística → loop de correção.

O LLM só PROPÕE o HCL. Quem aprova é o pipeline (fmt, validate, plan, conftest) e, no fim, um humano no PR.
"""
import os
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[2]))  # raiz do módulo (comum_py)
sys.path.insert(0, str(AQUI))
from comum_py.llm import chat, resumo_uso, tirar_cercas  # noqa: E402
from validar import validar_iac  # noqa: E402

PEDIDO = sys.argv[1] if len(sys.argv) > 1 else (
    'Crie a configuração do serviço "pagamentos" no ambiente homolog: um arquivo saida/pagamentos.conf '
    "com as linhas porta=8080 e ambiente=homolog, e uma senha aleatória de 24 caracteres para o banco "
    "gravada em saida/pagamentos.senha."
)
MAX_TENTATIVAS = int(os.environ.get("MAX_TENTATIVAS", "5"))
DIR = Path(os.environ.get("TRABALHO_DIR", AQUI / "trabalho"))
# As políticas Rego são as MESMAS do JS (pasta do exemplo); o exercício 01 pluga extras por POLITICAS_EXTRAS.
POLITICAS = [AQUI.parent / "politicas", *[p for p in os.environ.get("POLITICAS_EXTRAS", "").split(",") if p]]

# Prompt de infraestrutura: escopo fechado, formato rígido e GROUNDING das versões reais dos providers.
# Sem o esqueleto abaixo o qwen3.5:4b inventava "~> 3.0" para o local (que está na 2.x) e reprovava no init.
# As regras da casa (políticas OPA) NÃO vão no prompt de propósito: quem as garante é o conftest.
SYSTEM = """Você é um gerador de código OpenTofu/Terraform (HCL).
Comece EXATAMENTE com este bloco e use só estes providers:
terraform {
  required_providers {
    local  = { source = "hashicorp/local", version = "~> 2.9" }
    random = { source = "hashicorp/random", version = "~> 3.9" }
  }
}
Recursos úteis: random_password (length, special), local_file e local_sensitive_file (filename, content, file_permission).
Caminhos sempre com "${path.module}/...". Responda APENAS com o código HCL, sem explicações."""


def corpo_do_pr(r, tentativas):
    plano = "\n".join(f"- {x}" for x in r["recursos"])
    return f"""## IaC gerado pelo copilot (revisão humana obrigatória)

**Pedido:** {PEDIDO}

**Checks determinísticos:** tofu fmt ✔ · tofu validate ✔ · tofu plan ✔ · conftest ({len(POLITICAS)} diretório(s) de política) ✔
**Tentativas do LLM até passar:** {tentativas}

### Plano
{plano}

### Código
```hcl
{r["hcl_final"]}```
"""


def main():
    print(f"Pedido: {PEDIDO}\n")
    ultimo_hcl = ""
    feedback = ""
    for t in range(1, MAX_TENTATIVAS + 1):
        # Contexto enxuto: pedido + (último HCL + erros). Não acumulamos todas as tentativas no prompt.
        messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": PEDIDO}]
        if feedback:
            messages.append({"role": "assistant", "content": ultimo_hcl})
            messages.append({"role": "user", "content": f"O pipeline rejeitou o código:\n{feedback}\nDevolva o HCL completo corrigido."})
        msg, ms, _ = chat(messages, max_tokens=450)
        ultimo_hcl = tirar_cercas(msg.content)
        print(f"── tentativa {t} (LLM {ms / 1000:.1f}s, {len(ultimo_hcl.split(chr(10)))} linhas de HCL)")

        r = validar_iac(ultimo_hcl, DIR, POLITICAS)
        if r["formatado"]:
            print("   fmt      : corrigido automaticamente com `tofu fmt` (sem gastar LLM)")
        print(f"   resultado: {'APROVADO' if r['ok'] else 'REPROVADO na etapa ' + r['etapa']}")
        for e in r["erros"]:
            print(f"     ✗ {e}")

        if r["ok"]:
            # Workflow PR-first: o copilot não aplica nada. Ele entrega o arquivo + o resumo do plano
            # para um humano revisar num Pull Request; o `apply` acontece no pipeline após o merge.
            pr = DIR / "PR.md"
            pr.write_text(corpo_do_pr(r, t))
            print("\nPlano (o que o PR vai criar):")
            for rec in r["recursos"]:
                print(f"   + {rec}")
            print(f"\nHCL aprovado:\n{r['hcl_final']}")
            print(f"Corpo do PR gravado em {os.path.relpath(pr)}")
            print(f"\n{resumo_uso()}")
            return 0
        feedback = "\n".join(f"- [{r['etapa']}] {e}" for e in r["erros"])
    print(f"\nDesisti após {MAX_TENTATIVAS} tentativas: escalar para um humano. {resumo_uso()}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
