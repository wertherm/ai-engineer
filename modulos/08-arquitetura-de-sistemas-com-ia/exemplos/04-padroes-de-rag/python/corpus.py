"""Corpus pequeno com DOIS índices (políticas internas × produtos) e perguntas com gabarito.

Mesmo corpus e mesmas perguntas do JS (corpus.js), para o recall@k ser comparável. Metade das perguntas é
paráfrase (busca vetorial brilha) e metade cita códigos quase iguais (CCB-77 × CCB-78, POL-SEC-14 × 15).
"""

import psycopg

from comum_py.llm import embed, vetor

INDICES = {
    "politicas": "Políticas internas para colaboradores: RH, férias, viagens, segurança da informação, TI, trabalho remoto",
    "produtos": "Produtos financeiros para clientes: antecipação de recebíveis, crédito, tarifas, CCB, liquidação",
}

DOCS = [
    ("p1", "politicas", "Reembolso de despesas de viagem: o colaborador tem 30 dias para enviar as notas fiscais pelo portal."),
    ("p2", "politicas", "Trabalho remoto é permitido até 3 dias por semana, com aprovação do gestor direto."),
    ("p3", "politicas", "Política POL-SEC-14: senhas com no mínimo 14 caracteres e troca obrigatória a cada 90 dias."),
    ("p7", "politicas", "Política POL-SEC-15: notebooks corporativos com disco criptografado e bloqueio de tela em 5 minutos."),
    ("p4", "politicas", "Férias devem ser solicitadas com 45 dias de antecedência no sistema de RH."),
    ("p5", "politicas", "Uso de IA generativa: é proibido colar dados de clientes em ferramentas externas sem anonimizar."),
    ("p6", "politicas", "O suporte de TI atende das 8h às 18h em dias úteis."),
    ("d1", "produtos", "Antecipação de recebíveis: o lojista recebe hoje as vendas parceladas no cartão, com taxa a partir de 1,9% ao mês."),
    ("d2", "produtos", "CCB-77 (Cédula de Crédito Bancário): prazo de 6 a 48 meses, indexada ao CDI."),
    ("d7", "produtos", "CCB-78 (Cédula de Crédito Bancário): prazo de 12 a 60 meses, com taxa prefixada."),
    ("d3", "produtos", "Tarifa TAC-02 de cadastro: cobrada uma única vez na abertura da operação, valor de R$ 150."),
    ("d4", "produtos", "Recebível chipado: cada parcela ganha um identificador único registrado em blockchain, o que impede a dupla cessão."),
    ("d5", "produtos", "O limite de crédito é revisado a cada trimestre com base no faturamento dos últimos 12 meses."),
    ("d6", "produtos", "A liquidação da antecipação ocorre em D+1 útil na conta bancária cadastrada do lojista."),
]

PERGUNTAS = [
    ("Quanto tempo tenho para mandar as notas de uma viagem a trabalho?", "p1"),
    ("Posso trabalhar de casa?", "p2"),
    ("O que diz a POL-SEC-14?", "p3"),
    ("Posso usar o ChatGPT com informações de clientes?", "p5"),
    ("Qual o prazo da CCB-77?", "d2"),
    ("Quanto custa a TAC-02?", "d3"),
    ("Qual o prazo da CCB-78?", "d7"),
    ("O que exige a POL-SEC-15?", "p7"),
    ("Como evitar que a mesma parcela seja vendida duas vezes?", "d4"),
    ("Quando o dinheiro antecipado cai na conta?", "d6"),
]


def com_instrucao(q: str) -> str:
    """O qwen3-embedding foi treinado com instrução na CONSULTA (não no documento): busca assimétrica."""
    return f"Instruct: Given a question, retrieve passages that answer it\nQuery: {q}"


def indexar(conn: psycopg.Connection) -> None:
    """Cria m08.rag_docs_py (vetor + tsvector gerado) e indexa o corpus. Idempotente."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS m08.rag_docs_py (
          id text PRIMARY KEY, indice text NOT NULL, texto text NOT NULL, emb vector(1024) NOT NULL,
          tsv tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', texto)) STORED);
        CREATE INDEX IF NOT EXISTS rag_docs_py_tsv ON m08.rag_docs_py USING gin (tsv);""")
    if conn.execute("SELECT count(*) FROM m08.rag_docs_py").fetchone()[0] == len(DOCS):
        return
    embs = embed([texto for _, _, texto in DOCS])
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO m08.rag_docs_py (id, indice, texto, emb) VALUES (%s, %s, %s, %s)
               ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, emb = EXCLUDED.emb, indice = EXCLUDED.indice""",
            [(id_, indice, texto, vetor(e)) for (id_, indice, texto), e in zip(DOCS, embs)],
        )
