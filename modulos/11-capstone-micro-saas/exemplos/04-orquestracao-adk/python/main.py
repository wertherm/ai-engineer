"""Orquestração multiagente com o Google ADK PYTHON (google-adk 2.12) rodando no LLM LOCAL:
  START -> pesquisador (LlmAgent + tool buscar_politicas) -> redator (LlmAgent) -> verificar (função)
Diferente do ADK TypeScript, o Python já traz o conector LiteLLM: `LiteLlm(model="ollama_chat/...")` fala com
o Ollama sem adaptador próprio (no JS foi preciso estender BaseLlm). Cada agente pode usar um modelo diferente
(MODELO_PESQUISADOR / MODELO_REDATOR). O nó final é CÓDIGO: confere se as citações são arquivos que o
pesquisador leu.
  uv run python exemplos/04-orquestracao-adk/python/main.py [tenant] ["pergunta"]
"""

import asyncio
import json
import os
import re
import sys
import time
import warnings

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import InMemoryRunner
from google.adk.tools import FunctionTool
from google.adk.workflow import Workflow
from google.genai import types

from app_py import config
from app_py.db import criar_pool
from app_py.llm import criar_llm
from app_py.servico import criar_servico

# O ADK 2.12 avisa "[EXPERIMENTAL] feature FeatureName.JSON_SCHEMA_FOR_FUNC_DECL is enabled" ao declarar a tool.
warnings.filterwarnings("ignore", message=r"\[EXPERIMENTAL\]")
TENANT_ID = sys.argv[1] if len(sys.argv) > 1 else "acme"
PERGUNTA = sys.argv[2] if len(sys.argv) > 2 else "Quantos dias por semana posso trabalhar de casa e quanto recebo de auxílio para isso?"
# ollama_chat/ = API nativa do Ollama (/api/chat), a recomendada pela doc do ADK para tools. A base vem da
# MESMA variável dos outros exemplos, sem o sufixo /v1 do modo compatível com OpenAI.
OLLAMA_BASE = config.BASE_URL.removesuffix("/").removesuffix("/v1")
CITACAO = re.compile(r"\[([\w.-]+\.md)\]", re.ASCII)


def modelo(nome: str, max_tokens: int) -> LiteLlm:
    # reasoning_effort="none" o LiteLLM traduz para think=false (desliga o "thinking" do qwen3.5).
    return LiteLlm(model=f"ollama_chat/{nome}", api_base=OLLAMA_BASE, temperature=0, max_tokens=max_tokens,
                   reasoning_effort="none", timeout=900)


async def main() -> None:
    pool = await criar_pool()
    servico = criar_servico(pool=pool, llm=criar_llm())
    async with pool.connection() as c:
        tenant = await (await c.execute("SELECT id, nome FROM m11.tenants_py WHERE id = %s", [TENANT_ID])).fetchone()
    lidos: dict[str, None] = {}  # arquivos que a tool devolveu: base da verificação de citações

    async def buscar_politicas(consulta: str) -> dict:
        """Busca trechos das políticas internas da empresa por assunto.

        Args:
            consulta: assunto curto, ex.: "auxílio home office"
        """
        trechos = await servico.buscar(tenant, consulta, k=3, canal="adk")
        for t in trechos:
            lidos[t["fonte"]] = None
        return {"trechos": [{"arquivo": t["fonte"], "texto": t["conteudo"]} for t in trechos]}

    # O ADK Python gera a declaração da tool pela assinatura + docstring (no JS foi um schema zod).
    pesquisador = LlmAgent(
        name="pesquisador",
        description="Encontra nas políticas os fatos necessários para a pergunta.",
        model=modelo(os.environ.get("MODELO_PESQUISADOR", config.MODELO_CHAT), 150),
        instruction=(
            "Chame buscar_politicas UMA vez com o assunto principal da pergunta. Depois copie TODOS os fatos dos trechos "
            "que tenham relação com qualquer parte da pergunta, um por linha, com o arquivo entre colchetes, "
            'ex.: "- regra X [arquivo.md]". Não responda a pergunta.'
        ),
        tools=[FunctionTool(buscar_politicas)],
        output_key="evidencias",  # a saída vai para o estado da sessão, lida pelo próximo agente
    )
    redator = LlmAgent(
        name="redator",
        description="Escreve a resposta final ao colaborador a partir das evidências.",
        model=modelo(os.environ.get("MODELO_REDATOR", config.MODELO_CHAT), 120),
        # {pergunta} e {evidencias} são lidos do ESTADO da sessão (templating do ADK).
        instruction=(
            "Pergunta do colaborador: {pergunta}\nEvidências:\n{evidencias}\n\nResponda em português, em até 2 frases, usando só "
            "as evidências e mantendo o arquivo entre colchetes após cada fato. Se as evidências não cobrem uma parte da "
            "pergunta, diga que não encontrou essa parte; nunca complete com suposições."
        ),
        output_key="resposta",
    )

    def verificar(node_input) -> dict:
        """Nó de função: recebe a saída do nó anterior. Determinístico, sem custo de tokens."""
        citados = CITACAO.findall(str(node_input))
        return {"verificado": bool(citados) and all(f in lidos for f in citados), "citados": citados, "lidos": list(lidos)}

    fluxo = Workflow(name="politicas_adk", edges=[("START", pesquisador, redator, verificar)])
    runner = InMemoryRunner(node=fluxo, app_name="politicas")
    sessao = await runner.session_service.create_session(app_name="politicas", user_id=tenant["id"], state={"pergunta": PERGUNTA})

    print(f"Tenant: {tenant['nome']}\nPergunta: {PERGUNTA}\n")
    t0 = t_anterior = time.perf_counter()
    msg = types.Content(role="user", parts=[types.Part(text=PERGUNTA)])
    async for ev in runner.run_async(user_id=tenant["id"], session_id=sessao.id, new_message=msg):
        dt = f"{time.perf_counter() - t_anterior:.1f}s".rjust(7)
        t_anterior = time.perf_counter()
        for p in (ev.content.parts if ev.content and ev.content.parts else []):
            if p.function_call:
                print(f"{dt} [{ev.author}] chama {p.function_call.name}({json.dumps(p.function_call.args, ensure_ascii=False)})")
            elif p.function_response:
                arquivos = ", ".join(t["arquivo"] for t in (p.function_response.response or {}).get("trechos", []))
                print(f"{dt} [{ev.author}] tool devolveu {arquivos}")
            elif p.text:
                print(f"{dt} [{ev.author}] {p.text.strip().replace(chr(10), chr(10) + ' ' * 10)}")
        if ev.output is not None and not ev.content:
            # Saída de nó de função: o autor é o Workflow; o nome do nó está no fim do path ("wf@1/verificar@1").
            no = ev.node_info.path.rsplit("/", 1)[-1].split("@")[0] or ev.author
            print(f"{dt} [{no}] {json.dumps(ev.output, ensure_ascii=False, separators=(',', ':'))}")
        if ev.error_message:
            print(f"[erro] {ev.error_message}")
    fim = await runner.session_service.get_session(app_name="politicas", user_id=tenant["id"], session_id=sessao.id)
    print(f"\nestado final: {json.dumps(list(fim.state), separators=(',', ':'))} · total {time.perf_counter() - t0:.1f}s")
    await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
