"""Cliente único do módulo (versão Python): mesmas variáveis e defaults de infra/.env.example.

Trocar Ollama -> OpenAI/OpenRouter é só mudar o ambiente, sem tocar no código.
"""

import json
import os
import re
import time
from dataclasses import dataclass

import psycopg
from openai import OpenAI
from pgvector.psycopg import register_vector

BASE_URL = os.environ.get("OPENAI_BASE_URL", "http://localhost:11434/v1")
API_KEY = os.environ.get("OPENAI_API_KEY", "ollama")
MODELO_CHAT = os.environ.get("MODELO_CHAT", "qwen3.5:4b")
MODELO_EMBED = os.environ.get("MODELO_EMBED", "qwen3-embedding:0.6b")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://ia:ia@localhost:5433/ia")

# O Ollama é compartilhado e lento em CPU: timeout alto e sem retry (um retry só dobraria a fila).
client = OpenAI(base_url=BASE_URL, api_key=API_KEY, timeout=900, max_retries=0)

# No Ollama, reasoning_effort "none" desliga o "thinking" do qwen3.5. Em outro provedor, não mandamos.
EXTRAS_OLLAMA: dict = {"reasoning_effort": "none"} if "11434" in BASE_URL else {}


@dataclass
class Uso:
    """Contadores globais do processo: todo exemplo imprime quantas chamadas e tokens gastou."""
    chamadas: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    segundos: float = 0.0


uso = Uso()


@dataclass
class Resposta:
    msg: dict          # mensagem do assistente já como dict (pronta para voltar ao histórico)
    usage: dict        # prompt_tokens, completion_tokens, total_tokens
    segundos: float
    finish_reason: str | None


def chat(messages: list[dict], *, tools: list[dict] | None = None, max_tokens: int = 200,
         temperature: float = 0, json_mode: bool = False) -> Resposta:
    """Uma chamada de Chat Completions (com ou sem tools). Não decide nada: quem decide é o loop do agente."""
    t0 = time.perf_counter()
    r = client.chat.completions.create(
        model=MODELO_CHAT,
        messages=messages,
        **({"tools": tools} if tools else {}),
        temperature=temperature,
        max_tokens=max_tokens,
        # JSON mode: o servidor restringe a saída a JSON válido (o Ollama suporta via API compatível).
        **({"response_format": {"type": "json_object"}} if json_mode else {}),
        **EXTRAS_OLLAMA,
    )
    segundos = time.perf_counter() - t0
    u = r.usage
    usage = {"prompt_tokens": u.prompt_tokens if u else 0, "completion_tokens": u.completion_tokens if u else 0,
             "total_tokens": u.total_tokens if u else 0}
    uso.chamadas += 1
    uso.prompt_tokens += usage["prompt_tokens"]
    uso.completion_tokens += usage["completion_tokens"]
    uso.segundos += segundos
    # exclude_none: o histórico volta ao servidor sem campos nulos (alguns provedores recusam "tool_calls": null).
    msg = r.choices[0].message.model_dump(exclude_none=True)
    return Resposta(msg=msg, usage=usage, segundos=segundos, finish_reason=r.choices[0].finish_reason)


def embed(textos: list[str]) -> list[list[float]]:
    r = client.embeddings.create(model=MODELO_EMBED, input=textos)
    return [d.embedding for d in r.data]


def conectar() -> psycopg.Connection:
    """Conexão com o schema m04 garantido (nunca public) e o tipo vector registrado (pgvector)."""
    conn = psycopg.connect(DATABASE_URL, autocommit=True)
    conn.execute("CREATE SCHEMA IF NOT EXISTS m04")
    register_vector(conn)
    return conn


def resumo_uso() -> str:
    return (f"{uso.chamadas} chamadas ao LLM · {uso.prompt_tokens} tokens de prompt · "
            f"{uso.completion_tokens} de resposta · {uso.segundos:.1f}s no modelo")


def extrair_json(texto: str | None):
    """Tenta extrair um objeto/array JSON de um texto (modelos pequenos às vezes cercam com ```json)."""
    limpo = re.sub(r"```(?:json)?", "", texto or "").strip()
    m = re.search(r"[\[{]", limpo)
    if not m:
        raise ValueError(f"sem JSON na resposta: {texto}")
    ini = m.start()
    fecha = "]" if limpo[ini] == "[" else "}"
    return json.loads(limpo[ini:limpo.rfind(fecha) + 1])


def js(obj) -> str:
    """JSON compacto como o JSON.stringify do JS (sem espaços, acentos legíveis)."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def calcular_seguro(expressao: str) -> int | float:
    """Avaliador aritmético seguro: percorre a AST e só aceita números e + - * / ( ). Nada de eval()."""
    import ast
    import operator as op

    if not re.fullmatch(r"[\d\s.+\-*/()]+", expressao, re.ASCII):
        raise ValueError(f"expressão com caracteres não permitidos: {expressao}")
    ops = {ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul, ast.Div: op.truediv, ast.USub: op.neg, ast.UAdd: op.pos}

    def avaliar(n: ast.AST):
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in ops:
            return ops[type(n.op)](avaliar(n.left), avaliar(n.right))
        if isinstance(n, ast.UnaryOp) and type(n.op) in ops:
            return ops[type(n.op)](avaliar(n.operand))
        raise ValueError(f"expressão inválida: {expressao}")

    r = avaliar(ast.parse(expressao, mode="eval").body)
    # Como no JS (um só tipo number): 6/3 imprime 2, não 2.0.
    return int(r) if isinstance(r, float) and r.is_integer() else r
