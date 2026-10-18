"""Sobe a aplicação para uso manual: http://127.0.0.1:30550 (UI) e /mcp (MCP, Bearer tok-e2e-demo).
Uso: uv run python exemplos/03-app-com-mcp-e2e/python/server.py   (Ctrl+C para parar)"""

import os
import sys
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).parent))
from app import criar_app  # noqa: E402
from estado import Estado  # noqa: E402

if __name__ == "__main__":
    PORT = int(os.environ.get("PORT", 30550))
    print(f"App de tarefas em http://127.0.0.1:{PORT} (MCP em /mcp)")
    uvicorn.run(criar_app(Estado()), host="127.0.0.1", port=PORT, log_level="warning")
