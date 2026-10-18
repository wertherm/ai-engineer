"""Reunião -> ata estruturada. O LLM extrai; o código valida responsáveis/datas e gera o .ics."""
import re
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, Field, create_model


def criar_schema_ata(nomes: list[str], datas: list[str]) -> type[BaseModel]:
    """O schema é montado pelo CÓDIGO a partir da reunião: responsável e prazo viram enums.

    Assim o decoding restrito do servidor só deixa o LLM escolher um participante real e uma data válida.
    `Literal[tuple(...)]` gera um `enum` no JSON Schema (o equivalente ao z.enum(nomes) do JS).
    """
    Acao = create_model(
        "Acao",
        responsavel=(Literal[tuple(nomes)], ...),
        tarefa=(str, ...),
        prazo=(Literal[tuple([*datas, "sem prazo"])], ...),
    )
    return create_model(
        "Ata",
        decisoes=(list[str], ...),
        pendencias=(list[str], Field(description="dúvidas ou bloqueios ainda sem resposta")),
        acoes=(list[Acao], ...),
    )


NOMES_DIA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]  # date.weekday(): 0 = segunda


def calendario(inicio_iso: str, dias: int = 14) -> list[dict]:
    """Próximos N dias corridos a partir da reunião, com o dia da semana para o LLM resolver "quarta, dia 4"."""
    d0 = date.fromisoformat(inicio_iso)
    return [{"iso": (d := d0 + timedelta(days=i)).isoformat(), "dia": NOMES_DIA[d.weekday()]} for i in range(dias)]


def participantes(transcricao: str) -> list[str]:
    """Participantes vêm da própria transcrição (código), não do LLM. Ordem de primeira aparição, sem repetição.

    `[^\\W\\d_]+` = só letras Unicode (o `\\p{L}+` do JS; o `re` do Python não tem \\p{L}).
    """
    return list(dict.fromkeys(re.findall(r"^\[[\d:]+\] ([^\W\d_]+)", transcricao, re.M)))


def validar_ata(ata: dict, nomes: list[str]) -> list[str]:
    """Segunda linha de defesa: se trocar para um provedor sem decoding restrito, o enum pode não ser respeitado."""
    problemas = []
    for a in ata["acoes"]:
        if a["responsavel"] not in nomes:
            problemas.append(f'responsável "{a["responsavel"]}" não estava na reunião')
        if a["prazo"] != "sem prazo" and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", a["prazo"]):
            problemas.append(f"prazo inválido: {a['prazo']}")
    if not ata["acoes"]:
        problemas.append("reunião sem nenhuma ação: confira a extração")
    return problemas


def gerar_ics(acoes: list[dict], agora: datetime | None = None) -> str:
    """Integração com calendário: um VTODO por ação (RFC 5545). Importável no Google Calendar/Outlook/Thunderbird."""
    stamp = (agora or datetime.now(UTC)).astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")
    todos = [
        "\r\n".join([
            "BEGIN:VTODO",
            f"UID:acao-{i}-{stamp}@modulo07",
            f"DTSTAMP:{stamp}",
            f"DUE;VALUE=DATE:{a['prazo'].replace('-', '')}",
            f"SUMMARY:{re.sub(r'[,;]', ' ', a['tarefa'])}",
            f"DESCRIPTION:Responsável: {a['responsavel']}",
            "END:VTODO",
        ])
        for i, a in enumerate((a for a in acoes if a["prazo"] != "sem prazo"), 1)
    ]
    return "\r\n".join(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//modulo07//ata//PT", *todos, "END:VCALENDAR"]) + "\r\n"
