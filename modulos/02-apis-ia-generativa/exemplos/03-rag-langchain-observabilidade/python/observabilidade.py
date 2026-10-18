"""Observabilidade "de bolso" (versão Python de observabilidade.js): um callback do LangChain que emite uma
linha JSON por evento. run_id + parent_run_id permitem reconstruir a árvore (um "trace").
Em produção, a mesma ideia vira LangSmith, Langfuse ou OpenTelemetry.
"""

import json
import time
from datetime import datetime
from typing import Any
from uuid import UUID

from langchain_core.callbacks import BaseCallbackHandler


class LogJson(BaseCallbackHandler):
    def __init__(self) -> None:
        self.inicio: dict[UUID, float] = {}
        self.nomes: dict[UUID, str] = {}

    def emitir(self, evento: str, run_id: UUID, **extra: Any) -> None:
        ms = round((time.perf_counter() - self.inicio[run_id]) * 1000) if run_id in self.inicio else None
        linha = {"ts": datetime.now().strftime("%H:%M:%S.%f")[:12], "evento": evento, "run": str(run_id)[:8], "ms": ms, **extra}
        print(json.dumps(linha, ensure_ascii=False))

    # Só logamos passos nomeados (with_config(run_name="rag.*")) para não poluir com runnables internos.
    def on_chain_start(self, serialized, inputs, *, run_id, parent_run_id=None, name=None, **kwargs):
        self.inicio[run_id] = time.perf_counter()
        nome = name or kwargs.get("run_name") or ""
        self.nomes[run_id] = nome
        if nome.startswith("rag."):
            self.emitir("passo.inicio", run_id, passo=nome, pai=str(parent_run_id)[:8] if parent_run_id else None)

    def on_chain_end(self, outputs, *, run_id, **kwargs):
        if self.nomes.get(run_id, "").startswith("rag."):
            self.emitir("passo.fim", run_id, passo=self.nomes[run_id])

    def on_chain_error(self, error, *, run_id, **kwargs):
        if self.nomes.get(run_id, "").startswith("rag."):
            self.emitir("passo.erro", run_id, passo=self.nomes[run_id], erro=str(error)[:80])

    def on_chat_model_start(self, serialized, messages, *, run_id, **kwargs):
        self.inicio[run_id] = time.perf_counter()

    def on_llm_end(self, response, *, run_id, **kwargs):
        u = (response.llm_output or {}).get("token_usage") or {}
        self.emitir("llm.fim", run_id, tokens_entrada=u.get("prompt_tokens"), tokens_saida=u.get("completion_tokens"))

    def on_llm_error(self, error, *, run_id, tags=None, **kwargs):
        # O RunnableRetry marca cada tentativa com a tag "retry:attempt:N": é o nosso "onFailedAttempt".
        tentativa = next((t.split(":")[-1] for t in (tags or []) if t.startswith("retry:attempt:")), "1")
        self.emitir("llm.erro", run_id, tentativa=int(tentativa), status=getattr(error, "status_code", None), erro=str(error)[:60])
