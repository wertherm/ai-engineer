"""Exemplo 05 (Python, parte 2) — Pergunta: busca semântica (retrieval) + geração aumentada (generation).

Uso: uv run python exemplos/05-primeiro-rag/python/perguntar.py "sua pergunta" [--sem-rag]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo, para importar comum_py
from comum_py.llm import chat
from comum_py.rag import buscar, conectar

args = [a for a in sys.argv[1:] if not a.startswith("--")]
pergunta = args[0] if args else "Até quando posso pedir reembolso de um almoço de viagem e qual o limite?"
comparar_sem_rag = "--sem-rag" in sys.argv
K = 3

with conectar() as db:
    # 1) RETRIEVAL: os K trechos mais parecidos (em significado, não em palavras) com a pergunta
    trechos = buscar(db, "paragrafo", pergunta, K)
print(f"Pergunta: {pergunta}\n\nTop-{K} trechos (similaridade de cosseno):")
for i, t in enumerate(trechos, 1):
    print(f"  [{i}] {t['similaridade']:.3f} {t['fonte']} — {t['conteudo'][:80]}...")

# 2) AUGMENTED: o prompt carrega o contexto e regras de "não invente"
contexto = "\n".join(f"[{i}] ({t['fonte']}) {t['conteudo']}" for i, t in enumerate(trechos, 1))
mensagens = [
    {
        "role": "system",
        "content": "Responda em português, em no máximo 2 frases, usando SOMENTE o contexto. "
        'Cite as fontes como [1], [2]. Se o contexto não tiver a resposta, diga "não sei".',
    },
    {"role": "user", "content": f"Contexto:\n{contexto}\n\nPergunta: {pergunta}"},
]

# 3) GENERATION
r = chat(mensagens, max_tokens=90)
print(f"\nResposta COM RAG ({r.ms / 1000:.1f}s, {r.prompt_tokens} tokens de entrada):\n{r.texto}")

if comparar_sem_rag:
    s = chat([{"role": "user", "content": f"Responda em no máximo 2 frases. {pergunta}"}], max_tokens=90)
    print(f"\nResposta SEM RAG (o modelo não conhece a Café Byte):\n{s.texto}")
