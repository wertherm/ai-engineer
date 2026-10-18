"""Funções puras de priorização: RICE, WSJF, MoSCoW, roadmap por capacidade e alinhamento a OKRs.

Tudo aqui é determinístico e testável; o LLM nunca calcula score. Os itens são os dicts do backlog.json
(mesmas chaves camelCase do JS, para os dois lados lerem o MESMO arquivo).
"""
import math

from comum_py.js import js_round


def rice(i: dict) -> float:
    """RICE = (Reach × Impact × Confidence) / Effort (Intercom). Mesma ordem de operações do JS."""
    return (i["reach"] * i["impact"] * i["confidence"]) / i["effort"]


def wsjf(i: dict) -> float:
    """WSJF = Cost of Delay / Job Size, com CoD = valor de negócio + criticidade no tempo + redução de risco (SAFe)."""
    return (i["businessValue"] + i["timeCriticality"] + i["riskReduction"]) / i["jobSize"]


def moscow(itens: list[dict]) -> dict[str, str]:
    """MoSCoW por regra explícita (auditável), não por "feeling".

    Must = regulatório ou pré-requisito de um Must; Should = top 50% em WSJF; Could = resto com OKR; Won't = sem OKR.
    """
    ordenados = sorted(itens, key=wsjf, reverse=True)  # sorted é estável, como o Array.sort do JS
    metade = math.ceil(len(ordenados) / 2)
    classe: dict[str, str] = {i["id"]: "Must" for i in itens if i.get("regulatorio")}
    # Propaga Must para dependências (não dá para entregar um Must sem o que ele precisa).
    mudou = True
    while mudou:
        mudou = False
        for i in itens:
            if classe.get(i["id"]) == "Must":
                for d in i["dependeDe"]:
                    if classe.get(d) != "Must":
                        classe[d] = "Must"
                        mudou = True
    for pos, i in enumerate(ordenados):
        if i["id"] in classe:
            continue
        classe[i["id"]] = "Won't" if not i.get("kr") else ("Should" if pos < metade else "Could")
    return classe


def roadmap(itens: list[dict], capacidade: int, classes: dict[str, str]) -> list[list[str]]:
    """Roadmap guloso: ordem MoSCoW > WSJF, respeitando dependências e capacidade (jobSize) por sprint."""
    peso = {"Must": 0, "Should": 1, "Could": 2, "Won't": 9}
    fila = sorted((i for i in itens if classes[i["id"]] != "Won't"), key=lambda i: (peso[classes[i["id"]]], -wsjf(i)))
    sprints: list[list[str]] = []
    feito: dict[str, int] = {}  # id -> sprint em que termina
    while fila:
        n = len(sprints) + 1
        livre = capacidade
        sprint = []
        for i in list(fila):
            # Dependência precisa ter terminado em sprint ANTERIOR.
            deps_ok = all(d in feito and feito[d] < n for d in i["dependeDe"])
            if deps_ok and i["jobSize"] <= livre:
                sprint.append(i["id"])
                livre -= i["jobSize"]
                fila.remove(i)
        if not sprint:
            raise ValueError(f"Item maior que a capacidade ou dependência impossível: {[i['id'] for i in fila]}")
        for id_ in sprint:
            feito[id_] = n
        sprints.append(sprint)
    return sprints


def alinhamento_okr(okrs: list[dict], itens: list[dict]) -> dict:
    """Quanto do esforço vai para cada KR e quais KRs estão sem iniciativa."""
    total = sum(i["jobSize"] for i in itens)
    krs = [k["id"] for o in okrs for k in o["krs"]]
    por_kr = []
    for kr in krs:
        do_kr = [i for i in itens if i.get("kr") == kr]
        por_kr.append({
            "kr": kr,
            "itens": [i["id"] for i in do_kr],
            "esforcoPct": js_round(100 * sum(i["jobSize"] for i in do_kr) / total),
        })
    return {
        "porKr": por_kr,
        "krsSemIniciativa": [k["kr"] for k in por_kr if not k["itens"]],
        "itensSemKr": [i["id"] for i in itens if not i.get("kr")],
    }
