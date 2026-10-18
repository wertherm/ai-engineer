"""Entrega 1 · protótipo do RAG em linha de comando (versão Python de cli.js): valida a lógica (chunking,
busca, citações, agente) ANTES de existir API ou interface. Ferramenta de operador: escolhe o tenant pelo id.

  uv run python exemplos/01-entrega-1-rag-cli/python/cli.py indexar
  uv run python exemplos/01-entrega-1-rag-cli/python/cli.py buscar acme "limite de alimentação em viagem"
  uv run python exemplos/01-entrega-1-rag-cli/python/cli.py perguntar acme "Posso dividir minhas férias?"
  uv run python exemplos/01-entrega-1-rag-cli/python/cli.py perguntar acme "<pergunta complexa>" --agente
"""

import asyncio
import sys

from app_py.db import criar_pool, migrar
from app_py.llm import criar_llm
from app_py.seed import seed
from app_py.servico import criar_servico


async def main(argv: list[str]) -> int:
    comando = argv[0] if argv else ""
    tenant_id = argv[1] if len(argv) > 1 else ""
    resto = argv[2:]
    agente = "--agente" in resto
    texto = " ".join(r for r in resto if r != "--agente")

    pool = await criar_pool()
    llm = criar_llm()
    servico = criar_servico(pool=pool, llm=llm, log=print)

    async def tenant_por_id(i: str) -> dict:
        async with pool.connection() as c:
            t = await (await c.execute("SELECT id, nome FROM m11.tenants_py WHERE id = %s", [i])).fetchone()
        if not t:
            raise SystemExit(f'tenant "{i}" não existe (rode: ... cli.py indexar)')
        return t

    try:
        await migrar(pool)
        if comando == "indexar":
            await seed(pool, llm)
        elif comando == "buscar":
            tenant = await tenant_por_id(tenant_id)
            trechos = await servico.buscar(tenant, texto, k=3, canal="cli")
            print(f'Tenant: {tenant["nome"]} · consulta: "{texto}"')
            for i, t in enumerate(trechos, 1):
                print(f"  {i}. [{t['fonte']}] sim={t['sim']:.3f} rrf={t['rrf']:.4f} · {t['conteudo'][:90]}...")
        elif comando == "perguntar":
            tenant = await tenant_por_id(tenant_id)
            print(f"Tenant: {tenant['nome']} · modo: {'agente' if agente else 'rag'}\nPergunta: {texto}")
            r = await servico.perguntar(tenant, texto, modo="agente" if agente else "rag", canal="cli")
            print(f"\nResposta: {r['resposta']}")
            for c in r["citacoes"]:
                n = f"[{c['n']}] " if c.get("n") else ""
                trecho = f" · {c['trecho'][:80]}..." if c.get("trecho") else ""
                print(f"  {n}{c['fonte']}{trecho}")
            bloqueio = f" (bloqueio: {r['motivoBloqueio']})" if r.get("motivoBloqueio") else ""
            tokens = f" · {r['tokens']} tokens" if r.get("tokens") else ""
            verif = str(r["verificado"]).lower()
            print(f"verificado={verif}{bloqueio} · cache={str(r['cache']).lower()} · {r['ms'] / 1000:.1f}s{tokens}")
        else:
            print('uso: cli.py indexar | buscar <tenant> "<consulta>" | perguntar <tenant> "<pergunta>" [--agente]')
            return 1
        return 0
    finally:
        await pool.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
