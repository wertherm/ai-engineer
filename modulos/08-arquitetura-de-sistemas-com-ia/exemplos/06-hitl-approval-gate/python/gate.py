"""Approval Gate: função PURA que decide o destino de uma ação proposta pelo agente.

Policy-Driven Control: as regras vêm de ../politica.json (a MESMA do JS, versionada), não de if espalhado.
Ordem importa: proibição > ação sensível > valor > confiança. A confiança sozinha nunca libera tudo.
"""

import json
from pathlib import Path

ARQUIVO_POLITICA = Path(__file__).parent.parent / "politica.json"


def carregar_politica() -> dict:
    return json.loads(ARQUIVO_POLITICA.read_text(encoding="utf-8"))


def avaliar(acao: dict, politica: dict) -> tuple[str, str]:
    """Devolve (decisao, motivo) com decisao em automatica | pendente | bloqueada."""
    if acao["tipo"] in politica["acoesProibidas"]:
        return "bloqueada", "ação proibida pela política"
    if acao["tipo"] in politica["acoesSempreHumano"]:
        return "pendente", "ação sensível exige humano"
    if acao.get("valor", 0) > politica["valorMaxAutomatico"]:
        return "pendente", f"valor acima de {politica['valorMaxAutomatico']}"
    if acao["confianca"] < politica["limiarConfianca"]:
        return "pendente", f"confiança {acao['confianca']} < {politica['limiarConfianca']}"
    return "automatica", "dentro da política"
