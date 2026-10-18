"""Solução do exercício 02 (Python) — medir o RETRIEVAL do RAG com chunking e top-k diferentes.

Só usa embeddings (sem o LLM gerar texto): rápido e determinístico. Tabela m01.chunks_py, coleções ex02-*.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))  # raiz do módulo, para importar comum_py
from comum_py.rag import buscar, chunk_por_paragrafo, conectar, indexar, ler_corpus

CORPUS = Path(__file__).resolve().parents[4] / "exemplos" / "05-primeiro-rag" / "corpus"


def janela160(doc: dict) -> list[dict]:
    """Janela fixa de 160 caracteres com sobreposição de 40 (passo 120), SEM título: corta frases no meio."""
    corpo = re.sub(r"\s+", " ", " ".join(doc["texto"].split("\n")[1:])).strip()
    return [{"fonte": doc["fonte"], "conteudo": corpo[i : i + 160]} for i in range(0, len(corpo), 120)]


ESTRATEGIAS = {
    # Documento inteiro: nunca corta a resposta, mas manda texto demais para o LLM (custo + ruído).
    "documento": lambda doc: [{"fonte": doc["fonte"], "conteudo": doc["texto"]}],
    "paragrafo": chunk_por_paragrafo,  # parágrafo + título (a do exemplo 05)
    "janela160": janela160,
}

# Pergunta -> trecho que PRECISA aparecer no contexto recuperado (perguntas com palavras diferentes do texto).
AVALIACAO = [
    ("Quanto posso gastar por dia com comida numa viagem a trabalho?", "R$ 90"),
    ("Posso tirar férias na semana antes do Natal?", "24 de dezembro"),
    ("Com quanto tempo de antecedência peço férias?", "45 dias"),
    ("Posso subir código para produção na sexta à tarde?", "congelamento"),
    ("Como desfaço um deploy que deu errado?", "esteira rollback"),
    ("A loja caiu, em quanto tempo precisa ter a sala de guerra?", "15 minutos"),
    ("Quanto ganho a mais por estar de sobreaviso?", "20%"),
    ("Quando a máquina de café fica fora de uso?", "sexta às 17h"),
    ("Quando recebo acesso ao ambiente de produção?", "90 dias"),
    ("Tem leite sem lactose para o café?", "aveia"),
]

with conectar() as db:
    docs = ler_corpus(CORPUS)
    print(f"{'chunking':<10} {'chunks':>6} {'k':>2} {'hit@k':>6} {'MRR':>5} {'contexto médio (chars)':>23}")
    for nome, fn in ESTRATEGIAS.items():
        colecao = f"ex02-{nome}"
        n = indexar(db, colecao, [c for d in docs for c in fn(d)])
        for k in (1, 3):
            hits, rr_soma, chars = 0, 0.0, 0
            for q, resposta in AVALIACAO:
                top = buscar(db, colecao, q, k)
                # posição (1-based) do primeiro chunk que contém a resposta; 0 se nenhum contém
                pos = next((i for i, t in enumerate(top, 1) if resposta in t["conteudo"]), 0)
                if pos:
                    hits += 1
                    rr_soma += 1 / pos
                chars += sum(len(t["conteudo"]) for t in top)
            # int(x + 0.5) e não round(): round() do Python arredonda 150.5 para 150 (banker's rounding);
            # Math.round do JS dá 151. Assim a tabela bate com a do JS.
            print(f"{nome:<10} {n:>6} {k:>2} {f'{hits}/{len(AVALIACAO)}':>6} "
                  f"{rr_soma / len(AVALIACAO):>5.2f} {int(chars / len(AVALIACAO) + 0.5):>23}")
print("hit@k = a resposta estava em algum dos k trechos | MRR = média de 1/posição do 1º trecho certo")
