"""Cache de respostas no Postgres (versão Python de cache-respostas.js).

Mesma requisição → mesma resposta, custo zero. A chave é o hash de TUDO que muda a resposta (modelo +
parâmetros + mensagens). Tabela própria (`m02.cache_respostas_py`): a serialização do Python
(`json.dumps(sort_keys=True)`) gera chaves diferentes das do `JSON.stringify` do JS, então misturar as duas
versões na mesma tabela só criaria linhas "órfãs".
"""

import hashlib
import json
from collections.abc import Callable

import psycopg
from psycopg.types.json import Jsonb

from comum_py.config import DATABASE_URL, SCHEMA

TABELA = f"{SCHEMA}.cache_respostas_py"


def abrir_cache() -> psycopg.Connection:
    db = psycopg.connect(DATABASE_URL, autocommit=True)
    db.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
    db.execute(f"""CREATE TABLE IF NOT EXISTS {TABELA} (
        chave text PRIMARY KEY,
        resposta jsonb NOT NULL,
        criado_em timestamptz NOT NULL DEFAULT now())""")
    return db


def chave_de(requisicao: dict) -> str:
    # sort_keys: a mesma requisição montada em outra ordem precisa dar a mesma chave.
    return hashlib.sha256(json.dumps(requisicao, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def com_cache(db: psycopg.Connection, requisicao: dict, chamar: Callable[[dict], dict], ttl_horas: int = 24) -> tuple[dict, bool]:
    """Envolve qualquer chamada: devolve (resposta, hit)."""
    chave = chave_de(requisicao)
    linha = db.execute(
        f"SELECT resposta FROM {TABELA} WHERE chave = %s AND criado_em > now() - make_interval(hours => %s)",
        (chave, ttl_horas),
    ).fetchone()
    if linha:
        return linha[0], True
    resposta = chamar(requisicao)
    db.execute(
        f"""INSERT INTO {TABELA} (chave, resposta) VALUES (%s, %s)
            ON CONFLICT (chave) DO UPDATE SET resposta = EXCLUDED.resposta, criado_em = now()""",
        (chave, Jsonb(resposta)),
    )
    return resposta, False
