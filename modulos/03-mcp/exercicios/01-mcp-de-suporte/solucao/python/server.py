"""Entrada stdio (para Inspector, Claude Desktop, VS Code...)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from suporte import criar_servidor_suporte  # noqa: E402

if __name__ == "__main__":
    print("[suporte] pronto (stdio)", file=sys.stderr)
    criar_servidor_suporte().run()
