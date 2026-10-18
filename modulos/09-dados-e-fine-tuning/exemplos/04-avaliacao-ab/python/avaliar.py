"""Teste A/B: modelo genérico (base) × customizado (LoRA) no MESMO conjunto de validação — porta de `../avaliar.js`.

Mede acurácia (exact match), adequação de formato (resposta é uma categoria válida?), consistência
(2ª chamada igual à 1ª?) e recall por categoria; checa perda de generalização com perguntas fora do domínio.
Loga cada predição em resultados/python/ab-<data>.jsonl e o resumo em resultados/python/resumo.csv.
Pré-requisito: ../servidor_openai.py no ar (já era Python; padrão porta 30900, ou LORA_BASE_URL).
Uso (da pasta do módulo): uv run python exemplos/04-avaliacao-ab/python/avaliar.py
"""
from __future__ import annotations

import csv
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from comum_py.config import CATEGORIAS, DADOS, LORA_BASE_URL, SYSTEM_PROMPT, criar_cliente, json_js, ler_jsonl  # noqa: E402
from comum_py.numeros import js_round, num_fixed  # noqa: E402
from comum_py.tabela import tabela  # noqa: E402

MODELOS = ["smollm2-base", "smollm2-suporte-lora"]
PASTA = Path(__file__).resolve().parents[1] / "resultados" / "python"  # separado dos resultados do JS
client = criar_cliente(base_url=LORA_BASE_URL, api_key="local")

validacao = ler_jsonl(DADOS / "validacao.jsonl")
# Fora do domínio: o genérico deveria responder algo útil; o customizado tende a "forçar" uma categoria.
fora_do_dominio = ["Qual é a capital da França?", "Escreva uma frase de boas-vindas para um cliente novo.", "Quanto é 2 + 2?"]


def perguntar(modelo: str, mensagens: list[dict], max_tokens: int = 8) -> str:
    r = client.chat.completions.create(model=modelo, messages=mensagens, max_tokens=max_tokens, temperature=0)
    return (r.choices[0].message.content or "").strip()


PASTA.mkdir(parents=True, exist_ok=True)
log = PASTA / f"ab-{datetime.now(UTC).strftime('%Y-%m-%dT%H-%M-%S')}.jsonl"
resumo = []


def logar(obj: dict) -> None:
    with log.open("a", encoding="utf-8") as f:
        f.write(json_js(obj) + "\n")


for modelo in MODELOS:
    acertos = validos = consistentes = 0
    por_cat = {c: {"total": 0, "acertos": 0} for c in CATEGORIAS}
    t0 = time.monotonic()
    for ex in validacao:
        msgs = ex["messages"][:2]
        esperado = ex["messages"][2]["content"]
        previsto = perguntar(modelo, msgs)
        repetido = perguntar(modelo, msgs)  # consistência: mesma entrada, mesma saída?
        normal = re.sub(r"[^a-z]", "", previsto.lower())
        ok = normal == esperado
        acertos += ok
        validos += normal in CATEGORIAS
        consistentes += previsto == repetido
        por_cat[esperado]["total"] += 1
        por_cat[esperado]["acertos"] += ok
        logar({"modelo": modelo, "ticket": msgs[1]["content"], "esperado": esperado, "previsto": previsto, "ok": ok})
    n = len(validacao)
    resumo.append({
        "modelo": modelo, "n": n, "acuracia": num_fixed(acertos / n, 3), "formato_valido": num_fixed(validos / n, 3),
        "consistencia": num_fixed(consistentes / n, 3), "segundos": js_round(time.monotonic() - t0),
        **{f"recall_{c}": num_fixed(por_cat[c]["acertos"] / por_cat[c]["total"], 2) for c in CATEGORIAS},
    })

print(tabela([{k: r[k] for k in ("modelo", "n", "acuracia", "formato_valido", "consistencia", "segundos")} for r in resumo]))
print("Recall por categoria:")
print(tabela([{k: v for k, v in r.items() if k == "modelo" or k.startswith("recall_")} for r in resumo]))

# Exemplos lado a lado (os 4 primeiros) para a análise QUALITATIVA.
linhas = [json.loads(l) for l in log.read_text(encoding="utf-8").splitlines() if l]
print("Exemplos (base × LoRA):")
for ex in validacao[:4]:
    t = ex["messages"][1]["content"]
    b, l = (next(x["previsto"] for x in linhas if x.get("modelo") == m and x.get("ticket") == t) for m in MODELOS)
    print(f'- "{t[:60]}" esperado={ex["messages"][2]["content"]} | base="{b[:30]}" | lora="{l}"')

# Generalização: pergunta fora do domínio SEM o system prompt de classificação.
# Duas threads = Promise.all do JS; o servidor serializa com um Lock, então o ganho é pequeno.
print("\nFora do domínio (sem system prompt):")
with ThreadPoolExecutor(max_workers=2) as pool:
    for q in fora_do_dominio:
        b, l = pool.map(lambda m: perguntar(m, [{"role": "user", "content": q}], 20), MODELOS)
        print(f"- {q}\n    base: {re.sub(r'\s+', ' ', b)}\n    lora: {re.sub(r'\s+', ' ', l)}")
        logar({"tipo": "fora_do_dominio", "pergunta": q, "base": b, "lora": l})

cab = list(resumo[0])
arq_csv = PASTA / "resumo.csv"
novo = not arq_csv.exists()
with arq_csv.open("a", newline="", encoding="utf-8") as f:
    w = csv.writer(f, lineterminator="\n")
    if novo:
        w.writerow(["data", *cab])
    for r in resumo:
        w.writerow([datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"), *(r[k] for k in cab)])
print(f"\nlog por predição: {log.relative_to(Path.cwd(), walk_up=True)} · resumo acumulado: {arq_csv.relative_to(Path.cwd(), walk_up=True)}")
print(f'(system prompt usado: "{SYSTEM_PROMPT[:50]}...")')
