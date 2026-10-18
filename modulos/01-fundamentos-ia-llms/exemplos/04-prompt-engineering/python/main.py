"""Exemplo 04 (Python) — Prompt engineering MEDIDO: a mesma tarefa com 3 prompts, comparando saídas reais.

Tarefa: triagem de tickets de suporte -> {"tipo": "bug"|"feature"|"duvida", "urgente": true|false}
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para importar comum_py
from comum_py.llm import chat

# "Gabarito" escrito por um humano: sem isso não existe medir, só achar.
TICKETS = [
    ("Depois da atualização o app fecha sozinho quando clico em pagar. Perdi 3 vendas hoje!", "bug", True),
    ("Seria ótimo exportar o relatório mensal em PDF.", "feature", False),
    ("Como faço para trocar o e-mail da minha conta?", "duvida", False),
    ("O botão de salvar perfil não responde no Firefox.", "bug", False),
]

SISTEMA = (
    "Você faz triagem de tickets de suporte. Responda APENAS um JSON numa linha: "
    '{"tipo":"bug"|"feature"|"duvida","urgente":true|false}. '
    "urgente=true só se houver perda de dinheiro, dados ou bloqueio total."
)

PROMPTS = {
    # A) Vago: sem papel, sem formato, sem critérios. O modelo "conversa" em vez de classificar.
    "A-vago": lambda t: [{"role": "user", "content": f"O que você acha deste ticket? {t}"}],
    # B) Instrução clara: papel + rótulos permitidos + critério de urgência + formato de saída.
    "B-instrucao": lambda t: [{"role": "system", "content": SISTEMA}, {"role": "user", "content": t}],
    # C) Few-shot: mesma instrução + 2 exemplos resolvidos (o modelo imita o padrão).
    "C-few-shot": lambda t: [
        {"role": "system", "content": SISTEMA},
        {"role": "user", "content": "Não consigo logar, dá erro 500 e a loja inteira está parada."},
        {"role": "assistant", "content": '{"tipo":"bug","urgente":true}'},
        {"role": "user", "content": "Vocês têm integração com o Slack?"},
        {"role": "assistant", "content": '{"tipo":"duvida","urgente":false}'},
        {"role": "user", "content": t},
    ],
}


def parse(texto: str) -> dict | None:
    """Extrai o 1º objeto JSON da resposta (modelos às vezes embrulham em ```json ... ```)."""
    m = re.search(r"\{.*?\}", texto, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


resumo = []
for nome, montar in PROMPTS.items():
    validos = acertos = tok_in = tok_out = 0
    ms = 0.0
    print(f"\n=== Prompt {nome} ===")
    for texto, tipo, urgente in TICKETS:
        r = chat(montar(texto), max_tokens=40)
        j = parse(r.texto)
        ok = bool(j) and j.get("tipo") == tipo and j.get("urgente") == urgente
        validos += j is not None
        acertos += ok
        tok_in += r.prompt_tokens
        tok_out += r.completion_tokens
        ms += r.ms
        saida = re.sub(r"\s+", " ", r.texto)[:90]
        cortado = " [cortado]" if r.finish_reason == "length" else ""
        print(f"{'OK ' if ok else 'ERR'} esperado={tipo}/{str(urgente).lower()} | saída: {saida}{cortado}")
    resumo.append((nome, f"{validos}/{len(TICKETS)}", f"{acertos}/{len(TICKETS)}", tok_in, tok_out, f"{ms / 1000:.1f}"))

print("\n=== Resumo ===")
cab = ("prompt", "JSON válido", "acertos", "tokens entrada", "tokens saída", "tempo (s)")
print(" | ".join(f"{c:>14}" for c in cab))
for linha in resumo:
    print(" | ".join(f"{str(c):>14}" for c in linha))
