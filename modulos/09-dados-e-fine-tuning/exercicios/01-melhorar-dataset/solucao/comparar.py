"""Solução do exercício 01: mede o efeito da QUALIDADE dos dados no LoRA.

Cria uma versão "ruidosa" do treino (30% dos rótulos trocados + exemplos de "entrega" duplicados 3x, o que
desbalanceia), treina um adapter com ela e outro com o treino limpo, com o MESMO orçamento (1 época, mesma
semente), e avalia os dois no MESMO conjunto de validação limpo.

Uso (da pasta do módulo): uv run python exercicios/01-melhorar-dataset/solucao/comparar.py [--so ruidoso|limpo]
Cada variante roda num processo próprio se você passar --so (útil com pouca RAM: o processo morre e devolve tudo).
"""
from __future__ import annotations

import argparse
import gc
import json
import random
import sys
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RAIZ / "comum"))
sys.path.insert(0, str(RAIZ / "exemplos" / "03-lora-peft-cpu"))
from modelo_local import CATEGORIAS, DADOS, carregar_base, classificar, ler_jsonl  # noqa: E402
from treinar_lora import treinar  # noqa: E402

from peft import PeftModel  # noqa: E402

SAIDA = RAIZ / ".cache" / "exercicio-01"  # artefatos temporários (ignorados pelo git)
SAIDA.mkdir(parents=True, exist_ok=True)


def gerar_ruidoso(treino: list[dict], rng: random.Random) -> list[dict]:
    ruidoso = []
    for ex in treino:
        ex = json.loads(json.dumps(ex))
        if rng.random() < 0.3:  # ruído de rótulo: anotador errou
            ex["messages"][-1]["content"] = rng.choice([c for c in CATEGORIAS if c != ex["messages"][-1]["content"]])
        copias = 3 if ex["messages"][-1]["content"] == "entrega" else 1  # desbalanceamento
        ruidoso.extend([ex] * copias)
    rng.shuffle(ruidoso)
    return ruidoso


def acuracia(adapter: Path, validacao: list[dict]) -> tuple[float, Counter]:
    tok, base = carregar_base()
    modelo = PeftModel.from_pretrained(base, adapter).eval()
    previstos = [classificar(tok, modelo, ex["messages"][1]["content"]) for ex in validacao]
    acertos = sum(p == ex["messages"][-1]["content"] for p, ex in zip(previstos, validacao))
    del modelo, base
    gc.collect()
    return acertos / len(validacao), Counter(previstos)


treino = ler_jsonl(DADOS / "treino.jsonl")
validacao = ler_jsonl(DADOS / "validacao.jsonl")
arq_ruidoso = SAIDA / "treino-ruidoso.jsonl"
arq_ruidoso.write_text("\n".join(json.dumps(e, ensure_ascii=False) for e in gerar_ruidoso(treino, random.Random(7))) + "\n")

ap = argparse.ArgumentParser()
ap.add_argument("--so", choices=["ruidoso", "limpo"])
so = ap.parse_args().so
arq_resultados = SAIDA / "resultados.json"  # acumula entre execuções separadas
resultados = json.loads(arq_resultados.read_text()) if arq_resultados.exists() else {}
for nome, arq in [("ruidoso", arq_ruidoso), ("limpo", DADOS / "treino.jsonl")]:
    if so and nome != so:
        continue
    print(f"\n== treinando com o dataset {nome} ({len(ler_jsonl(arq))} exemplos, 1 época) ==")
    r = treinar(arq, DADOS / "validacao.jsonl", SAIDA / f"adapter-{nome}", epocas=1, verbose=False)
    acc, dist = acuracia(SAIDA / f"adapter-{nome}", validacao)
    resultados[nome] = acc
    arq_resultados.write_text(json.dumps(resultados))
    gc.collect()
    print(f"loss de validação {r['loss_val_depois']:.3f} | acurácia {acc:.1%} | {r['duracao_s']:.0f} s | previsões {dict(dist)}")

if {"ruidoso", "limpo"} <= resultados.keys():
    print(f"\nefeito da limpeza: {resultados['ruidoso']:.1%} -> {resultados['limpo']:.1%} de acurácia")
