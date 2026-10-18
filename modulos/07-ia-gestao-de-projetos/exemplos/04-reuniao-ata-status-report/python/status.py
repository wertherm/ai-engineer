"""Status report: métricas e semáforo calculados em código; o LLM só adapta o texto ao público."""
import re

from comum_py.js import js_round, num, to_fixed


def metricas_sprint(s: dict) -> dict:
    tempo_decorrido = (s["diasTotais"] - s["diasRestantes"]) / s["diasTotais"]  # 0.7
    entrega = s["pontosEntregues"] / s["pontosPlanejados"]
    cpi = (s["orcamentoPrevisto"] * (s["percentualEscopoConcluido"] / 100)) / s["orcamentoGasto"]  # valor agregado / custo real
    # Semáforo por regra explícita: entrega atrás do tempo, bug crítico ou item bloqueado puxam para amarelo/vermelho.
    semaforo = "verde"
    if entrega < tempo_decorrido - 0.05 or s["bugsCriticos"] > 0 or s["itensBloqueados"]:
        semaforo = "amarelo"
    if entrega < tempo_decorrido - 0.25 or cpi < 0.8:
        semaforo = "vermelho"
    return {
        "entregaPct": js_round(entrega * 100),
        "tempoPct": js_round(tempo_decorrido * 100),
        "cpi": num(float(to_fixed(cpi, 2))),  # +cpi.toFixed(2) do JS (0.875 -> 0.88, não 0.87 do round() do Python)
        "semaforo": semaforo,
    }


PUBLICOS = {
    "tecnico": "time de desenvolvimento: cite bugs, bloqueios e dependências técnicas; pode usar jargão",
    "gestor": "gerente de projeto: foque em prazo, riscos, próximos passos e quem faz o quê",
    "diretoria": "diretoria: 2 frases, impacto no negócio e se precisa de decisão; sem jargão técnico",
}


def numeros_sem_lastro(texto: str, fatos_json: str) -> list[float]:
    """Checagem barata de alucinação numérica: todo número do texto precisa existir nos fatos.

    Não pega número por extenso ("três dias"), mas pega "atraso de 5 dias" inventado.
    """
    fatos = {float(n) for n in re.findall(r"\d+(?:\.\d+)?", fatos_json)}
    do_texto = [float(n.replace(",", ".")) for n in re.findall(r"\d+(?:[.,]\d+)?", texto)]
    return [num(n) for n in dict.fromkeys(n for n in do_texto if n not in fatos)]
