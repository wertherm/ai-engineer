"""Da ideia ao componente testável (versão Python de main.js): spec -> LLM gera o componente (JS, porque
roda no navegador) -> LLM gera testes pytest SÓ a partir da spec -> rodamos os testes do LLM E os testes de
aceitação humanos (pytest + Playwright, o componente executa no Chrome headless).

Uso (da pasta do módulo): uv run python exemplos/02-ideia-ao-componente-testavel/python/main.py
"""

import os
import re
import subprocess
import sys
from pathlib import Path

from comum_py.config import conversar, criar_cliente, extrair_codigo

AQUI = Path(__file__).resolve().parent
GERADO = AQUI / "gerado"
MODULO = AQUI.parent.parent.parent


def rodar(rotulo: str, arquivo: Path) -> bool:
    """Roda o pytest num subprocesso contra o componente GERADO e resume passed/failed."""
    env = {**os.environ, "COMPONENTE": "python/gerado/paginacao.js", "TESTES_LLM": "1"}
    r = subprocess.run([sys.executable, "-m", "pytest", str(arquivo), "-p", "no:cacheprovider"],
                       cwd=MODULO, env=env, capture_output=True, text=True)
    saida = r.stdout + r.stderr
    conta = {k: (re.search(rf"(\d+) {k}", saida) or [None, "0"])[1] for k in ("passed", "failed", "error")}
    print(f"\n== {rotulo}: pass {conta['passed']}, fail {conta['failed']}, erro {conta['error']}")
    for linha in [l for l in saida.splitlines() if l.startswith(("FAILED", "ERROR"))][:6]:
        print(linha.replace(str(MODULO) + "/", "")[:200])
    return r.returncode == 0


def main() -> int:
    GERADO.mkdir(exist_ok=True)
    spec = (AQUI.parent / "spec.md").read_text()
    cliente = criar_cliente()

    # Prompt do componente: o MESMO do JS (o componente é JS de browser; o Python só orquestra e testa).
    r1 = conversar(cliente, [
        {"role": "system", "content": "Você é um dev front-end sênior. Responda só com um bloco ```js. JavaScript moderno, ES module, sem dependências, sem comentários longos."},
        {"role": "user", "content": f"Implemente exatamente esta spec em um arquivo paginacao.js:\n\n{spec}"},
    ], max_tokens=500)
    (GERADO / "paginacao.js").write_text(extrair_codigo(r1.texto, "js") + "\n")
    print(f"[componente] {r1.segundos}s, {r1.tokens} tokens -> gerado/paginacao.js")

    # Testes em pytest, gerados SÓ da spec (sem mostrar o código: não "copiam" os bugs). O componente
    # roda no Chrome, então o teste recebe a fixture `renderizar` pronta (conftest.py). As lições do JS
    # (sem mock, testes curtos, max_tokens 700) já entram no prompt.
    r2 = conversar(cliente, [
        {"role": "system", "content": "Você escreve testes. Responda só com um bloco ```python usando pytest. Sem dependências além de pytest e re."},
        {"role": "user", "content":
            "Escreva 4 testes pytest CURTOS (1 a 3 asserts cada) para esta spec. A função é JavaScript e roda no navegador: "
            "use a fixture `renderizar` (JÁ EXISTE, não a defina), chamando renderizar({\"paginaAtual\": 2, \"totalPaginas\": 3}), "
            "que devolve o HTML (str). Se a função lançar erro, renderizar levanta ErroJS (from comum_py.componente_js import ErroJS), "
            "com o atributo .nome (ex.: 'RangeError'). NÃO crie mock nem reimplemente a função.\n\n" + spec},
    ], max_tokens=700)
    (GERADO / "test_paginacao.py").write_text(extrair_codigo(r2.texto, "python") + "\n")
    print(f"[teste do LLM] {r2.segundos}s, {r2.tokens} tokens -> gerado/test_paginacao.py")

    ok_llm = rodar("testes gerados pelo LLM", GERADO / "test_paginacao.py")
    ok_humano = rodar("testes de aceitação (humanos)", AQUI / "test_aceitacao.py")
    print(f"\nResultado: testes do LLM {'passaram' if ok_llm else 'FALHARAM'}; aceitação "
          f"{'APROVADA' if ok_humano else 'REPROVADA (veja a seção \"Correção humana\" do README)'}")
    return 0 if ok_humano else 1


if __name__ == "__main__":
    sys.exit(main())
