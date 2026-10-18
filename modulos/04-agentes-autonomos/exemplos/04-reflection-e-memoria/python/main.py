"""Reflection + memória em duas execuções (dois processos diferentes, nada em RAM entre eles):
  python main.py 1  -> responde, se AUTOAVALIA (crítico), corrige e grava memória longa + episódica
  python main.py 2  -> outra tarefa parecida: recupera memórias por embedding e já acerta de primeira"""

import sys

from comum_py.llm import chat, conectar, extrair_json, js, resumo_uso
from memoria import lembrar, preparar_tabela, recuperar

sessao = sys.argv[1] if len(sys.argv) > 1 else "1"
conn = conectar()
preparar_tabela(conn, zerar=sessao == "1")

CRITERIOS = 'no máximo 50 palavras; em tópicos começando com "- "; cita Postgres'


def responder(tarefa: str, memorias: list[dict]) -> str:
    # Memória contextual: o que foi recuperado entra no system prompt DESTA chamada (memória curta).
    contexto = ("\nMemórias relevantes:\n" + "\n".join(f"- ({m['tipo']}) {m['conteudo']}" for m in memorias)) if memorias else ""
    r = chat([{"role": "system", "content": f"Você é um assistente técnico. Responda em português.{contexto}"},
              {"role": "user", "content": tarefa}], max_tokens=120)
    return r.msg["content"].strip()


def criticar(resposta: str) -> dict:
    """Reflection: um "crítico" (o mesmo LLM com outro papel) avalia a resposta contra critérios explícitos."""
    r = chat([{"role": "system", "content": f'Você é um revisor rigoroso. Critérios: {CRITERIOS}. '
                                            'Devolva só JSON {"aprovado": true|false, "problemas": ["..."]}.'},
              {"role": "user", "content": resposta}], max_tokens=80)
    veredito = extrair_json(r.msg.get("content"))
    # Checagem determinística complementar: o LLM é bom crítico de estilo, ruim em contar palavras.
    palavras = len(resposta.split())
    if palavras > 50:
        veredito["aprovado"] = False
        veredito["problemas"] = [*veredito.get("problemas", []), f"tem {palavras} palavras (máx. 50)"]
    return veredito


def revisar(resposta: str, problemas: list[str]) -> str:
    r = chat([{"role": "system", "content": f"Reescreva a resposta corrigindo os problemas. Critérios: {CRITERIOS}."},
              {"role": "user", "content": f"Resposta:\n{resposta}\n\nProblemas: {'; '.join(problemas)}"}], max_tokens=100)
    return r.msg["content"].strip()


if sessao == "1":
    lembrar(conn, "longa", "O usuário prefere respostas curtas, em tópicos, e usa Python com Postgres.")
    tarefa = "Como devo guardar os logs de execução de um agente?"
    print(f"[sessão 1] tarefa: {tarefa}")
    resposta = responder(tarefa, [])  # de propósito sem memória: é o "primeiro dia"
    print(f"\n[rascunho]\n{resposta}")
    v = criticar(resposta)
    print(f"\n[crítica] aprovado={v['aprovado']} problemas={js(v.get('problemas', []))}")
    if not v["aprovado"]:
        resposta = revisar(resposta, v["problemas"])
        print(f"\n[revisada]\n{resposta}")
        v2 = criticar(resposta)
        print(f"\n[crítica 2] aprovado={v2['aprovado']} problemas={js(v2.get('problemas', []))}")
    # Memória episódica: a lição da reflexão vira conhecimento para execuções futuras.
    situacao = "aprovado" if v["aprovado"] else f"reprovado ({'; '.join(v['problemas'])})"
    licao = f'Episódio "{tarefa}": o rascunho foi {situacao}. Lição: responder {CRITERIOS}.'
    lembrar(conn, "episodica", licao)
    print(f"\n[memória gravada] {licao}")
else:
    tarefa = "Onde guardo o histórico de decisões dos meus agentes?"
    print(f"[sessão 2] tarefa: {tarefa}")
    memorias = recuperar(conn, tarefa)
    print("\n[memórias recuperadas por embedding]")
    for m in memorias:
        print(f"  {m['tipo']:<10} {m['distancia']}  {m['conteudo'][:60]}...")
    resposta = responder(tarefa, memorias)
    print(f"\n[resposta já com memória]\n{resposta}")
    v = criticar(resposta)
    print(f"\n[crítica] aprovado={v['aprovado']} problemas={js(v.get('problemas', []))}")

contagem = conn.execute("SELECT tipo, count(*)::int FROM m04.memorias_py GROUP BY tipo ORDER BY tipo").fetchall()
print("\nMemórias no banco:", ", ".join(f"{t}={n}" for t, n in contagem), "·", resumo_uso())
conn.close()
