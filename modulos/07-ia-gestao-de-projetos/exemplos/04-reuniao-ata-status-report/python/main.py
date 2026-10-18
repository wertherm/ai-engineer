"""Reunião turbinada: transcrição -> ata (decisões, pendências, ações) -> .ics -> status report para 3 públicos.

Uso (da pasta do módulo): uv run python exemplos/04-reuniao-ata-status-report/python/main.py
"""
import json
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[2]))  # raiz do módulo, para importar comum_py

from ata import calendario, criar_schema_ata, gerar_ics, participantes, validar_ata  # noqa: E402
from comum_py.llm import extrair_json, gerar_texto  # noqa: E402
from status import PUBLICOS, metricas_sprint, numeros_sem_lastro  # noqa: E402

transcricao = (AQUI.parent / "transcricao.txt").read_text(encoding="utf-8")  # mesmos dados do JS
sprint = json.loads((AQUI.parent / "sprint.json").read_text(encoding="utf-8"))

# 1) Ata: o código descobre participantes e datas possíveis e monta o schema com enums.
nomes = participantes(transcricao)
cal = calendario("2026-11-02")
ata = extrair_json(
    criar_schema_ata(nomes, [c["iso"] for c in cal]),
    system=f"""Extraia a ata da reunião em português. Só registre o que foi dito; ação é o que alguém assumiu fazer.
Calendário: {', '.join(f"{c['iso']}={c['dia']}" for c in cal)}.""",
    user=transcricao,
    max_tokens=500,
).model_dump()
print("Decisões:")
for d in ata["decisoes"]:
    print("  •", d)
print("Pendências:")
for d in ata["pendencias"]:
    print("  •", d)
print("Ações:")
for a in ata["acoes"]:
    print(f"  • [{a['responsavel']}] {a['tarefa']} — {a['prazo']}")

problemas = validar_ata(ata, nomes)
print(f"\nValidação (participantes: {', '.join(nomes)}):", problemas or "ok")
if problemas:
    sys.exit(1)  # nada vai para o calendário com dado inválido

# newline="" mantém o CRLF exigido pela RFC 5545 (sem ele, o Python não mexe no \r\n no Linux, mas no Windows dobraria).
(AQUI / "acoes.ics").write_text(gerar_ics(ata["acoes"]), encoding="utf-8", newline="")
print("Calendário: exemplos/04-reuniao-ata-status-report/python/acoes.ics")

# 2) Status report: números prontos, texto por público.
m = metricas_sprint(sprint)
print(f"\nMétricas (código): entrega {m['entregaPct']}% com {m['tempoPct']}% do tempo · CPI {m['cpi']} · semáforo {m['semaforo'].upper()}")
# Mesmo formato compacto do JSON.stringify do JS (sem espaços, acentos sem escape).
fatos = json.dumps({**sprint, **m, "decisoes": ata["decisoes"], "acoes": ata["acoes"]}, ensure_ascii=False, separators=(",", ":"))

for publico, instrucao in PUBLICOS.items():
    texto = gerar_texto(
        system=f"Escreva um status report curto (máx. 3 frases) em português para o público: {instrucao}. Use só os fatos do JSON.",
        user=fatos,
        max_tokens=140,
    )
    print(f"\n--- {publico.upper()} ---\n{texto}")
    suspeitos = numeros_sem_lastro(texto, fatos)
    if suspeitos:
        print(f"  ⚠ números sem lastro nos fatos: {', '.join(map(str, suspeitos))}")
