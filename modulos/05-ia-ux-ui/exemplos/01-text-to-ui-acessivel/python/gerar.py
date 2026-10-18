"""Text-to-UI com verificação automática (versão Python de gerar.js): descrição -> LLM gera HTML/CSS ->
Chrome headless renderiza, tira screenshot e o axe-core audita -> as violações voltam ao LLM numa 2ª
iteração -> comparamos a nota antes/depois.

Uso (da pasta do módulo): uv run python exemplos/01-text-to-ui-acessivel/python/gerar.py ["descrição"]
"""

import asyncio
import sys
from pathlib import Path

from comum_py.acessibilidade import auditar, resumo_para_llm
from comum_py.config import MODELO_CHAT, conversar, criar_cliente, extrair_codigo
from comum_py.navegador import abrir_navegador, fechar_navegador

DESCRICAO = sys.argv[1] if len(sys.argv) > 1 else (
    "Card de inscrição na newsletter: logo da empresa (imagem logo.png), título, campos nome e e-mail, "
    'checkbox "aceito receber e-mails" e botão Enviar. Textos auxiliares em cinza #9e9e9e sobre fundo branco, estilo minimalista.')
SAIDA = Path(__file__).parent / "saida"

# "Markup primeiro, CSS curto no fim": com max_tokens baixo, um <style> enorme no início faz a resposta
# ser cortada antes do HTML (nota 100 de um nada). Mesmo prompt do JS.
SISTEMA = ("Você gera UI. Responda SOMENTE com um bloco ```html: primeiro o markup, depois um <style> curto "
           "(no máximo 12 regras). Sem JavaScript, sem explicações.")


def aviso(r) -> str:
    return " [CORTADA por max_tokens]" if r.fim == "length" else ""


def relatorio(rotulo: str, r, a: dict) -> None:
    print(f"[{rotulo}] {r.segundos}s, {r.tokens} tokens{aviso(r)}, {a['elementos']} elementos -> "
          f"nota {a['nota']}/100, {len(a['violacoes'])} regra(s) violada(s)")
    print(resumo_para_llm(a["violacoes"]) or "  (nenhuma violação)")


async def main() -> None:
    SAIDA.mkdir(exist_ok=True)
    cliente = criar_cliente()
    pw, browser = await abrir_navegador()
    print(f"Modelo: {MODELO_CHAT}\nDescrição: {DESCRICAO}\n")
    try:
        # Iteração 1: o prompt "ingênuo". Nenhuma palavra sobre acessibilidade.
        # O SDK openai é síncrono aqui: bloquear o loop num script de linha de comando não faz mal.
        r1 = conversar(cliente, [{"role": "system", "content": SISTEMA}, {"role": "user", "content": DESCRICAO}], max_tokens=900)
        v1 = extrair_codigo(r1.texto, "html")
        (SAIDA / "v1.html").write_text(v1)
        a1 = await auditar(browser, v1, screenshot=SAIDA / "v1.png")
        relatorio("v1", r1, a1)

        # Iteração 2: o relatório do axe + o HTML anterior voltam ao modelo, com a regra de PRIORIDADE
        # (sem ela o modelo manteve #9e9e9e "conforme solicitado": pedido de cor x contraste).
        r2 = conversar(cliente, [
            {"role": "system", "content": SISTEMA},
            {"role": "user", "content": DESCRICAO},
            {"role": "assistant", "content": "```html\n" + v1 + "\n```"},
            {"role": "user", "content":
                "Um auditor automático (axe-core, WCAG 2.1 AA) encontrou estes problemas:\n" + (resumo_para_llm(a1["violacoes"]) or "- nenhum")
                + "\nCorrija TODOS. Acessibilidade tem PRIORIDADE sobre as cores pedidas na descrição: troque qualquer texto "
                "#9e9e9e (ou mais claro) por #595959. Mantenha: todo <input> com <label for>, <img> com alt, um <h1>. "
                "Devolva o fragmento completo corrigido."},
        ], max_tokens=900)
        v2 = extrair_codigo(r2.texto, "html")
        (SAIDA / "v2.html").write_text(v2)
        a2 = await auditar(browser, v2, screenshot=SAIDA / "v2.png")
        print()
        relatorio("v2", r2, a2)
    finally:
        await fechar_navegador(pw, browser)
    print(f"\nNota: {a1['nota']} -> {a2['nota']} | arquivos em {SAIDA} (v1/v2 .html e .png)")


if __name__ == "__main__":
    asyncio.run(main())
