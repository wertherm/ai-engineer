"""Solução do exercício 02 (Python): alerta → RAG de runbooks (pgvector) → verificação → mitigação com allowlist,
dry-run e aprovação humana → validação → timeline → post-mortem blameless (LLM) → lição volta ao índice.

Usa os MESMOS runbooks da solução JS (`solucao/runbooks/`); tabelas m06.runbooks_py e m06.postmortems_py.
"""
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[3]))  # raiz do módulo (comum_py)
from comum_py.llm import chat, conectar, embed, resumo_uso  # noqa: E402
from comum_py.shell import kubectl  # noqa: E402

NS = "m06py-runbook"
APP = "relatorios"
RUNBOOKS = AQUI.parent / "runbooks"
SCORE_MINIMO = 0.5  # abaixo disto o agente não executa nada: escala para humano
# Allowlist de verbos que a automação pode executar. `delete` fica de fora de propósito.
VERBOS_PERMITIDOS = {"get", "describe", "logs", "set", "rollout", "scale"}
VERBOS_MUTANTES = {"set", "scale", "rollout"}

timeline = []


def marcar(evento):
    hora = datetime.now(timezone.utc).strftime("%H:%M:%S")  # mesmo relógio (UTC) do toISOString do JS
    timeline.append(f"{hora} {evento}")
    print(f"[{hora}] {evento}", flush=True)


def parse_runbook(md):
    """Divide o Markdown em seções "## Título" e extrai os comandos dos blocos ```bash."""
    titulo = re.search(r"^# (.+)$", md, re.M).group(1)
    secoes = {}
    for bloco in re.split(r"^## ", md, flags=re.M)[1:]:
        cab, _, corpo = bloco.partition("\n")
        comandos = [l for m in re.findall(r"```bash\n([\s\S]*?)```", corpo) for l in m.strip().split("\n")]
        secoes[cab.strip()] = {"texto": re.sub(r"```bash[\s\S]*?```", "", corpo).strip(), "comandos": comandos}
    return {"titulo": titulo, "secoes": secoes}


def indexar(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS m06.runbooks_py (
        arquivo text PRIMARY KEY, titulo text, conteudo text, embedding vector(1024))""")
    conn.execute("""CREATE TABLE IF NOT EXISTS m06.postmortems_py (
        id serial PRIMARY KEY, ts timestamptz DEFAULT now(), alerta text, app text, conteudo text, embedding vector(1024))""")
    docs = [(f.name, f.read_text()) for f in sorted(RUNBOOKS.glob("*.md"))]
    # Indexamos título + Sintoma: é contra o sintoma que o alerta precisa casar (não contra os comandos).
    textos = []
    for _, md in docs:
        r = parse_runbook(md)
        textos.append(f"{r['titulo']}\n{r['secoes']['Sintoma']['texto']}")
    vetores = embed(textos)
    for (f, md), v in zip(docs, vetores):
        conn.execute("""INSERT INTO m06.runbooks_py VALUES (%s,%s,%s,%s)
            ON CONFLICT (arquivo) DO UPDATE SET titulo=EXCLUDED.titulo, conteudo=EXCLUDED.conteudo, embedding=EXCLUDED.embedding""",
                     (f, parse_runbook(md)["titulo"], md, v))
    return len(docs)


def preparar_comando(linha, vars):
    """Converte a linha do runbook em argv, valida allowlist/namespace e preenche as variáveis conhecidas."""
    preenchida = re.sub(r"\{\{(\w+)\}\}", lambda m: vars.get(m.group(1), m.group(0)), linha)
    argv = preenchida.split()
    if argv[0] != "kubectl":
        return {"erro": f"não é kubectl: {argv[0]}"}
    if "{{" in preenchida:
        return {"erro": f"variável sem valor em: {preenchida}"}
    if len(argv) < 4 or argv[1] != "-n" or argv[2] != vars["namespace"]:
        return {"erro": "comando fora do namespace do alerta"}
    verbo = argv[3]
    if verbo not in VERBOS_PERMITIDOS:
        return {"erro": f'verbo "{verbo}" fora da allowlist'}
    return {"argv": argv[1:], "texto": preenchida, "mutante": verbo in VERBOS_MUTANTES and argv[4:5] != ["status"]}


def aprovar(descricao):
    if "--auto-aprovar" in sys.argv:
        return True, "aprovação simulada (--auto-aprovar)"
    resp = input(f'Aprovar "{descricao}"? [s/N] ')
    return resp.strip().lower() == "s", "operador no terminal"


def preparar_incidente():
    kubectl(["create", "namespace", NS])
    # Carga que precisa de ~50 MB com limite de 32Mi: vai morrer por OOM até alguém subir o limite.
    manifest = f"""apiVersion: apps/v1
kind: Deployment
metadata: {{ name: {APP}, namespace: {NS} }}
spec:
  replicas: 1
  selector: {{ matchLabels: {{ app: {APP} }} }}
  template:
    metadata: {{ labels: {{ app: {APP} }} }}
    spec:
      containers:
        - name: {APP}
          image: curlimages/curl:8.17.0
          imagePullPolicy: IfNotPresent
          command: ["sh", "-c", "head -c 50m /dev/zero | tail > /dev/null; echo relatorio pronto; sleep 3600"]
          resources: {{ requests: {{ memory: 16Mi }}, limits: {{ memory: 32Mi }} }}
"""
    kubectl(["apply", "-f", "-"], input=manifest)
    # Espera o primeiro OOMKilled acontecer de verdade.
    for _ in range(30):
        r = kubectl(["-n", NS, "get", "pods", "-l", f"app={APP}", "-o", "jsonpath={..lastState.terminated.reason}"])
        if "OOMKilled" in r["stdout"]:
            return
        time.sleep(3)
    raise RuntimeError("o cenário não gerou OOMKilled em 90 s")


def motivo_termino():
    return kubectl(["-n", NS, "get", "pods", "-l", f"app={APP}", "-o", "jsonpath={..lastState.terminated.reason}"])["stdout"]


def main():
    conn = conectar()
    print(f"Runbooks indexados: {indexar(conn)}", flush=True)
    preparar_incidente()

    # 1. Alerta (como chegaria do Alertmanager).
    alerta = {"alertname": "KubePodCrashLooping", "namespace": NS, "app": APP,
              "descricao": "container relatorios reiniciando repetidamente; último término com exit code 137"}
    marcar(f"ALERTA {alerta['alertname']} em {NS}/{APP}: {alerta['descricao']}")

    # 2. RAG: recupera o runbook mais parecido com o alerta (1 - distância de cosseno = similaridade).
    [q] = embed([f"{alerta['alertname']} {alerta['descricao']}"])
    rows = conn.execute("""SELECT arquivo, titulo, conteudo, 1 - (embedding <=> %s) AS score
        FROM m06.runbooks_py ORDER BY embedding <=> %s LIMIT 3""", (q, q)).fetchall()
    for arquivo, _, _, score in rows:
        print(f"   candidato {score:.3f} · {arquivo}")
    # Post-mortens de incidentes parecidos (gerados em execuções anteriores) entram como contexto.
    for pid, pal, pscore in conn.execute("""SELECT id, alerta, 1 - (embedding <=> %s) AS score FROM m06.postmortems_py
        ORDER BY embedding <=> %s LIMIT 1""", (q, q)).fetchall():
        print(f"   post-mortem anterior relacionado: #{pid} {pal} (score {pscore:.3f})")
    arquivo, _, conteudo, score = rows[0]
    if score < SCORE_MINIMO:
        marcar(f"nenhum runbook confiável (score {score:.2f}): escalado para o plantão")
        return
    marcar(f"runbook escolhido: {arquivo} (score {score:.3f})")
    rb = parse_runbook(conteudo)
    vars = {"namespace": alerta["namespace"], "app": alerta["app"]}

    # 3. Verificação: o sintoma é mesmo o do runbook? (checagem determinística, não opinião do LLM)
    for linha in rb["secoes"]["Diagnóstico"]["comandos"]:
        c = preparar_comando(linha, vars)
        if "erro" in c:
            marcar(f"comando de diagnóstico bloqueado pelo guardrail: {c['erro']}")
            return
        r = kubectl(c["argv"])
        saida = "\n     ".join(r["stdout"].strip().split("\n"))
        print(f"   $ {c['texto']}\n     {saida}")
    motivo = motivo_termino()
    if "oom" in arquivo and "OOMKilled" not in motivo:
        marcar("verificação NÃO confirmou o sintoma: escalado")
        return
    marcar(f"verificação confirmou: lastState.terminated.reason={motivo}")

    # 4. Mitigação: allowlist → dry-run no servidor → aprovação humana → execução.
    for linha in rb["secoes"]["Mitigação"]["comandos"]:
        c = preparar_comando(linha, vars)
        if "erro" in c:
            marcar(f"comando bloqueado pelo guardrail: {c['erro']}")
            return
        dry = kubectl([*c["argv"], "--dry-run=server"])
        if not dry["ok"]:
            marcar(f"dry-run falhou: {dry['stderr'].strip()}")
            return
        marcar(f"dry-run ok: {dry['stdout'].strip()}")
        ok, quem = aprovar(c["texto"])
        if not ok:
            marcar("mitigação NEGADA pelo aprovador")
            return
        marcar(f"aprovado por {quem}")
        r = kubectl(c["argv"])
        marcar(f"MITIGAÇÃO executada: {c['texto']} → {r['stdout'].strip() or r['stderr'].strip()}")

    # 5. Validação: comandos do runbook + checagem extra de que não houve novo OOM.
    for linha in rb["secoes"]["Validação"]["comandos"]:
        c = preparar_comando(linha, vars)
        r = kubectl(c["argv"])
        marcar(f"validação \"{' '.join(c['texto'].split(' ')[3:5])}\": {'ok' if r['ok'] else 'FALHOU'} ({r['stdout'].strip().split(chr(10))[-1]})")
    time.sleep(20)
    estado = kubectl(["-n", NS, "get", "pods", "-l", f"app={APP}", "-o",
                      "jsonpath={.items[0].status.containerStatuses[0].restartCount} restarts · estado={.items[0].status.containerStatuses[0].state}"])["stdout"]
    logs = kubectl(["-n", NS, "logs", f"deploy/{APP}", "--tail=1"])["stdout"].strip()
    marcar(f"pós-mitigação (20 s depois): {'container rodando' if 'running' in estado else estado} · log: \"{logs}\"")

    # 6. Post-mortem blameless a partir da timeline (o LLM redige; os fatos vêm do log do agente).
    #    Timeline anexada pelo código, regra "a confirmar" e checagem de finish_reason (lições da versão JS).
    linhas_tl = "\n".join(timeline)
    msg, ms, finish = chat([
        {"role": "system", "content": "Escreva um post-mortem BLAMELESS em Markdown, em português, com as seções: Resumo, Impacto, "
         "Causa raiz, O que funcionou, Ações de acompanhamento (com dono sugerido), Lições aprendidas. NÃO escreva a timeline "
         "(ela será anexada). Foque em sistemas e processos, nunca em pessoas. Use só os fatos dados; o que não estiver "
         'nos fatos, escreva "a confirmar". Máximo de 3 itens por seção.'},
        {"role": "user", "content": f"Serviço: deployment {APP} no namespace {NS} (ambiente de laboratório).\n"
         f"Runbook usado: {rb['titulo']}\nTimeline:\n{linhas_tl}"},
    ], max_tokens=700)
    if finish == "length":
        print("⚠️ post-mortem cortado pelo max_tokens: aumente o limite")
    tl_md = "\n".join(f"- {t}" for t in timeline)
    conteudo_pm = f"{(msg.content or '').strip()}\n\n## Timeline (gerada pelo agente)\n\n{tl_md}\n"
    saida = AQUI / "saida"
    saida.mkdir(exist_ok=True)
    (saida / "postmortem.md").write_text(conteudo_pm)
    print(f"\n--- post-mortem ({ms / 1000:.0f}s) → solucao/python/saida/postmortem.md ---\n{conteudo_pm.strip()}\n---")

    # 7. Lições aprendidas voltam para a base: o próximo incidente parecido recupera este post-mortem.
    #    Tabela separada dos runbooks: post-mortem é contexto para humanos, não roteiro executável.
    [vp] = embed([f"Post-mortem {alerta['alertname']} {APP}: {conteudo_pm[:800]}"])
    conn.execute("INSERT INTO m06.postmortems_py (alerta, app, conteudo, embedding) VALUES (%s,%s,%s,%s)",
                 (alerta["alertname"], APP, conteudo_pm, vp))
    print("Post-mortem indexado em m06.postmortems_py.")

    if "--manter" not in sys.argv:
        kubectl(["delete", "namespace", NS, "--wait=false"])
    conn.close()
    print(resumo_uso())


if __name__ == "__main__":
    main()
