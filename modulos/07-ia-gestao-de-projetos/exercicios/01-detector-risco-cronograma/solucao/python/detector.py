"""Detector de risco de cronograma: anomalia estatística + tendência + regras -> riscos com mitigação.

Tudo determinístico. Um LLM poderia, no máximo, redigir o e-mail com os riscos que este código achou.
"""
import statistics

from comum_py.js import js_round, to_fixed


def z_robusto(valor: float, base: list[float]) -> float:
    """z-score ROBUSTO (mediana e MAD): um sprint ruim no passado não "contamina" a régua como faria a média/desvio."""
    med = statistics.median(base)
    mad = statistics.median([abs(x - med) for x in base]) or 1  # MAD 0 (série constante) vira 1 para não dividir por zero
    return (0.6745 * (valor - med)) / mad


def inclinacao(ys: list[float]) -> float:
    """Inclinação da reta (mínimos quadrados): tendência das últimas N sprints."""
    n = len(ys)
    xm, ym = (n - 1) / 2, sum(ys) / n
    num = sum((x - xm) * (y - ym) for x, y in enumerate(ys))
    den = sum((x - xm) ** 2 for x in range(n))
    return num / den


# Base de conhecimento de mitigação (heurísticas do PMO). Em produção: histórico de lições aprendidas.
MITIGACOES = {
    "escopo": "Congelar escopo da sprint; mudanças entram só pelo PO via change request priorizado.",
    "cronograma": "Replanejar com previsão Monte Carlo (P85) e negociar corte de escopo ou nova data.",
    "recursos": "Limitar horas extras, redistribuir carga e checar dependência de uma única pessoa.",
    "qualidade": "Reservar capacidade para bugs (ex.: 20%) e reforçar testes automatizados no caminho crítico.",
    "bloqueio": "Escalar impedimentos diários e mapear dependências externas com dono e data.",
}

METRICAS = {"entregue": "cronograma", "escopoAdicionado": "escopo", "horasExtras": "recursos", "bugsNovos": "qualidade", "diasBloqueados": "bloqueio"}


def detectar_riscos(historico: list[dict], janela: int = 4, limiar_z: float = 3.5) -> list[dict]:
    atual, passado = historico[-1], historico[:-1]
    riscos: list[tuple[str, str, str]] = []

    # 1) Anomalias da última sprint contra o histórico (|z| >= 3.5 é o corte clássico de Iglewicz-Hoaglin).
    for campo, tipo in METRICAS.items():
        z = z_robusto(atual[campo], [s[campo] for s in passado])
        if abs(z) >= limiar_z:
            riscos.append((tipo, "alta", f"{campo}={atual[campo]} é anômalo (z robusto {to_fixed(z, 1)})"))

    # 2) Tendência: queda contínua de entrega nas últimas sprints mesmo sem anomalia pontual.
    tend = inclinacao([s["entregue"] / s["planejado"] for s in historico[-janela:]])
    if tend < -0.03:
        riscos.append(("cronograma", "media", f"taxa de entrega caindo {to_fixed(tend * 100, 1)} p.p./sprint nas últimas {janela}"))

    # 3) Regra de negócio: escopo adicionado > 20% do planejado = scope creep.
    creep = atual["escopoAdicionado"] / atual["planejado"]
    if creep > 0.2:
        riscos.append(("escopo", "media", f"escopo adicionado = {js_round(creep * 100)}% do planejado (limite 20%)"))

    # Deduplica por tipo, mantendo a maior severidade e juntando as evidências (dict preserva a ordem de inserção).
    por_tipo: dict[str, dict] = {}
    for tipo, sev, evid in riscos:
        if tipo not in por_tipo:
            por_tipo[tipo] = {"tipo": tipo, "severidade": sev, "evidencia": [evid], "mitigacao": MITIGACOES[tipo]}
        else:
            por_tipo[tipo]["evidencia"].append(evid)
            if sev == "alta":
                por_tipo[tipo]["severidade"] = "alta"
    # "alta" primeiro; sorted é estável, então a ordem de detecção se mantém dentro de cada severidade.
    return sorted(por_tipo.values(), key=lambda r: r["severidade"] != "alta")
