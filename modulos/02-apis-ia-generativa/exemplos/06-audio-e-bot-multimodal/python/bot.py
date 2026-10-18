"""Bot multimodal (versão Python de bot.js): aceita texto, imagem ou áudio e responde em texto.

Roteamento por modalidade, do mais barato para o mais caro:
  texto  → direto para o LLM
  áudio  → Whisper local transcreve → vira texto (o LLM nunca "ouve")
  imagem → LLM com visão (a imagem vai em base64 junto da pergunta)
Uso: python bot.py <arquivo.wav|arquivo.png|"texto"> ["pergunta sobre a imagem"]
"""

import base64
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[2]))  # raiz do módulo, para importar comum_py
sys.path.insert(0, str(AQUI.parents[1] / "03-rag-langchain-observabilidade" / "python"))  # corpus.py
from comum_py.config import MODELO_CHAT, PADRAO, criar_cliente
from corpus import DOCUMENTOS
from transcrever import transcrever

entrada = sys.argv[1] if len(sys.argv) > 1 else str(AQUI.parent / "pergunta.wav")
pergunta_imagem = sys.argv[2] if len(sys.argv) > 2 else "O que é este documento? Responda em 1 frase."
cliente = criar_cliente()

# Base pequena (6 políticas) cabe inteira no prompt: aqui RAG seria exagero.
SYSTEM = (
    "Você é o assistente da Loja Exemplo. Responda em 1 frase, usando as políticas abaixo quando forem relevantes.\n"
    + "\n".join(d["texto"] for d in DOCUMENTOS)
)
MIMES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


def modalidade(x: str) -> str:
    p = Path(x)
    if not p.is_file():
        return "texto"
    if p.suffix.lower() == ".wav":
        return "audio"
    if p.suffix.lower() in MIMES:
        return "imagem"
    raise ValueError(f"Extensão não suportada: {p.suffix}")


tipo = modalidade(entrada)
t = time.perf_counter()
if tipo == "texto":
    conteudo = entrada
elif tipo == "audio":
    conteudo = transcrever(entrada)
    print(f"[áudio → texto em {time.perf_counter() - t:.1f} s] {conteudo}")
else:
    b64 = base64.b64encode(Path(entrada).read_bytes()).decode()
    conteudo = [
        {"type": "text", "text": pergunta_imagem},
        {"type": "image_url", "image_url": {"url": f"data:{MIMES[Path(entrada).suffix.lower()]};base64,{b64}"}},
    ]
    print(f'[imagem] {Path(entrada).name} + "{pergunta_imagem}"')

r = cliente.chat.completions.create(
    **PADRAO,
    model=MODELO_CHAT,
    max_tokens=70,
    messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": conteudo}],
)
print(f"[{tipo}] resposta ({time.perf_counter() - t:.1f} s, {r.usage.prompt_tokens} tokens de entrada): {r.choices[0].message.content.strip()}")
