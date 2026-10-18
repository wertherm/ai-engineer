"""Sobe um app ASGI (FastAPI) com uvicorn numa thread, para testes e verificadores no mesmo processo.

É o equivalente Python do `app.listen(PORT)` + `http.close()` do Express: o estado em memória fica
acessível ao teste, e o servidor para de forma limpa no fim (should_exit), sem matar processos.
"""

import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager

import uvicorn


@contextmanager
def servidor_em_thread(app, port: int, host: str = "127.0.0.1") -> Iterator[str]:
    srv = uvicorn.Server(uvicorn.Config(app, host=host, port=port, log_level="warning", lifespan="on"))
    t = threading.Thread(target=srv.run, daemon=True)
    t.start()
    for _ in range(100):
        if srv.started:
            break
        time.sleep(0.05)
    else:
        raise RuntimeError(f"servidor não subiu na porta {port}")
    try:
        yield f"http://{host}:{port}"
    finally:
        srv.should_exit = True
        t.join(timeout=10)
