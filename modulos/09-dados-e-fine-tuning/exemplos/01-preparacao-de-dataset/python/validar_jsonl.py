"""Validador de JSONL para fine-tuning no formato chat (porta de `../validar-jsonl.js`).

Rode ANTES de subir o arquivo: um erro de formato só aparece no job depois do upload (status "failed").
Uso: uv run python exemplos/01-preparacao-de-dataset/python/validar_jsonl.py <treino.jsonl> [validacao.jsonl]
Sai com código 1 se houver erro.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from comum_py.config import CATEGORIAS, json_js  # noqa: E402
from comum_py.tokens import tokens_da_conversa  # noqa: E402

PAPEIS = {"system", "user", "assistant", "tool"}
MIN_EXEMPLOS = 10  # mínimo aceito pela OpenAI (a doc recomenda começar com ~50)
MAX_TOKENS_EXEMPLO = 4096  # limite NOSSO, conservador


def _texto_user(linha: str) -> str | None:
    try:
        return next((m.get("content") for m in json.loads(linha)["messages"] if m.get("role") == "user"), None)
    except (json.JSONDecodeError, KeyError, TypeError, AttributeError):
        return None


def validar_arquivo(caminho: str | Path) -> dict:
    erros: list[str] = []
    avisos: list[str] = []
    linhas = [l for l in Path(caminho).read_text(encoding="utf-8").split("\n") if l.strip()]
    rotulos: dict[str, int] = {}
    tokens = 0
    for n, linha in enumerate(linhas, start=1):
        try:
            ex = json.loads(linha)
        except json.JSONDecodeError:
            erros.append(f"linha {n}: JSON inválido")
            continue
        msgs = ex.get("messages") if isinstance(ex, dict) else None
        if not isinstance(msgs, list) or len(msgs) < 2:
            erros.append(f'linha {n}: "messages" ausente ou curto')
            continue
        extras = [k for k in ex if k not in ("messages", "tools", "parallel_tool_calls")]
        if extras:
            erros.append(f"linha {n}: chaves não reconhecidas {','.join(extras)}")
        for m in msgs:
            if m.get("role") not in PAPEIS:
                erros.append(f'linha {n}: papel inválido "{m.get("role")}"')
            if not isinstance(m.get("content"), str) or not m["content"].strip():
                erros.append(f"linha {n}: mensagem {m.get('role')} sem conteúdo")
        ultima = msgs[-1]
        if ultima.get("role") != "assistant":
            erros.append(f"linha {n}: a última mensagem precisa ser do assistant (é o alvo do treino)")
        # Checagem de DOMÍNIO (além do formato): o alvo tem que ser uma categoria válida.
        if ultima.get("content") not in CATEGORIAS:
            erros.append(f'linha {n}: rótulo fora do domínio "{ultima.get("content")}"')
        rotulos[ultima.get("content")] = rotulos.get(ultima.get("content"), 0) + 1
        t = tokens_da_conversa(msgs)
        if t > MAX_TOKENS_EXEMPLO:
            avisos.append(f"linha {n}: {t} tokens (> {MAX_TOKENS_EXEMPLO})")
        tokens += t
    if len(linhas) < MIN_EXEMPLOS:
        erros.append(f"apenas {len(linhas)} exemplos (mínimo {MIN_EXEMPLOS})")
    if rotulos and max(rotulos.values()) > 3 * min(rotulos.values()):
        avisos.append("classes muito desbalanceadas (> 3:1)")
    return {"caminho": str(caminho), "exemplos": len(linhas), "tokens": tokens, "rotulos": rotulos,
            "erros": erros, "avisos": avisos, "textos": [_texto_user(l) for l in linhas]}


def main(arquivos: list[str]) -> int:
    if not arquivos:
        print("uso: validar_jsonl.py <treino.jsonl> [validacao.jsonl]", file=sys.stderr)
        return 2
    res = [validar_arquivo(a) for a in arquivos]
    falhou = False
    for r in res:
        print(f"{r['caminho']}: {r['exemplos']} exemplos, ~{r['tokens']} tokens, rótulos {json_js(r['rotulos'])}")
        for e in r["erros"][:10]:
            print("  ERRO  ", e)
        for a in r["avisos"][:10]:
            print("  aviso ", a)
        falhou = falhou or bool(r["erros"])
    # Vazamento entre treino e validação: o mesmo exemplo nos dois infla a métrica de validação.
    if len(res) == 2:
        treino = set(res[0]["textos"])
        vazados = sum(1 for t in res[1]["textos"] if t in treino)
        print(f"vazamento treino→validação: {vazados} exemplo(s)")
        falhou = falhou or vazados > 0
    print("RESULTADO: reprovado" if falhou else "RESULTADO: aprovado")
    return 1 if falhou else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
