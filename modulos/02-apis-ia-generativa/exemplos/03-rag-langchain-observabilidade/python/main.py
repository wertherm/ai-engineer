"""RAG orquestrado com LangChain Python (LCEL) + pgvector + retentativas com backoff + logs JSON.

  pergunta ─► rag.recuperar (embedding + busca no pgvector) ─► rag.prompt ─► rag.llm (with_retry) ─► texto

Para ver as retentativas sem derrubar nada, injetamos falhas: as primeiras FALHAS chamadas ao chat
devolvem HTTP 503 (como um provedor sobrecarregado). Uso: python main.py ["pergunta"]
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para importar comum_py
import httpx
import openai
import psycopg
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda, RunnablePassthrough
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pgvector.psycopg import register_vector

from comum_py.config import API_KEY, BASE_URL, DATABASE_URL, MODELO_CHAT, MODELO_EMBED, SCHEMA
from corpus import DOCUMENTOS
from observabilidade import LogJson

pergunta = sys.argv[1] if len(sys.argv) > 1 else "Comprei um fone há 10 dias. Ainda posso trocar?"
TABELA = f"{SCHEMA}.rag_chunks_py"


class TransporteComFalhas(httpx.HTTPTransport):
    """Transporte httpx "sabotado": devolve 503 nas primeiras chamadas ao /chat/completions."""

    def __init__(self, falhas: int) -> None:
        super().__init__()
        self.falhas = falhas

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/chat/completions") and self.falhas > 0:
            self.falhas -= 1
            return httpx.Response(503, json={"error": {"message": "servidor sobrecarregado (falha injetada)"}})
        return super().handle_request(request)


transporte = TransporteComFalhas(int(os.environ.get("FALHAS", "2")))

# check_embedding_ctx_length=False: por padrão o OpenAIEmbeddings tokeniza com tiktoken e manda LISTAS DE
# TOKENS para /embeddings — o Ollama não aceita. Desligado, ele manda o texto.
embeddings = OpenAIEmbeddings(model=MODELO_EMBED, api_key=API_KEY, base_url=BASE_URL, check_embedding_ctx_length=False)
llm = ChatOpenAI(
    model=MODELO_CHAT,
    api_key=API_KEY,
    base_url=BASE_URL,
    temperature=0,
    max_tokens=60,
    reasoning_effort="none",
    max_retries=0,  # desliga a retentativa interna do SDK: quem decide é o with_retry abaixo (evita retry em dobro)
    timeout=900,
    http_client=httpx.Client(transport=transporte, timeout=900),
)

# --- Ingestão (idempotente) no schema m02 ---------------------------------------------------------
db = psycopg.connect(DATABASE_URL, autocommit=True)
db.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
register_vector(db)
db.execute(f"CREATE TABLE IF NOT EXISTS {TABELA} (id serial PRIMARY KEY, fonte text UNIQUE, texto text, embedding vector(1024))")
(n,) = db.execute(f"SELECT count(*) FROM {TABELA}").fetchone()
if n < len(DOCUMENTOS):
    vetores = embeddings.embed_documents([d["texto"] for d in DOCUMENTOS])
    for d, v in zip(DOCUMENTOS, vetores):
        db.execute(
            f"INSERT INTO {TABELA} (fonte, texto, embedding) VALUES (%s, %s, %s::vector) ON CONFLICT (fonte) DO NOTHING",
            (d["fonte"], d["texto"], str(v)),
        )
    print(f"ingestão: {len(DOCUMENTOS)} documentos indexados em {TABELA}")


# --- Passos da chain ------------------------------------------------------------------------------
def buscar(q: str) -> str:
    v = embeddings.embed_query(q)
    linhas = db.execute(
        f"SELECT fonte, texto, 1 - (embedding <=> %s::vector) AS similaridade FROM {TABELA} ORDER BY embedding <=> %s::vector LIMIT 2",
        (str(v), str(v)),
    ).fetchall()
    print(json.dumps({"evento": "recuperados", "docs": [f"{f}:{s:.3f}" for f, _, s in linhas]}))
    # Citar a fonte no contexto permite pedir ao modelo que cite: resposta auditável, menos alucinação.
    return "\n".join(f"[{f}] {t}" for f, t, _ in linhas)


recuperar = RunnableLambda(buscar).with_config(run_name="rag.recuperar")
prompt = ChatPromptTemplate.from_messages([
    ("system", "Responda em 1 frase usando SÓ o contexto e cite a fonte entre colchetes. "
               "Se não estiver no contexto, diga 'não sei'.\nContexto:\n{contexto}"),
    ("human", "{pergunta}"),
]).with_config(run_name="rag.prompt")

# with_retry: backoff exponencial com jitter (tenacity por baixo). Só erros TRANSITÓRIOS são retentados:
# 5xx, 429, timeout e falha de conexão. Um 400/401 não melhora tentando de novo.
# No Python a ordem with_config/with_retry NÃO importa (with_config embrulha o RunnableRetry e mantém
# stop_after_attempt) — ao contrário do JS, onde withConfig() depois de withRetry() descarta a configuração.
llm_resiliente = llm.with_retry(
    stop_after_attempt=4,
    retry_if_exception_type=(openai.InternalServerError, openai.RateLimitError, openai.APITimeoutError, openai.APIConnectionError),
    wait_exponential_jitter=True,
).with_config(run_name="rag.llm")

chain = (
    {"contexto": recuperar, "pergunta": RunnablePassthrough()} | prompt | llm_resiliente | StrOutputParser()
).with_config(run_name="rag.chain")

print(f"pergunta: {pergunta}  (falhas injetadas: {transporte.falhas})")
resposta = chain.invoke(pergunta, config={"callbacks": [LogJson()]})
print(f"\nresposta: {resposta.strip()}")
db.close()
