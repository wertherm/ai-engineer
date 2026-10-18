"""Regras determinísticas do bot: o que precisa de aprovação e quais lembretes disparar.

O LLM nunca decide se algo está aprovado.
"""
from datetime import datetime

from comum_py.js import js_round


def precisa_aprovacao(op: dict) -> str | None:
    if op["acao"] == "arquivar":
        return "arquivar card é irreversível para o time"
    # Prioridade só vale para criar/priorizar; num 'mover' o campo é ignorado (o LLM às vezes preenche à toa).
    if op["acao"] in ("criar", "priorizar") and op["prioridade"] == "alta":
        return "prioridade alta fura a fila da sprint"
    return None


def lembretes(cards: list[dict], listas: list[dict], agora: datetime) -> list[str]:
    """Card com prazo nas próximas 48h e sem responsável, ou já vencido e fora de "Feito"."""
    feito = next((l["id"] for l in listas if l["name"] == "Feito"), None)
    avisos = []
    for c in cards:
        if not c.get("due") or c["idList"] == feito:
            continue
        horas = (datetime.fromisoformat(c["due"]) - agora).total_seconds() / 3600
        if horas < 0:
            avisos.append(f'🔴 "{c["name"]}" venceu há {js_round(-horas)}h')
        elif horas <= 48 and not c["idMembers"]:
            avisos.append(f'🟡 "{c["name"]}" vence em {js_round(horas)}h e está sem responsável')
    return avisos


def mensagem_slack(canal: str, avisos: list[str]) -> dict:
    """Payload no formato do Slack (Block Kit). Aqui só é impresso; ver integracoes_reais.py para enviar."""
    return {
        "channel": canal,
        "text": f"{len(avisos)} lembrete(s) do board",
        "blocks": [{"type": "section", "text": {"type": "mrkdwn", "text": "\n".join(avisos)}}],
    }
