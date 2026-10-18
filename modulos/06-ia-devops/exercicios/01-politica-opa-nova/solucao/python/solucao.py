"""Solução do exercício 01 (Python): (1) testa a política nova com `conftest verify`; (2) prova que ela bloqueia
um plano real; (3) roda o copilot Python do exemplo 01 com a política plugada e um pedido que a viola.

As políticas Rego são as mesmas da solução JS (`solucao/politicas/`): Rego não muda com a linguagem do copilot.
"""
import os
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
MODULO = AQUI.parents[3]
EXEMPLO01 = MODULO / "exemplos" / "01-iac-copilot-terraform"
sys.path.insert(0, str(MODULO))
sys.path.insert(0, str(EXEMPLO01 / "python"))
from comum_py.shell import run  # noqa: E402
from validar import validar_iac  # noqa: E402

POLITICA_NOVA = AQUI.parent / "politicas"
POLITICA_BASE = EXEMPLO01 / "politicas"

# 1. Testes unitários da política (sem cluster, sem LLM, milissegundos).
print("== 1. conftest verify ==")
v = run("conftest", ["verify", "--no-color", "-p", str(POLITICA_NOVA)])
print(f"   {v['stdout'].strip()}")
if not v["ok"]:
    sys.exit(1)

# 2. Teste de integração: um HCL escrito à mão com senha fraca precisa ser reprovado no plano real.
print("\n== 2. plano real com senha fraca (sem LLM) ==")
HCL_FRACO = """terraform {
  required_providers {
    random = { source = "hashicorp/random", version = "~> 3.9" }
  }
}
resource "random_password" "db" {
  length  = 16
  special = false
}
"""
r = validar_iac(HCL_FRACO, AQUI / "trabalho", [POLITICA_BASE, POLITICA_NOVA])
print(f"   etapa: {r['etapa']}")
for e in r["erros"]:
    print(f"   ✗ {e}")

# 3. Copilot com a política nova: o pedido pede 16 caracteres; a política exige 32.
#    O comportamento correto é o loop corrigir até passar (política > pedido) ou desistir e escalar.
if "--sem-llm" in sys.argv:
    sys.exit(0)
print("\n== 3. copilot do exemplo 01 com a política nova ==", flush=True)
pedido = "Gere uma senha aleatória de 16 caracteres para o banco do serviço estoque e grave em saida/estoque.senha."
filho = subprocess.run(
    [sys.executable, str(EXEMPLO01 / "python" / "main.py"), pedido],
    env={**os.environ, "POLITICAS_EXTRAS": str(POLITICA_NOVA), "TRABALHO_DIR": str(AQUI / "trabalho-copilot")},
)
sys.exit(filho.returncode)
