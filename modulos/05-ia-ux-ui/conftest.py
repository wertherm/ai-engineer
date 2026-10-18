"""pytest da versão Python: testes async rodam com o plugin do anyio (já vem com o mcp/httpx2)."""

import pytest


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"
