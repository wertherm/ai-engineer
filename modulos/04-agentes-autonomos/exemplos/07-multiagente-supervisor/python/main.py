"""Mini sistema cooperativo: analista -> planejador -> executor, coordenado por um supervisor, com troca de
mensagens assíncrona. Os quatro agentes rodam concorrentemente (asyncio.gather)."""

import asyncio
import json
import sys

from agentes import analista, executor, planejador, supervisor
from barramento import Barramento
from comum_py.llm import resumo_uso


async def main() -> None:
    pedido = sys.argv[1] if len(sys.argv) > 1 else "Organize um café da manhã para 12 pessoas na sexta, com orçamento de R$ 150."
    print(f"Pedido: {pedido}\n\nMensagens:")
    bus = Barramento()
    final, *_ = await asyncio.gather(supervisor(bus, pedido), analista(bus), planejador(bus), executor(bus))
    print("\nResultado:", json.dumps(final, ensure_ascii=False, indent=2))
    print(f"\n{len(bus.historico)} mensagens trocadas · {resumo_uso()}")


if __name__ == "__main__":
    asyncio.run(main())
