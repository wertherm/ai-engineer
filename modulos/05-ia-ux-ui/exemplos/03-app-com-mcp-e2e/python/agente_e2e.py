"""Agente de teste E2E (versão Python de agente-e2e.js): recebe um OBJETIVO em linguagem natural, descobre
as tools MCP da app, pede ao LLM um PLANO de passos (saída estruturada com pydantic) e o executa: Playwright
age na UI pelos rótulos acessíveis e o MCP prepara e confere o estado. 1 chamada ao LLM (plan-and-execute;
uma 2ª só se o plano vier inválido).

Uso (da pasta do módulo): uv run python exemplos/03-app-com-mcp-e2e/python/agente_e2e.py ["objetivo"]
"""

import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).parent))
from app import criar_app  # noqa: E402
from cliente_mcp import chamar, conectar_mcp  # noqa: E402
from estado import Estado  # noqa: E402

from comum_py.config import MODELO_CHAT, PADRAO, criar_cliente  # noqa: E402
from comum_py.navegador import abrir_navegador, fechar_navegador  # noqa: E402
from comum_py.servidor import servidor_em_thread  # noqa: E402

OBJETIVO = sys.argv[1] if len(sys.argv) > 1 else (
    'Partindo de uma lista vazia, adicione pela interface a tarefa "Pagar boleto", confirme pelo MCP que ela existe, '
    "marque-a como concluída pela interface e confirme pelo MCP que ficou concluída.")
PORT = int(os.environ.get("PORT", 30550))


# Esquema plano (todos os campos string) de propósito: modelos pequenos erram menos com ele do que com
# uniões discriminadas.
class Passo(BaseModel):
    tipo: Literal["mcp", "preencher", "clicar", "marcar", "verificar"]
    alvo: str = Field(description="tool MCP, rótulo do campo/checkbox ou nome do botão")
    valor: str = Field(description='texto a digitar, JSON de argumentos da tool ou texto esperado; "" se não usar')


class Plano(BaseModel):
    passos: list[Passo] = Field(min_length=1, max_length=10)


def erros_do_plano(plano: Plano, nomes_tools: set[str]) -> list[str]:
    """Validação semântica (o JSON Schema garante o formato, não o sentido)."""
    erros = []
    for i, p in enumerate(plano.passos, 1):
        if p.tipo in ("mcp", "verificar") and p.alvo not in nomes_tools:
            erros.append(f'passo {i}: "{p.alvo}" não é uma tool; em "{p.tipo}" o alvo deve ser uma de: {", ".join(sorted(nomes_tools))}')
        if p.tipo in ("preencher", "verificar") and not p.valor.strip():
            erros.append(f'passo {i}: "{p.tipo}" exige "valor" não vazio')
    return erros


def mensagens_iniciais(catalogo: str) -> list[dict]:
    return [
        {"role": "system", "content":
            "Você planeja testes E2E. Tipos de passo:\n"
            '- mcp: chama a tool "alvo" com argumentos JSON em "valor" (ex.: "{}")\n'
            '- preencher: digita "valor" no campo de rótulo "alvo" (o campo da tela chama "Nova tarefa")\n'
            '- clicar: clica no botão de nome "alvo" (o botão da tela chama "Adicionar")\n'
            '- marcar: marca o checkbox de rótulo "alvo" (o rótulo é o título da tarefa)\n'
            '- verificar: chama a tool "alvo" (ex.: listar_tarefas) e exige que o resultado contenha o texto "valor"\n'
            f'Tools MCP:\n{catalogo}\nResultados do listar_tarefas são JSON como {{"id":1,"titulo":"X","concluida":false}}.\n'
            # Few-shot: um plano de exemplo para OUTRO objetivo mostra o papel de cada campo melhor que regras.
            'Exemplo para "adicione Ler livro, conclua e confira": {"passos":[{"tipo":"mcp","alvo":"resetar_estado","valor":"{}"},'
            '{"tipo":"preencher","alvo":"Nova tarefa","valor":"Ler livro"},{"tipo":"clicar","alvo":"Adicionar","valor":""},'
            '{"tipo":"verificar","alvo":"listar_tarefas","valor":"Ler livro"},{"tipo":"marcar","alvo":"Ler livro","valor":""},'
            '{"tipo":"verificar","alvo":"listar_tarefas","valor":"\\"titulo\\":\\"Ler livro\\",\\"concluida\\":true"}]}'},
        {"role": "user", "content": OBJETIVO},
    ]


def planejar(cliente, mensagens: list[dict], nomes_tools: set[str]) -> Plano:
    for tentativa in (1, 2):
        inicio = time.monotonic()
        # .parse() manda o JSON Schema do pydantic em response_format e devolve o objeto validado.
        resp = cliente.chat.completions.parse(model=MODELO_CHAT, max_tokens=400, response_format=Plano,
                                              messages=mensagens, **PADRAO)
        msg = resp.choices[0].message
        plano = msg.parsed or Plano.model_validate_json(msg.content)
        erros = erros_do_plano(plano, nomes_tools)
        print(f"Plano do LLM, tentativa {tentativa} ({round(time.monotonic() - inicio)}s){' - REJEITADO' if erros else ''}:")
        for i, p in enumerate(plano.passos, 1):
            print(f"  {i}. {p.tipo} {json.dumps(p.alvo, ensure_ascii=False)} {json.dumps(p.valor, ensure_ascii=False) if p.valor else ''}")
        if not erros:
            return plano
        for e in erros:
            print(f"  ! {e}")
        mensagens += [{"role": "assistant", "content": msg.content},
                      {"role": "user", "content": "Plano inválido:\n" + "\n".join(erros) + "\nCorrija e responda o plano completo."}]
    raise RuntimeError("Plano inválido após 2 tentativas")


async def executar(plano: Plano, base: str, mcp) -> int:
    """Executor determinístico: o LLM decide O QUE fazer, o código decide COMO (e com quais limites)."""
    pw, browser = await abrir_navegador()
    page = await browser.new_page()
    await page.goto(base)
    falhas = 0
    sem_espaco = lambda x: re.sub(r"\s+", "", x)  # noqa: E731
    for i, p in enumerate(plano.passos, 1):
        rotulo = f"  passo {i} ({p.tipo} {p.alvo})"
        try:
            if p.tipo == "mcp":
                await chamar(mcp, p.alvo, json.loads(p.valor) if p.valor else {})
                if p.alvo == "resetar_estado":
                    await page.reload()
            elif p.tipo == "preencher":
                await page.get_by_label(p.alvo, exact=True).fill(p.valor, timeout=5000)
            elif p.tipo == "clicar":
                await page.get_by_role("button", name=p.alvo).click(timeout=5000)
            elif p.tipo == "marcar":
                await page.get_by_label(p.alvo, exact=True).check(timeout=5000)
            elif p.tipo == "verificar":
                # Normaliza os DOIS lados (lição da execução registrada 2 do JS: só o esperado perdia espaços).
                obtido = json.dumps(await chamar(mcp, p.alvo, {}), ensure_ascii=False, separators=(",", ":"))
                if sem_espaco(p.valor) not in sem_espaco(obtido):
                    raise AssertionError(f'esperava "{p.valor}" em {obtido}')
            if p.tipo in ("clicar", "marcar"):
                await page.wait_for_timeout(300)  # a UI chama a API e redesenha
            print(f"{rotulo}: ok")
        except Exception as e:  # noqa: BLE001 (o agente reporta e segue, como o JS)
            falhas += 1
            print(f"{rotulo}: FALHOU -> {str(e).splitlines()[0]}")
    await fechar_navegador(pw, browser)
    return falhas


async def main() -> int:
    with servidor_em_thread(criar_app(Estado()), PORT) as base:
        async with conectar_mcp(base) as mcp:
            tools = (await mcp.list_tools()).tools
            print(f"Objetivo: {OBJETIVO}\nTools MCP descobertas: {', '.join(t.name for t in tools)}\n")
            catalogo = "\n".join(f"- {t.name}: {t.description}" for t in tools)
            nomes = {t.name for t in tools}
            # O SDK openai é síncrono: rodamos o planejamento numa thread para não travar o loop (o
            # uvicorn está em outra thread, mas o cliente MCP vive neste loop).
            plano = await asyncio.to_thread(planejar, criar_cliente(), mensagens_iniciais(catalogo), nomes)
            falhas = await executar(plano, base, mcp)
            final = await chamar(mcp, "listar_tarefas")
    print(f"\nEstado final (via MCP): {json.dumps(final, ensure_ascii=False, separators=(',', ':'))}")
    print(f"Resultado: {falhas} passo(s) falharam" if falhas else "Resultado: fluxo E2E aprovado")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
