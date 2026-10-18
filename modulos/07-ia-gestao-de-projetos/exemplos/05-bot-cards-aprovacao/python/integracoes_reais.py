"""Integrações com as APIs REAIS (Jira, Slack, Asana, Notion). NÃO EXECUTADO LOCALMENTE: exige contas e tokens.

Cada função lê o token do ambiente e falha cedo se ele não existir (nada de chave no código).
Uso (da pasta do módulo): uv run python exemplos/05-bot-cards-aprovacao/python/integracoes_reais.py jira|slack|asana|notion
"""
import base64
import os
import sys

import httpx


def exigir(nome: str) -> str:
    v = os.environ.get(nome)
    if not v:
        raise RuntimeError(f"defina {nome} no ambiente")
    return v


def post(url: str, headers: dict, corpo: dict) -> dict:
    r = httpx.post(url, headers=headers, json=corpo, timeout=30)
    if r.is_error:
        raise RuntimeError(f"{url}: {r.status_code} {r.text}")
    return r.json()


def criar_issue_jira(resumo: str, descricao: str, projeto: str | None = None, tipo: str = "Task") -> dict:
    """Jira Cloud REST v3: Basic auth com e-mail + API token; description em Atlassian Document Format (ADF)."""
    site = exigir("JIRA_SITE")  # ex.: https://sua-empresa.atlassian.net
    basic = base64.b64encode(f"{exigir('JIRA_EMAIL')}:{exigir('JIRA_API_TOKEN')}".encode()).decode()
    return post(f"{site}/rest/api/3/issue", {"Authorization": f"Basic {basic}"}, {
        "fields": {
            "project": {"key": projeto or os.environ.get("JIRA_PROJECT", "PB")},
            "issuetype": {"name": tipo},
            "summary": resumo,
            "description": {"type": "doc", "version": 1, "content": [{"type": "paragraph", "content": [{"type": "text", "text": descricao}]}]},
        },
    })


def postar_slack(canal: str, texto: str) -> dict:
    """Slack Web API chat.postMessage: Bearer token de bot (xoxb-...). Slack responde 200 com ok:false em erro."""
    r = post("https://slack.com/api/chat.postMessage", {"Authorization": f"Bearer {exigir('SLACK_BOT_TOKEN')}"}, {"channel": canal, "text": texto})
    if not r.get("ok"):
        raise RuntimeError(f"Slack: {r.get('error')}")
    return r


def criar_tarefa_asana(nome: str, vence_em: str) -> dict:
    """Asana: Personal Access Token como Bearer; corpo sempre embrulhado em {"data": ...}."""
    return post("https://app.asana.com/api/1.0/tasks", {"Authorization": f"Bearer {exigir('ASANA_PAT')}"}, {
        "data": {"name": nome, "projects": [exigir("ASANA_PROJECT_GID")], "due_on": vence_em},
    })


def criar_pagina_notion(titulo: str) -> dict:
    """Notion: a partir da versão 2025-09-03 o parent de uma página de banco é o data_source_id."""
    return post("https://api.notion.com/v1/pages", {
        "Authorization": f"Bearer {exigir('NOTION_TOKEN')}",
        "Notion-Version": "2026-03-11",
    }, {
        "parent": {"type": "data_source_id", "data_source_id": exigir("NOTION_DATA_SOURCE_ID")},
        "properties": {"Name": {"title": [{"text": {"content": titulo}}]}},
    })


if __name__ == "__main__":
    acoes = {
        "jira": lambda: criar_issue_jira("Regra dos 60 dias", "Criado pelo bot do módulo 07"),
        "slack": lambda: postar_slack(os.environ.get("SLACK_CANAL", "#portal-boletos"), "Lembrete: homologação vence amanhã"),
        "asana": lambda: criar_tarefa_asana("Subir homologação", "2026-11-04"),
        "notion": lambda: criar_pagina_notion("Ata 2026-11-02"),
    }
    alvo = sys.argv[1] if len(sys.argv) > 1 else None
    if alvo not in acoes:
        print("uso: integracoes_reais.py jira|slack|asana|notion")
        sys.exit(1)
    print(acoes[alvo]())
