"""Roteiro de uma "conversa" de ChatOps contra o cluster kind, com trilha de auditoria no Postgres (m06).

Para usar interativo: uv run python exemplos/05-chatops-com-aprovacao/python/main.py --interativo
"""
import json
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[2]))  # raiz do módulo (comum_py)
sys.path.insert(0, str(AQUI))
from bot import NS, BotChatOps  # noqa: E402
from comum_py.llm import conectar, resumo_uso  # noqa: E402
from comum_py.shell import kubectl  # noqa: E402

USUARIOS = {"ana": "viewer", "bruno": "dev", "carla": "sre", "diego": "sre"}
IMG_OK = "nginxinc/nginx-unprivileged:1.31.6-alpine"
TABELA = "m06.chatops_auditoria_py"

ROTEIRO = [
    ("ana", "/scale web 3"),  # viewer não pode
    ("bruno", "/scale web 3"),  # dev pede → fica pendente com o diff
    ("bruno", "/aprovar 1"),  # dev não aprova
    ("carla", "/aprovar 1"),  # SRE aprova → executa
    ("carla", "/rollback web"),  # SRE pede um rollback...
    ("carla", "/aprovar 2"),  # ...e tenta aprovar o próprio pedido: four-eyes nega (fica pendente)
    ("bruno", "/deploy web nginxinc/nginx-unprivileged:9.9.9-nao-existe"),
    ("carla", "/aprovar 3"),  # falha 1 → desfeito
    ("bruno", "/deploy web nginxinc/nginx-unprivileged:9.9.8-nao-existe"),
    ("diego", "/aprovar 4"),  # falha 2 → circuito abre
    ("bruno", "/scale web 2"),
    ("carla", "/aprovar 5"),  # bloqueado pelo circuit breaker
    ("ana", "/investigar web"),  # leitura + resumo do LLM
]


def preparar_cluster():
    kubectl(["create", "namespace", NS])
    manifest = f"""apiVersion: apps/v1
kind: Deployment
metadata: {{ name: web, namespace: {NS} }}
spec:
  replicas: 2
  progressDeadlineSeconds: 30
  selector: {{ matchLabels: {{ app: web }} }}
  template:
    metadata: {{ labels: {{ app: web }} }}
    spec:
      containers:
        - name: web
          image: {IMG_OK}
          imagePullPolicy: IfNotPresent
          readinessProbe: {{ httpGet: {{ path: /, port: 8080 }}, periodSeconds: 3 }}
"""
    kubectl(["apply", "-f", "-"], input=manifest)
    kubectl(["-n", NS, "rollout", "status", "deploy/web", "--timeout=90s"])


def imprimir_tabela(linhas, colunas):
    """Equivalente simples do console.table do Node."""
    larg = {c: max(len(c), *(len(str(l[c])) for l in linhas)) for c in colunas}
    print(" │ ".join(c.ljust(larg[c]) for c in colunas))
    print("─┼─".join("─" * larg[c] for c in colunas))
    for l in linhas:
        print(" │ ".join(str(l[c]).ljust(larg[c]) for c in colunas))


def main():
    conn = conectar()
    conn.execute(f"""CREATE TABLE IF NOT EXISTS {TABELA} (
        id serial PRIMARY KEY, ts timestamptz DEFAULT now(), usuario text, papel text,
        comando text, decisao text, detalhe text)""")
    conn.execute(f"TRUNCATE {TABELA}")

    # Trilha append-only: o bot só faz INSERT. (Em produção: role sem UPDATE/DELETE nesta tabela.)
    def auditar(r):
        conn.execute(f"INSERT INTO {TABELA} (usuario, papel, comando, decisao, detalhe) VALUES (%s,%s,%s,%s,%s)",
                     (r["usuario"], r["papel"], r["comando"], r["decisao"], r["detalhe"][:300]))

    preparar_cluster()
    bot = BotChatOps(USUARIOS, auditar)

    if "--interativo" in sys.argv:
        print(f"Usuários: {json.dumps(USUARIOS)}. Formato: <usuario> /comando args (Ctrl+D sai)")
        for linha in sys.stdin:
            u, *resto = linha.strip().split() or [""]
            if u and resto:
                print(bot.receber(u, " ".join(resto)), flush=True)
    else:
        for u, texto in ROTEIRO:
            print(f"{u:<5} › {texto}", flush=True)
            print(f"  bot › {bot.receber(u, texto)}", flush=True)

    cur = conn.execute(f"SELECT id, usuario, decisao, left(detalhe, 70) AS detalhe FROM {TABELA} ORDER BY id")
    colunas = [d.name for d in cur.description]
    linhas = [dict(zip(colunas, row)) for row in cur.fetchall()]
    print(f"\nTrilha de auditoria ({TABELA}):")
    imprimir_tabela(linhas, colunas)
    img = kubectl(["-n", NS, "get", "deploy", "web", "-o",
                   "jsonpath={.spec.replicas} réplicas · {.spec.template.spec.containers[0].image}"])
    print(f"Estado final do web: {img['stdout']}")

    if "--manter" not in sys.argv:
        kubectl(["delete", "namespace", NS, "--wait=false"])
    conn.close()
    print(resumo_uso())


if __name__ == "__main__":
    main()
