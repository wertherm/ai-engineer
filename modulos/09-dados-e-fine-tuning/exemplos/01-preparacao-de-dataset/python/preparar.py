"""Pipeline de preparação (porta de `../preparar.js`): brutos -> limpeza -> rótulos padronizados -> dedup ->
balanceamento -> split estratificado -> JSONL no formato chat + relatório de qualidade.

Uso (da pasta do módulo): uv run python exemplos/01-preparacao-de-dataset/python/preparar.py [--sem-balancear] [--dir DIR]
Lê e grava em dados/python/ por padrão (o JS usa dados/); os arquivos saem idênticos aos do JS.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from comum_py.config import DADOS, json_js  # noqa: E402
from preparacao import (  # noqa: E402
    balancear, contar_por_categoria, deduplicar, diversidade, limpar_texto, mulberry32,
    padronizar_rotulo, para_chat_jsonl, split_estratificado,
)

SEMENTE = 42
MIN_CARACTERES = 15
MAX_CARACTERES = 1000


def preparar(pasta: Path, balancear_ativo: bool = True) -> tuple[dict, list[dict], list[dict]]:
    linhas = [l for l in (pasta / "tickets-brutos.jsonl").read_text(encoding="utf-8").split("\n") if l]
    relatorio: dict = {"entrada": len(linhas), "descartes": {}}

    def descartar(motivo: str) -> None:
        relatorio["descartes"][motivo] = relatorio["descartes"].get(motivo, 0) + 1

    # 1+2. Limpeza do texto e padronização do rótulo, linha a linha (uma linha ruim não derruba o lote).
    limpos = []
    for linha in linhas:
        try:
            r = json.loads(linha)
        except json.JSONDecodeError:
            descartar("json_invalido")
            continue
        categoria = padronizar_rotulo(r.get("categoria"))
        if not categoria:
            descartar("rotulo_fora_do_dominio")
            continue
        texto = limpar_texto(r.get("texto"))
        # len() conta code points; o .length do JS conta unidades UTF-16. Iguais aqui (nenhum emoji no texto).
        if len(texto) < MIN_CARACTERES:
            descartar("texto_curto_ou_vazio")
            continue
        limpos.append({"id": r.get("id"), "texto": texto[:MAX_CARACTERES], "categoria": categoria})
    relatorio["aposLimpeza"] = len(limpos)
    relatorio["distribuicaoAntes"] = contar_por_categoria(limpos)

    # 3. Deduplicação.
    d = deduplicar(limpos)
    relatorio.update(duplicatasExatas=d["exatas"], quaseDuplicatas=d["quase"],
                     conflitosDeRotulo=d["conflitos"], aposDedup=len(d["mantidos"]))

    # 4. Balanceamento (undersampling) e split estratificado, ambos com semente (o MESMO PRNG do JS).
    rand = mulberry32(SEMENTE)
    base = balancear(d["mantidos"], rand) if balancear_ativo else d["mantidos"]
    relatorio["distribuicaoDepois"] = contar_por_categoria(base)
    treino, validacao = split_estratificado(base, rand)

    # Vazamento: nenhum texto de validação pode existir no treino (senão a métrica mente).
    textos_treino = {r["texto"] for r in treino}
    relatorio["vazamentoTreinoValidacao"] = sum(1 for r in validacao if r["texto"] in textos_treino)
    relatorio["treino"] = len(treino)
    relatorio["validacao"] = len(validacao)
    relatorio["diversidadeTreino"] = diversidade([r["texto"] for r in treino])
    return relatorio, treino, validacao


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Preparação do dataset de tickets (porta do preparar.js)")
    ap.add_argument("--sem-balancear", action="store_true")
    ap.add_argument("--dir", type=Path, default=DADOS / "python", help="pasta com tickets-brutos.jsonl (e de saída)")
    args = ap.parse_args()

    relatorio, treino, validacao = preparar(args.dir, not args.sem_balancear)

    # 5. Grava os JSONL (uma conversa por linha) e o relatório — no mesmo formato do JSON.stringify do JS.
    for nome, regs in [("treino.jsonl", treino), ("validacao.jsonl", validacao)]:
        (args.dir / nome).write_text("".join(json_js(para_chat_jsonl(r)) + "\n" for r in regs), encoding="utf-8")
    (args.dir / "relatorio-qualidade.json").write_text(json_js(relatorio, indent=2) + "\n", encoding="utf-8")

    print("Relatório de qualidade do dataset")
    print(json_js(relatorio, indent=2))
    print(f"\nPrimeira linha de {args.dir.name}/treino.jsonl:")
    print(json_js(para_chat_jsonl(treino[0])))
