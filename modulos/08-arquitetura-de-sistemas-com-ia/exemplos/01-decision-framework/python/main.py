"""Exemplo 01 (Python) · Decision framework executável: regra determinística × LLM × híbrido.

A pergunta de arquitetura não é "IA ou não?", e sim "qual rota bate o SLA de acerto, latência e custo para
ESTE conjunto de casos?". Medimos as três rotas no mesmo conjunto e deixamos os números decidirem.
"""

import os
import re
import time
import unicodedata

from comum_py.llm import chat, custo_usd, fixo, tabela

ROTULOS = ["saldo", "cartao", "pix", "reclamacao", "outro"]

# Conjunto de avaliação com gabarito. Metade é "fácil" (palavra-chave óbvia), metade exige entender a frase.
CASOS = [
    ("Qual o saldo da minha conta?", "saldo"),
    ("Quero bloquear meu cartão", "cartao"),
    ("Como faço um pix para minha mãe?", "pix"),
    ("Estou muito insatisfeito com o atendimento de ontem", "reclamacao"),
    ("Perdi a carteira com tudo dentro, e agora?", "cartao"),
    ("Mandei dinheiro pela chave do celular e não caiu", "pix"),
    ("Quanto ainda tenho disponível pra gastar este mês?", "saldo"),
    ("Vocês abrem no feriado?", "outro"),
]

# Rota 1 · regras: rápidas, grátis, auditáveis, mas só entendem o que alguém previu.
# re.ASCII deixa \b igual ao do JS (no Python, \b é Unicode por padrão).
_F = re.IGNORECASE | re.ASCII
REGRAS = {
    "saldo": re.compile(r"\bsaldo\b|\bextrato\b", _F),
    "cartao": re.compile(r"\bcart[aã]o\b|\bfatura\b", _F),
    "pix": re.compile(r"\bpix\b", _F),
    "reclamacao": re.compile(r"insatisfeit|reclama|p[eé]ssimo", _F),
}


def rota_regra(texto: str) -> str | None:
    hits = [r for r, padrao in REGRAS.items() if padrao.search(texto)]
    # Só responde quando tem certeza (exatamente 1 regra casou). Senão admite que não sabe.
    return hits[0] if len(hits) == 1 else None


# Rota 2 · LLM: entende paráfrase, mas custa tokens, latência e pode errar sem avisar.
SISTEMA = (f"Classifique o pedido de um cliente de banco em UMA palavra entre: {', '.join(ROTULOS)}.\n"
           "Perda/roubo de cartão ou carteira = cartao. Transferência por chave = pix. Responda só a palavra.")


def rota_llm(texto: str) -> dict:
    r = chat([{"role": "system", "content": SISTEMA}, {"role": "user", "content": texto}], max_tokens=4)
    palavra = re.sub(r"[^a-z]", "", unicodedata.normalize("NFD", r["texto"].lower()))
    # Saída fora do contrato vira "outro": nunca confie que o modelo respeitou a lista.
    return {"rotulo": palavra if palavra in ROTULOS else "outro", "ms": r["ms"], "usd": custo_usd("barato", r["usage"])}


resultados = []
for texto, esperado in CASOS:
    t0 = time.perf_counter()
    regra = rota_regra(texto)
    ms_regra = (time.perf_counter() - t0) * 1000
    llm = rota_llm(texto)
    # Rota 3 · híbrida: regra primeiro; LLM só quando a regra não sabe (aqui reaproveitamos a medição).
    hibrido = {"rotulo": regra, "ms": ms_regra, "usd": 0} if regra else llm
    resultados.append({"esperado": esperado, "regra": {"rotulo": regra or "nao_sei", "ms": ms_regra, "usd": 0},
                       "llm": llm, "hibrido": hibrido})
    print(f'- "{texto}" → regra={regra or "nao_sei"} llm={llm["rotulo"]} ({llm["ms"]} ms) gabarito={esperado}', flush=True)


def resumo(nome: str, chave: str) -> dict:
    n = len(resultados)
    acertos = sum(r[chave]["rotulo"] == r["esperado"] for r in resultados)
    cobertura = sum(r[chave]["rotulo"] != "nao_sei" for r in resultados)
    ms = sum(r[chave]["ms"] for r in resultados) / n
    usd = sum(r[chave]["usd"] for r in resultados)
    return {"rota": nome, "acerto": acertos / n, "cobertura": cobertura / n, "ms": ms, "usd_1k": usd / n * 1000}


linhas = [resumo("regra", "regra"), resumo("llm", "llm"), resumo("hibrida", "hibrido")]
print("\n" + tabela([{
    "rota": l["rota"],
    "acerto": f"{fixo(l['acerto'] * 100, 0)}%",
    "cobertura": f"{fixo(l['cobertura'] * 100, 0)}%",
    "latência média": f"{fixo(l['ms'], 1)} ms",
    "US$/1k pedidos": fixo(l["usd_1k"], 4),
} for l in linhas]))

# O "decision framework" vira código: SLA declarado → filtra rotas que cumprem → escolhe a mais barata.
# Latência default generosa porque o modelo roda em CPU (~5 tokens/s); numa API real use ~1500 ms.
SLA = {"acerto_min": 0.85, "latencia_max_ms": float(os.environ.get("SLA_MS", 60000)), "usd_max_1k": 0.05}
aprovadas = [l for l in linhas if l["acerto"] >= SLA["acerto_min"] and l["ms"] <= SLA["latencia_max_ms"]
             and l["usd_1k"] <= SLA["usd_max_1k"]]
print(f"\nSLA: acerto >= {SLA['acerto_min'] * 100:g}%, latência <= {SLA['latencia_max_ms']:g} ms, "
      f"custo <= US$ {SLA['usd_max_1k']:g}/1k")
if not aprovadas:
    print("Nenhuma rota cumpre o SLA: revise o SLA, as regras ou o modelo.")
else:
    aprovadas.sort(key=lambda a: (a["usd_1k"], a["ms"]))
    print(f"Rotas que cumprem: {', '.join(a['rota'] for a in aprovadas)} → escolhida: {aprovadas[0]['rota']}")
