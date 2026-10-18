"""Ferramentas de gerenciamento de contexto, todas puras (sem LLM), exceto sumarizar()."""

import math

from comum_py.llm import chat


def estimar_tokens(msgs: list[dict]) -> int:
    """Estimativa barata (~4 caracteres por token em PT/EN). A conta exata vem depois em usage.prompt_tokens.
    Atenção: len() do Python conta code points; o .length do JS conta unidades UTF-16 (igual para texto sem emoji)."""
    return sum(math.ceil(len(m.get("content") or "") / 4) + 4 for m in msgs)


def podar_tools_antigas(msgs: list[dict], *, manter_ultimas: int = 2, max_chars: int = 80) -> list[dict]:
    """Pruning 1: encurta resultados de ferramenta antigos (são os maiores e envelhecem rápido)."""
    idx_tools = [i for i, m in enumerate(msgs) if m["role"] == "tool"]
    antigas = set(idx_tools[:-manter_ultimas])  # como o slice(0, -n) do JS (n = 0 não poda nada)
    return [{**m, "content": f"{m['content'][:max_chars]}… [podado]"} if i in antigas and len(m["content"]) > max_chars else m
            for i, m in enumerate(msgs)]


def janela(msgs: list[dict], orcamento: int) -> list[dict]:
    """Pruning 2: janela deslizante — mantém as mensagens mais recentes que cabem no orçamento."""
    out: list[dict] = []
    for m in reversed(msgs):
        if estimar_tokens([*out, m]) > orcamento:
            break
        out.insert(0, m)
    return out


def sumarizar(msgs: list[dict]) -> str:
    """Sumarização: comprime o que saiu da janela num parágrafo (1 chamada ao LLM)."""
    texto = "\n".join(f"{m['role']}: {m['content']}" for m in msgs)
    r = chat([{"role": "system", "content": "Resuma a conversa em até 3 linhas, preservando números, ids e decisões."},
              {"role": "user", "content": texto}], max_tokens=90)
    return r.msg["content"].strip()


def costurar(*, global_: str, fatos: list[str] = (), resumo: str | None = None, local: list[str] = (),
             recentes: list[dict]) -> list[dict]:
    """Stitching: costura o contexto ATIVO a partir de pedaços de origens diferentes, em ordem fixa:
    global (system + objetivo) -> fatos fixados -> resumo do passado -> contexto local -> janela recente."""
    blocos = [global_]
    if fatos:
        blocos.append("Fatos fixados:\n" + "\n".join(f"- {f}" for f in fatos))
    if resumo:
        blocos.append(f"Resumo do que já aconteceu: {resumo}")
    if local:
        blocos.append("Contexto local desta etapa:\n" + "\n".join(f"- {l}" for l in local))
    return [{"role": "system", "content": "\n\n".join(blocos)}, *recentes]
