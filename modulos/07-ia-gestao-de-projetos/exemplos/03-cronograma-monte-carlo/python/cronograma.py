"""Cronograma determinístico: ordenação topológica, CPM (caminho crítico), carga por pessoa e Monte Carlo.

Porte fiel do cronograma.js: o MESMO gerador mulberry32 e a MESMA ordem de sorteios, então P50/P85/P95
saem idênticos aos do JS com a mesma semente.
"""
import math
from collections import deque
from datetime import date, timedelta


def ordem_topologica(tarefas: list[dict]) -> list[str]:
    """Ordem topológica (Kahn). Ciclo de dependência = erro de planejamento, não deixa passar."""
    grau = {t["id"]: len(t["dependeDe"]) for t in tarefas}
    fila = deque(t["id"] for t in tarefas if not t["dependeDe"])
    ordem = []
    while fila:
        id_ = fila.popleft()
        ordem.append(id_)
        for t in tarefas:
            if id_ in t["dependeDe"]:
                grau[t["id"]] -= 1
                if grau[t["id"]] == 0:
                    fila.append(t["id"])
    if len(ordem) != len(tarefas):
        raise ValueError("Ciclo de dependências detectado")
    return ordem


def cpm(tarefas: list[dict], duracao=lambda t: t["provavel"]) -> dict:
    """CPM: ES/EF na ida, LS/LF na volta; folga = LS - ES; folga zero = caminho crítico.

    `duracao` é uma função para reaproveitar o mesmo CPM com durações sorteadas no Monte Carlo.
    """
    por_id = {t["id"]: t for t in tarefas}
    ordem = ordem_topologica(tarefas)
    r: dict[str, dict] = {}
    for id_ in ordem:
        t = por_id[id_]
        es = max([0, *(r[d]["ef"] for d in t["dependeDe"])])
        r[id_] = {"es": es, "ef": es + duracao(t)}
    fim = max(x["ef"] for x in r.values())
    for id_ in reversed(ordem):
        sucessores = [t for t in tarefas if id_ in t["dependeDe"]]
        lf = min([fim, *(r[s["id"]]["ls"] for s in sucessores)])
        r[id_]["lf"] = lf
        r[id_]["ls"] = lf - (r[id_]["ef"] - r[id_]["es"])
        r[id_]["folga"] = r[id_]["ls"] - r[id_]["es"]
    return {"fim": fim, "tarefas": r, "critico": [i for i in ordem if r[i]["folga"] == 0]}


def em_dias_corridos(tarefas: list[dict], pessoas: dict[str, float]) -> list[dict]:
    """Estimativas são em dias de ESFORÇO; quem trabalha meio período leva o dobro em dias de CALENDÁRIO."""
    out = []
    for t in tarefas:
        cap = pessoas[t["dono"]]
        out.append({**t, "otimista": t["otimista"] / cap, "provavel": t["provavel"] / cap, "pessimista": t["pessimista"] / cap})
    return out


def carga_por_pessoa(tarefas_corridas: list[dict]) -> dict[str, float]:
    """Carga em dias de calendário. Se passa do fim do projeto, a pessoa é gargalo (balancear)."""
    carga: dict[str, float] = {}
    for t in tarefas_corridas:
        carga[t["dono"]] = carga.get(t["dono"], 0) + t["provavel"]
    return carga


def _i32(x: int) -> int:
    """Interpreta os 32 bits baixos como inteiro COM sinal (o `| 0` do JS)."""
    x &= 0xFFFFFFFF
    return x - 0x1_0000_0000 if x & 0x8000_0000 else x


def _imul(a: int, b: int) -> int:
    """Math.imul: multiplicação inteira de 32 bits com overflow, resultado com sinal."""
    return _i32((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF))


def mulberry32(seed: int):
    """Gerador pseudoaleatório com semente, bit a bit igual ao do JS (mesma sequência de números).

    Python tem inteiros de precisão arbitrária: toda operação precisa ser recortada em 32 bits
    (`& 0xFFFFFFFF`), e `>>>` (shift sem sinal) vira `(x & 0xFFFFFFFF) >> n`.
    """
    estado = _i32(seed)

    def rand() -> float:
        nonlocal estado
        estado = _i32(estado + 0x6D2B79F5)
        s = estado
        t = _imul(s ^ ((s & 0xFFFFFFFF) >> 15), 1 | s)
        t = _i32(_i32(t + _imul(t ^ ((t & 0xFFFFFFFF) >> 7), 61 | t)) ^ t)
        return ((t ^ ((t & 0xFFFFFFFF) >> 14)) & 0xFFFFFFFF) / 4294967296

    return rand


def triangular(rand, a: float, m: float, b: float) -> float:
    """Amostra de uma distribuição triangular (otimista, provável, pessimista) por inversão da CDF."""
    u = rand()
    c = (m - a) / (b - a)
    return a + math.sqrt(u * (b - a) * (m - a)) if u < c else b - math.sqrt((1 - u) * (b - a) * (b - m))


def percentil(ordenado: list, p: float):
    return ordenado[min(len(ordenado) - 1, math.ceil((p / 100) * len(ordenado)) - 1)]


def monte_carlo_duracao(tarefas: list[dict], n: int = 10_000, seed: int = 42) -> dict:
    """Monte Carlo de DURAÇÃO: sorteia cada tarefa e roda o CPM N vezes."""
    rand = mulberry32(seed)
    fins = []
    vezes_critica = {t["id"]: 0 for t in tarefas}
    for _ in range(n):
        r = cpm(tarefas, lambda t: triangular(rand, t["otimista"], t["provavel"], t["pessimista"]))
        fins.append(r["fim"])
        for id_ in r["critico"]:
            vezes_critica[id_] += 1
    fins.sort()
    return {"p50": percentil(fins, 50), "p85": percentil(fins, 85), "p95": percentil(fins, 95), "vezesCritica": vezes_critica}


def monte_carlo_throughput(historico: list[int], restantes: int, n: int = 10_000, seed: int = 7) -> dict:
    """Monte Carlo de THROUGHPUT (#NoEstimates): sorteia semanas do histórico até zerar o backlog."""
    rand = mulberry32(seed)
    semanas = []
    for _ in range(n):
        falta, s = restantes, 0
        while falta > 0:
            falta -= historico[math.floor(rand() * len(historico))]
            s += 1
        semanas.append(s)
    semanas.sort()
    return {"p50": percentil(semanas, 50), "p85": percentil(semanas, 85), "p95": percentil(semanas, 95)}


def somar_dias_uteis(inicio_iso: str, dias: float) -> str:
    """Converte dias úteis a partir da data de início (pula sábado e domingo)."""
    d = date.fromisoformat(inicio_iso)
    falta = math.ceil(dias)
    while falta > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:  # 0=segunda ... 4=sexta
            falta -= 1
    return d.isoformat()
