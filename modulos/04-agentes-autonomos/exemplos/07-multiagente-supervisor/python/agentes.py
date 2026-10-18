"""Três especialistas + um supervisor. Analista e planejador usam o LLM; o executor é código determinístico com
allowlist de ações (o LLM planeja, mas quem age é o código)."""

import asyncio

from barramento import Barramento
from comum_py.llm import chat, extrair_json, js

PRECOS = {"pao": 1.5, "cafe": 4, "suco": 6, "frutas": 5, "bolo": 8}  # R$ por pessoa
ACOES = ["cotar", "reservar_sala", "enviar_convite"]


async def llm(system: str, user: str, max_tokens: int):
    # A chamada do SDK openai é síncrona: to_thread deixa os outros agentes andarem enquanto o LLM pensa.
    r = await asyncio.to_thread(chat, [{"role": "system", "content": system}, {"role": "user", "content": user}],
                                max_tokens=max_tokens)
    return extrair_json(r.msg.get("content"))


def num(x):
    """1.5 * 12 = 18.0 em Python; o JS imprime 18. Normaliza para a saída bater."""
    return int(x) if isinstance(x, float) and x.is_integer() else x


async def analista(bus: Barramento) -> None:
    m = await bus.receber("analista")
    req = await llm('Extraia os requisitos do pedido. Devolva só JSON {"pessoas":n,"dia":"...","orcamento":n}.', m.conteudo, 50)
    bus.enviar("analista", "supervisor", "requisitos", req)


async def planejador(bus: Barramento) -> None:
    for _ in range(2):
        m = await bus.receber("planejador")
        if m.tipo == "encerrar":
            return
        plano = await llm(f"Planeje um café da manhã. Itens possíveis e custo por pessoa: {js(PRECOS)}. "
                          'Devolva só JSON {"itens":["..."],"dia":"..."} respeitando o orçamento total (custo x pessoas).',
                          js(m.conteudo), 60)
        bus.enviar("planejador", "supervisor", "plano", plano)


async def executor(bus: Barramento) -> None:
    while True:
        m = await bus.receber("executor")
        if m.tipo == "encerrar":
            return
        plano, req = m.conteudo["plano"], m.conteudo["requisitos"]
        passos = [{"acao": "cotar", "itens": plano["itens"]}, {"acao": "reservar_sala", "dia": plano["dia"]},
                  {"acao": "enviar_convite", "pessoas": req["pessoas"]}]
        if any(p["acao"] not in ACOES for p in passos):
            bus.enviar("executor", "supervisor", "falha", {"motivo": "ação fora da allowlist"})
            continue
        desconhecidos = [i for i in plano["itens"] if i not in PRECOS]
        total = num(sum(PRECOS.get(i, 0) for i in plano["itens"]) * req["pessoas"])
        if desconhecidos or total > req["orcamento"]:
            motivo = (f"itens desconhecidos: {','.join(desconhecidos)}" if desconhecidos
                      else f"custo R$ {total} > orçamento R$ {req['orcamento']}")
            bus.enviar("executor", "supervisor", "falha", {"motivo": motivo, "total": total})
            continue

        # Ações independentes rodam em paralelo (latência simulada de serviços externos).
        async def atraso(s: float, r: str) -> str:
            await asyncio.sleep(s)
            return r

        feitos = await asyncio.gather(atraso(0.3, f"cotação ok: R$ {total}"), atraso(0.2, f"sala reservada: {plano['dia']}"),
                                      atraso(0.1, f"{req['pessoas']} convites enviados"))
        bus.enviar("executor", "supervisor", "concluido", {"total": total, "feitos": list(feitos)})


async def supervisor(bus: Barramento, pedido: str) -> dict:
    """Supervisor: decide quem trabalha a seguir com base no TIPO da última mensagem (roteamento)."""
    bus.enviar("supervisor", "analista", "pedido", pedido)
    requisitos: dict = {}
    plano: dict = {}
    while True:
        m = await bus.receber("supervisor")
        if m.tipo == "requisitos":
            requisitos = m.conteudo
            bus.enviar("supervisor", "planejador", "planejar", requisitos)
        elif m.tipo == "plano":
            plano = m.conteudo
            bus.enviar("supervisor", "executor", "executar", {"plano": plano, "requisitos": requisitos})
        elif m.tipo == "falha" and "feedback" not in requisitos:
            # Delegação com feedback: devolve ao planejador UMA vez (evita loop infinito entre agentes).
            requisitos = {**requisitos, "feedback": f"plano anterior {js(plano.get('itens'))} falhou: {m.conteudo['motivo']}. Corte itens."}
            bus.enviar("supervisor", "planejador", "replanejar", requisitos)
        else:
            bus.enviar("supervisor", "executor", "encerrar", None)
            bus.enviar("supervisor", "planejador", "encerrar", None)
            return {"status": m.tipo, "plano": plano, "requisitos": requisitos, "resultado": m.conteudo}
