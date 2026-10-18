"""Lê o corpus de demonstração: app/dados/<tenant>/*.md (o MESMO corpus da versão JS)."""

from pathlib import Path

PASTA_DADOS = Path(__file__).resolve().parent.parent / "app" / "dados"


def ler_documentos(tenant_id: str, pasta: Path = PASTA_DADOS) -> list[dict]:
    arquivos = sorted(p for p in (pasta / tenant_id).iterdir() if p.suffix == ".md")
    return [{"fonte": p.name, "texto": p.read_text(encoding="utf-8")} for p in arquivos]
