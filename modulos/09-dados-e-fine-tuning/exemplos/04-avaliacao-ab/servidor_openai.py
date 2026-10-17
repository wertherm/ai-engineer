"""Servidor mínimo compatível com a API da OpenAI (POST /v1/chat/completions, GET /v1/models) que serve
DOIS modelos com os mesmos pesos na memória:
  - "smollm2-base"          -> modelo base, com o adapter DESLIGADO (disable_adapter)
  - "smollm2-suporte-lora"  -> base + adapter LoRA do exemplo 03
Assim o código JS de avaliação e o agente do projeto final usam o SDK `openai` sem saber que é local.

Uso (da pasta do módulo): uv run python exemplos/04-avaliacao-ab/servidor_openai.py   (porta 30900)
Só stdlib (http.server): suficiente para estudo; em produção use vLLM (que serve LoRA com --enable-lora).
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "comum"))
from modelo_local import DIR_ADAPTER, carregar_base, gerar  # noqa: E402

from peft import PeftModel  # noqa: E402

PORTA = int(os.environ.get("PORTA", "30900"))
tok, base = carregar_base()
modelo = PeftModel.from_pretrained(base, DIR_ADAPTER)  # adapter de ~4 MB por cima do base
modelo.eval()
MODELOS = {"smollm2-base", "smollm2-suporte-lora"}
trava = Lock()  # um pedido por vez: o modelo não é thread-safe ao ligar/desligar o adapter


def completar(nome: str, messages: list[dict], max_tokens: int) -> str:
    with trava:
        if nome == "smollm2-base":
            with modelo.disable_adapter():
                return gerar(tok, modelo, messages, max_tokens)
        return gerar(tok, modelo, messages, max_tokens)


class Handler(BaseHTTPRequestHandler):
    def _json(self, status: int, corpo: dict) -> None:
        dados = json.dumps(corpo, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def do_GET(self):
        if self.path == "/v1/models":
            return self._json(200, {"object": "list", "data": [{"id": m, "object": "model"} for m in sorted(MODELOS)]})
        if self.path == "/health":
            return self._json(200, {"status": "ok"})
        self._json(404, {"error": {"message": "rota não encontrada"}})

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            return self._json(404, {"error": {"message": "rota não encontrada"}})
        pedido = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))) or b"{}")
        nome = pedido.get("model")
        if nome not in MODELOS:
            return self._json(404, {"error": {"message": f"modelo desconhecido: {nome}"}})
        t0 = time.time()
        texto = completar(nome, pedido["messages"], int(pedido.get("max_tokens") or 8))
        self._json(200, {
            "id": f"chatcmpl-{uuid.uuid4().hex[:12]}", "object": "chat.completion", "created": int(t0), "model": nome,
            "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": texto}}],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},  # não contamos aqui
        })

    def log_message(self, fmt, *args):  # log enxuto em uma linha
        sys.stderr.write(f"[servidor] {self.command} {self.path} {args[1] if len(args) > 1 else ''}\n")


if __name__ == "__main__":
    print(f"servindo {sorted(MODELOS)} em http://localhost:{PORTA}/v1", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORTA), Handler).serve_forever()
