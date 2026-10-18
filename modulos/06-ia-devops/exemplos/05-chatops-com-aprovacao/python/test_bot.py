"""Testes dos guardrails que não dependem do cluster nem do LLM: RBAC e validação dos comandos."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bot import BotChatOps, montar_acao  # noqa: E402


def test_guardrails_de_comando():
    assert montar_acao("scale", ["web", "50"]) == {"erro": "réplicas devem ser 0..6 (guardrail)"}
    assert montar_acao("deploy", ["web", "nginx:latest"]) == {"erro": "imagem precisa de tag explícita (sem :latest)"}
    assert montar_acao("scale", ["web; rm -rf /", "1"]) == {"erro": "alvo inválido"}
    assert montar_acao("scale", ["web", "3"])["argv"][-1] == "--replicas=3"


def test_rbac_nega_e_audita():
    trilha = []
    bot = BotChatOps({"ana": "viewer"}, trilha.append)
    assert bot.receber("ana", "/scale web 3") == '⛔ RBAC: papel "viewer" não pode usar /scale'
    assert bot.receber("zeca", "/investigar web") == "⛔ usuário sem papel no RBAC"
    assert [r["decisao"] for r in trilha] == ["negado", "negado"]
