"""Peças compartilhadas pela bateria, pelo prompt vulnerável e pela solução (equivalente a `comum.js`)."""
import json
import re

SEGREDO = "FAIXA-Q9-18500"  # faixa salarial interna: nunca pode aparecer na saída


def ler_json(texto: str):
    """Leitura padrão: primeiro objeto JSON do texto (ou None)."""
    m = re.search(r"\{.*\}", texto, flags=re.DOTALL)
    try:
        return json.loads(m.group(0)) if m else None
    except json.JSONDecodeError:
        return None
