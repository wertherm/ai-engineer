"""Exemplo 02 (Python) · Single-agent em fluxo linear: Reactive × Memory-Enhanced, com USUÁRIO SIMULADO.

Simular o usuário com um roteiro fixo transforma "conversa" em teste reproduzível: mesmas falas, arquiteturas
diferentes, métricas comparáveis (acerto, tokens, latência).
"""

import re

from comum_py.llm import chat, fixo

ROTEIRO = [
    "Oi, sou a Ana e tenho uma padaria em Recife.",
    "Vendo muito parcelado no cartão. Antecipar recebíveis faz sentido?",
    "Lembra meu nome e meu tipo de negócio?",
]


def lembrou(resposta: str) -> bool:
    """Critério de acerto do último turno (o que exige memória)."""
    return bool(re.search("ana", resposta, re.I) and re.search("padaria", resposta, re.I))


SISTEMA = "Você é um assistente de uma fintech. Responda em português, em no máximo 2 frases."


def reactive(fala: str) -> dict:
    """Padrão Reactive: estímulo -> resposta. Sem estado: barato, rápido, previsível, e esquece tudo."""
    return chat([{"role": "system", "content": SISTEMA}, {"role": "user", "content": fala}], max_tokens=50)


def criar_memory_enhanced():
    """Padrão Memory-Enhanced: guarda FATOS extraídos (não o histórico inteiro) e injeta no prompt.
    A extração é uma regra simples; em produção pode ser um LLM barato ou um extrator estruturado."""
    fatos: dict[str, str] = {}

    def agente(fala: str) -> dict:
        # O re do Python não tem \p{Lu}/\p{Ll}: [^\W\d_] = "letra Unicode", e a caixa conferimos com isupper/islower.
        m_nome = re.search(r"sou (?:a|o) ([^\W\d_]+)", fala)
        m_neg = re.search(r"tenho uma? ([^\W\d_]+)", fala)
        if m_nome and m_nome[1][0].isupper() and m_nome[1][1:].islower():
            fatos["nome"] = m_nome[1]
        if m_neg and m_neg[1].islower():
            fatos["negócio"] = m_neg[1]
        memoria = "; ".join(f"{k}: {v}" for k, v in fatos.items()) or "nenhum"
        return chat([{"role": "system", "content": f"{SISTEMA}\nFatos conhecidos do cliente: {memoria}."},
                     {"role": "user", "content": fala}], max_tokens=50)

    return agente


for nome, agente in [("reactive", reactive), ("memory-enhanced", criar_memory_enhanced())]:
    print(f"\n== {nome} ==")
    tokens = ms = 0
    ultima = ""
    for fala in ROTEIRO:
        r = agente(fala)
        tokens += r["usage"].total_tokens
        ms += r["ms"]
        ultima = r["texto"]
        print(f"  usuário: {fala}\n  agente:  {r['texto']}", flush=True)
    print(f"  → lembrou do contexto? {'sim' if lembrou(ultima) else 'não'} · {tokens} tokens · {fixo(ms / 1000, 0)} s")
