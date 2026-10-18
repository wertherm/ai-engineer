"""Transforma o brag document (../brag.json, o mesmo do JS) num caso de promoção.

Agrupa por eixo do nível-alvo, calcula a variação de cada métrica e aponta eixo sem evidência
(o buraco que o comitê vai achar antes de você).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para achar comum_py
from comum_py.formato import js_str, to_fixed  # noqa: E402

PASTA = Path(__file__).resolve().parent.parent

# Eixos que quase toda matriz de carreira usa (ver docs/02). O texto descreve o que o nível SÊNIOR exige.
EIXOS = {
    "impacto": "resultados mensuráveis para o negócio, não só tarefas entregues",
    "escopo": "resolve problemas ambíguos que atravessam mais de um time/sistema",
    "lideranca": "eleva o time: decisões técnicas, incidentes, mentoria",
    "execucao": "entrega previsível, com qualidade e operação (testes, observabilidade)",
}


def variacao(antes: float, depois: float) -> str:
    if antes == 0:
        return f"0 → {js_str(depois)}"
    pct = (depois - antes) / antes * 100
    # to_fixed imita o toFixed do JS (meio para cima no valor binário exato).
    return f"{js_str(antes)} → {js_str(depois)} ({'+' if pct > 0 else ''}{to_fixed(pct, 0)}%)"


def montar_caso(brag: dict) -> dict:
    linhas = [f"# Caso de promoção · {brag['pessoa']} → {brag['nivelAlvo']}", ""]
    lacunas = []
    for eixo, expectativa in EIXOS.items():
        itens = [e for e in brag["entradas"] if e["eixo"] == eixo]
        linhas.append(f"## {eixo} — {expectativa}")
        if not itens:
            linhas.append("- (sem evidência registrada)")
            lacunas.append(eixo)
        for e in itens:
            linhas.append(f"- {e['data']} · {e['titulo']}: {variacao(e['antes'], e['depois'])} {e['unidade']} · evidência: {e['evidencia']}")
        linhas.append("")
    return {"markdown": "\n".join(linhas), "lacunas": lacunas}


def main() -> None:
    brag = json.loads((PASTA / "brag.json").read_text(encoding="utf-8"))
    caso = montar_caso(brag)
    print(caso["markdown"])
    if caso["lacunas"]:
        print(f"Lacunas para resolver ANTES da conversa: {', '.join(caso['lacunas'])}")
    else:
        print("Todos os eixos têm evidência.")


if __name__ == "__main__":
    main()
