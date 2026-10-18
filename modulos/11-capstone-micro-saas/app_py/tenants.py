"""Multi-tenant simples por API key: cada empresa cliente recebe uma chave; guardamos só o SHA-256."""

import hashlib


def hash_chave(chave: str) -> str:
    return hashlib.sha256(chave.encode()).hexdigest()


async def salvar_tenant(pool, *, id: str, nome: str, api_key: str, plano: str = "free", cota_diaria: int = 50) -> None:
    """Cria/atualiza um tenant (idempotente)."""
    async with pool.connection() as conn:
        await conn.execute(
            """INSERT INTO m11.tenants_py (id, nome, api_key_hash, plano, cota_diaria) VALUES (%(id)s, %(nome)s, %(h)s, %(plano)s, %(cota)s)
               ON CONFLICT (id) DO UPDATE SET nome = %(nome)s, api_key_hash = %(h)s, plano = %(plano)s, cota_diaria = %(cota)s""",
            {"id": id, "nome": nome, "h": hash_chave(api_key), "plano": plano, "cota": cota_diaria},
        )


def criar_autenticador(pool):
    """Autenticador usado pela API e pelo MCP: chave -> tenant (ou None). Consulta por hash (índice UNIQUE)."""

    async def autenticar(api_key: str | None) -> dict | None:
        if not api_key:
            return None
        async with pool.connection() as conn:
            cur = await conn.execute(
                'SELECT id, nome, plano, cota_diaria AS "cotaDiaria" FROM m11.tenants_py WHERE api_key_hash = %s',
                [hash_chave(api_key)],
            )
            return await cur.fetchone()

    return autenticar


# Chaves de DEMONSTRAÇÃO (estudo local): as MESMAS do JS, para a UI Angular e os scripts funcionarem iguais.
# Em produção: gerar com secrets.token_urlsafe e entregar uma vez.
TENANTS_DEMO = [
    {"id": "acme", "nome": "Acme Software", "api_key": "sk-acme-demo", "plano": "pro", "cota_diaria": 200},
    {"id": "padaria", "nome": "Padaria Pão Quente", "api_key": "sk-padaria-demo", "plano": "free", "cota_diaria": 20},
]
