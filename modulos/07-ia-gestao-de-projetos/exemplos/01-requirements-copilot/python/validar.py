"""Regras determinísticas de qualidade (o "lint" do backlog). Não dependem do LLM.

Recebe um dict (o model_dump() do pydantic ou um JSON lido do disco), igual ao validar.js.
"""
import re


def auditar_requisitos(req: dict) -> dict:
    problemas: list[str] = []
    ids: set[str] = set()
    for ep in req["epicos"]:
        if not ep["historias"]:
            problemas.append(f"{ep['id']}: épico sem histórias")
        for h in ep["historias"]:
            if h["id"] in ids:
                problemas.append(f"{h['id']}: id duplicado")
            ids.add(h["id"])
            if len(h["criterios"]) < 2:
                problemas.append(f"{h['id']}: menos de 2 critérios de aceite")
            sem_gwt = [c for c in h["criterios"] if not re.search("dado", c, re.I) or not re.search("ent[ãa]o", c, re.I)]
            if sem_gwt:
                problemas.append(f"{h['id']}: {len(sem_gwt)} critério(s) fora do formato Dado/Quando/Então")
            if not h["tarefas"]:
                problemas.append(f"{h['id']}: sem decomposição em tarefas")
    # Rastreabilidade: toda mudança precisa apontar para histórias que existem.
    for m in req["mudancas"]:
        orfas = [i for i in m["afeta"] if i not in ids]
        if orfas:
            problemas.append(f'mudança "{m["descricao"][:40]}..." aponta para ids inexistentes: {", ".join(orfas)}')
    return {"historias": len(ids), "problemas": problemas}
