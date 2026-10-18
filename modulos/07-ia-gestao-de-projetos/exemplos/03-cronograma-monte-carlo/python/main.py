"""Cronograma dinâmico + previsão probabilística. Sem LLM: aqui a IA "de verdade" é estatística.

Uso (da pasta do módulo): uv run python exemplos/03-cronograma-monte-carlo/python/main.py
"""
import json
import math
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[2]))  # raiz do módulo, para importar comum_py

from comum_py.js import js_round, num, to_fixed  # noqa: E402
from comum_py.tabela import imprimir_tabela  # noqa: E402
from cronograma import (  # noqa: E402
    carga_por_pessoa, cpm, em_dias_corridos, monte_carlo_duracao, monte_carlo_throughput, somar_dias_uteis,
)

p = json.loads((AQUI.parent / "projeto.json").read_text(encoding="utf-8"))  # o MESMO projeto do JS

# Converte esforço em dias de calendário pela capacidade de cada pessoa (carla = 0.5).
tarefas = em_dias_corridos(p["tarefas"], p["pessoas"])
base = cpm(tarefas)
print("== CPM com duração provável (dias úteis) ==")
imprimir_tabela([{"tarefa": k, "ES": num(r["es"]), "EF": num(r["ef"]), "folga": num(r["folga"])} for k, r in base["tarefas"].items()])
print(f"Caminho crítico: {' → '.join(base['critico'])} | fim em {num(base['fim'])} dias ({somar_dias_uteis(p['inicio'], base['fim'])})")

carga = carga_por_pessoa(tarefas)
print("\nCarga em dias de calendário:", " · ".join(f"{k}={num(v)}{' (GARGALO)' if v > base['fim'] else ''}" for k, v in carga.items()))

mc = monte_carlo_duracao(tarefas)
print("\n== Monte Carlo (10.000 cenários, durações triangulares) ==")
print(f"P50={to_fixed(mc['p50'], 1)}d ({somar_dias_uteis(p['inicio'], mc['p50'])}) · "
      f"P85={to_fixed(mc['p85'], 1)}d ({somar_dias_uteis(p['inicio'], mc['p85'])}) · P95={to_fixed(mc['p95'], 1)}d")
print("% de cenários em que a tarefa foi crítica:", " ".join(f"{k}={js_round(v / 100)}%" for k, v in mc["vezesCritica"].items()))
# Para conferir bit a bit com o JS (que imprime com 1 casa): os percentis completos.
print(f"(percentis exatos: P50={mc['p50']!r} P85={mc['p85']!r} P95={mc['p95']!r})")

# What-if 1: tirar a dependência T1→T4 (ex.: mockar a API de juros) encurta o projeto?
sem_dep = [{**t, "dependeDe": ["T2"]} if t["id"] == "T4" else t for t in tarefas]
mc2 = monte_carlo_duracao(sem_dep)
print(f'\nWhat-if "T4 não depende de T1": P85 {to_fixed(mc["p85"], 1)}d → {to_fixed(mc2["p85"], 1)}d '
      "(T4 quase nunca é crítica: mexer nela não adianta)")

# What-if 2 (balanceamento de capacidade): carla vai para tempo integral (0.5 → 1.0).
mc3 = monte_carlo_duracao(em_dias_corridos(p["tarefas"], {**p["pessoas"], "carla": 1.0}))
print(f'What-if "carla em tempo integral": P85 {to_fixed(mc["p85"], 1)}d → {to_fixed(mc3["p85"], 1)}d')

hist, restantes = p["throughputSemanalHistorico"], p["itensRestantesNoBacklog"]
tp = monte_carlo_throughput(hist, restantes)
print(f"\n== Backlog de {restantes} itens pelo throughput histórico ==")
print(f"P50={tp['p50']} semanas · P85={tp['p85']} semanas · P95={tp['p95']} semanas")
# Ajuste automático por previsão de carga: se a previsão estoura a data-alvo, o que cortar?
semanas_alvo = 5
media = sum(hist) / len(hist)
if tp["p85"] > semanas_alvo:
    cabe = math.floor(media * semanas_alvo * 0.85)  # margem de 15% por conservadorismo
    print(f"Alvo {semanas_alvo} semanas estoura no P85: sugerido cortar o escopo para ~{cabe} itens (média {to_fixed(media, 1)}/semana).")
