"""Solução do exercício 01 (Python): laço "auditar -> pedir correção ao LLM -> auditar" até nota 100 ou até
esgotar as tentativas. O componente continua HTML/CSS (roda no navegador); o Python orquestra e audita.

Uso (da pasta do módulo): uv run python exercicios/01-componente-acessivel/solucao/python/corrigir.py
"""

import asyncio
import os
import sys
from pathlib import Path

from comum_py.acessibilidade import auditar, resumo_para_llm
from comum_py.config import conversar, criar_cliente, extrair_codigo
from comum_py.navegador import abrir_navegador, fechar_navegador

MAX_TENTATIVAS = int(os.environ.get("MAX_TENTATIVAS", 3))
AQUI = Path(__file__).resolve().parent
SAIDA = AQUI / "saida"
ORIGINAL = AQUI.parent.parent / "componente-ruim.html"


async def main() -> int:
    SAIDA.mkdir(exist_ok=True)
    html = ORIGINAL.read_text()
    cliente = criar_cliente()
    pw, browser = await abrir_navegador()
    try:
        a = await auditar(browser, html)
        print(f"[original] nota {a['nota']}/100 ({a['elementos']} elementos)\n{resumo_para_llm(a['violacoes'])}")
        for i in range(1, MAX_TENTATIVAS + 1):
            if a["nota"] >= 100:
                break
            # Cada rodada leva o HTML ATUAL + as violações ATUAIS (não o histórico): o contexto do modelo
            # local é de 4096 tokens e o histórico só cresceria.
            r = await asyncio.to_thread(conversar, cliente, [
                {"role": "system", "content": "Você corrige acessibilidade de HTML. Mantenha o visual e a função. Responda só com um bloco ```html com o componente completo (markup + <style>)."},
                {"role": "user", "content": f"Componente:\n```html\n{html}\n```\nProblemas (axe-core + checagens próprias):\n{resumo_para_llm(a['violacoes'])}\n"
                    "Regras: botão de ícone precisa de aria-label; imagem decorativa usa alt=\"\"; nada de div clicável (use <button type=\"button\">); "
                    "campo precisa de <label for> visível; texto com contraste >= 4.5:1 (ex.: #595959 sobre branco)."},
            ], 700)
            candidato = extrair_codigo(r.texto, "html")
            b = await auditar(browser, candidato)
            print(f"\n[tentativa {i}] {r.segundos}s{' [CORTADA]' if r.fim == 'length' else ''} -> nota {b['nota']}/100 ({b['elementos']} elementos)")
            if b["violacoes"]:
                print(resumo_para_llm(b["violacoes"]))
            # Só aceita se não piorou, tem conteúdo e NÃO foi cortada por max_tokens (o navegador "perdoa"
            # CSS truncado e a nota pode dar 100, mas isso não deveria ir para o repositório).
            if r.fim != "length" and b["elementos"] >= 3 and b["nota"] >= a["nota"]:
                html, a = candidato, b
            else:
                print("  (rejeitada: cortada, piorou ou veio vazia)")
    finally:
        await fechar_navegador(pw, browser)
    (SAIDA / "componente-corrigido.html").write_text(html)
    print(f"\nResultado final: nota {a['nota']}/100 -> saida/componente-corrigido.html")
    return 0 if a["nota"] == 100 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
