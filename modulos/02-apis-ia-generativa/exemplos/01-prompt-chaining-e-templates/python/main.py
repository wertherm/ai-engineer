"""Prompt chaining (versão Python): um problema grande vira 3 chamadas pequenas e verificáveis.

  1) extrair (JSON validado com pydantic) → 2) classificar (JSON validado) → 3) redigir (texto livre)
Cada elo recebe só o que precisa do anterior. Uso: python main.py ["texto do cliente"]
"""

import json
import sys
from pathlib import Path
from typing import Literal

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para importar comum_py
from pydantic import BaseModel, ConfigDict, Field

from comum_py.config import MODELO_CHAT, PADRAO, criar_cliente
from comum_py.estruturado import chamar_estruturado
from templates import TEMPLATES, mensagens


# Modelos pydantic: o contrato de cada elo (no JS, schemas zod).
# extra="forbid" gera additionalProperties: false, exigido pelo modo strict da OpenAI.
class Extracao(BaseModel):
    model_config = ConfigDict(extra="forbid")
    produto: str = Field(min_length=2)
    problema: str = Field(min_length=5)
    pedido: str | None
    # v3 do template: sem este campo, o elo 2 nunca soube da "viagem na sexta".
    prazo: str | None = Field(description="prazo ou data que o cliente mencionou")


class Classificacao(BaseModel):
    model_config = ConfigDict(extra="forbid")
    urgencia: Literal["alta", "media", "baixa"]
    justificativa: str = Field(max_length=160)


def log(e: dict) -> None:
    print("  ·", json.dumps(e, ensure_ascii=False))


cliente = criar_cliente()
texto = sys.argv[1] if len(sys.argv) > 1 else (
    "Comprei um fone Bluetooth (pedido 48213) e ele chegou sem o cabo de carga. Preciso dele para uma viagem na sexta!"
)
print(f"Entrada: {texto}\n")

# Elo 1 — extrair.
t = TEMPLATES["extrair"]
print(f"[1] {t['id']} v{t['versao']}")
ext = chamar_estruturado(cliente, nome="extracao", modelo=Extracao, messages=mensagens(t, {"texto": texto}), log=log)["dados"]
# Anti-alucinação determinística: um número de pedido que não aparece no texto é inventado.
if ext.pedido and ext.pedido not in texto:
    print(f'  ! pedido "{ext.pedido}" não está no texto: descartado')
    ext.pedido = None
print("  →", ext.model_dump_json())

# Elo 2 — classificar (recebe só produto, problema e prazo, não o texto inteiro).
t = TEMPLATES["classificar"]
print(f"[2] {t['id']} v{t['versao']}")
variaveis = {**ext.model_dump(), "prazo": ext.prazo or "não informado"}
cls = chamar_estruturado(cliente, nome="classificacao", modelo=Classificacao, messages=mensagens(t, variaveis), log=log)["dados"]
print("  →", cls.model_dump_json())

# Elo 3 — redigir (texto livre: aqui não há schema, só limite de tokens).
t = TEMPLATES["responder"]
print(f"[3] {t['id']} v{t['versao']}")
resp = cliente.chat.completions.create(
    **PADRAO,
    model=MODELO_CHAT,
    max_tokens=90,
    messages=mensagens(t, {"problema": ext.problema, "pedido": ext.pedido or "não informado", "urgencia": cls.urgencia}),
)
print("  →", resp.choices[0].message.content.strip())
