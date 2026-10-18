"""Núcleo do bot de ChatOps, independente de Slack/Discord/Teams: recebe (usuário, texto) e devolve a resposta.

O adaptador de cada plataforma só traduz eventos → bot.receber() → mensagem.
"""
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo (comum_py)
from comum_py.llm import chat  # noqa: E402
from comum_py.shell import kubectl  # noqa: E402

NS = "m06py-chatops"

# RBAC: papel → comandos permitidos. Quem pode APROVAR é uma permissão separada.
PAPEIS = {
    "viewer": {"comandos": ["investigar"], "aprova": False},
    "dev": {"comandos": ["investigar", "scale", "deploy"], "aprova": False},
    "sre": {"comandos": ["investigar", "scale", "deploy", "rollback"], "aprova": True},
}
# Comandos que mudam o cluster precisam de aprovação humana de OUTRA pessoa (four-eyes).
CRITICOS = {"scale", "deploy", "rollback"}


class BotChatOps:
    def __init__(self, usuarios, auditar, limite_falhas=2, pausa_s=120, max_acoes_por_min=3):
        self.usuarios = usuarios  # {nome: papel}
        self.auditar = auditar  # função(registro: dict)
        self.pendentes = {}
        self.seq = 0
        # Circuit breaker: N falhas seguidas abrem o circuito e bloqueiam mutações por um tempo.
        self.cb = {"falhas": 0, "limite": limite_falhas, "aberto_ate": 0.0, "pausa_s": pausa_s}
        self.acoes = []  # instantes (monotonic) das execuções (rate limit)
        self.max_acoes_por_min = max_acoes_por_min

    def receber(self, usuario, texto):
        papel = self.usuarios.get(usuario)
        cmd_bruto, *args = texto.strip().split()
        cmd = cmd_bruto.removeprefix("/")

        def registrar(decisao, detalhe=""):
            self.auditar({"usuario": usuario, "papel": papel or "-", "comando": texto, "decisao": decisao, "detalhe": detalhe})

        if not papel:
            registrar("negado", "usuário desconhecido")
            return "⛔ usuário sem papel no RBAC"
        if cmd == "aprovar":
            return self.aprovar(usuario, papel, int(args[0]) if args and args[0].isdigit() else -1, registrar)
        if cmd not in PAPEIS[papel]["comandos"]:
            registrar("negado", f"papel {papel} não pode /{cmd}")
            return f'⛔ RBAC: papel "{papel}" não pode usar /{cmd}'
        if cmd == "investigar":
            return self.investigar(args[0] if args else "", registrar)

        # Comando crítico: monta a ação, mostra o impacto (dry-run + diff) e fica pendente de aprovação.
        acao = montar_acao(cmd, args)
        if "erro" in acao:
            registrar("invalido", acao["erro"])
            return f"⚠️ {acao['erro']}"
        impacto = analisar_impacto(acao)
        if not impacto["ok"]:
            registrar("invalido", impacto["texto"])
            return f"⚠️ dry-run falhou: {impacto['texto']}"
        self.seq += 1
        self.pendentes[self.seq] = {**acao, "solicitante": usuario}
        registrar("pendente", f"#{self.seq} {impacto['texto']}")
        return f"📝 #{self.seq} aguardando aprovação de um SRE (outra pessoa). Impacto (dry-run): {impacto['texto']}"

    def aprovar(self, usuario, papel, id, registrar):
        p = self.pendentes.get(id)
        if not p:
            return f"⚠️ pedido #{id} não existe"
        if not PAPEIS[papel]["aprova"]:
            registrar("negado", f"#{id}: papel {papel} não aprova")
            return f'⛔ papel "{papel}" não aprova'
        if p["solicitante"] == usuario:
            registrar("negado", f"#{id}: autoaprovação")
            return "⛔ four-eyes: quem pede não aprova"

        # Guardrails de execução: circuito aberto e rate limit valem mesmo com aprovação.
        agora = time.monotonic()
        if agora < self.cb["aberto_ate"]:
            registrar("bloqueado", f"#{id}: circuit breaker aberto")
            return f"🔌 circuit breaker ABERTO após {self.cb['limite']} falhas seguidas: mutações suspensas, investigue antes"
        self.acoes = [t for t in self.acoes if agora - t < 60]
        if len(self.acoes) >= self.max_acoes_por_min:
            registrar("bloqueado", "rate limit")
            return "🐢 rate limit: muitas ações no último minuto"
        self.acoes.append(agora)
        del self.pendentes[id]

        r = executar(p)
        self.cb["falhas"] = 0 if r["ok"] else self.cb["falhas"] + 1
        if self.cb["falhas"] >= self.cb["limite"]:
            self.cb["aberto_ate"] = time.monotonic() + self.cb["pausa_s"]
        registrar("executado" if r["ok"] else "falhou", f"#{id} aprovado por {usuario}: {r['texto']}")
        return f"{'✅' if r['ok'] else '❌'} #{id} ({p['descricao']}) aprovado por {usuario}: {r['texto']}"

    def investigar(self, alvo, registrar):
        # Coleta determinística + 1 chamada curta ao LLM só para resumir em linguagem de humano.
        pods = kubectl(["-n", NS, "get", "pods", "-l", f"app={alvo}", "--no-headers"])
        ev = kubectl(["-n", NS, "get", "events", "--sort-by=.lastTimestamp", "--no-headers",
                      "-o", "custom-columns=MOTIVO:.reason,MSG:.message"])
        ultimos = "\n".join(ev["stdout"].strip().split("\n")[-5:])
        evidencias = f"PODS:\n{pods['stdout'].strip()}\nEVENTOS RECENTES:\n{ultimos}"
        msg, _, _ = chat([
            {"role": "system", "content": "Você é um SRE. Resuma em no máximo 2 frases, em português, a saúde do serviço e a próxima ação."},
            {"role": "user", "content": evidencias[:1500]},
        ], max_tokens=90)
        registrar("executado", "investigação (somente leitura)")
        return f"🔎 {(msg.content or '').strip()}"


def montar_acao(cmd, args):
    """Traduz o comando em argv de kubectl. Nada de texto livre indo para o shell."""
    alvo = args[0] if args else ""
    valor = args[1] if len(args) > 1 else ""
    if not re.fullmatch(r"[a-z][-a-z0-9]{0,30}", alvo):
        return {"erro": "alvo inválido"}
    if cmd == "scale":
        if not re.fullmatch(r"\d+", valor, re.ASCII) or not 0 <= int(valor) <= 6:
            return {"erro": "réplicas devem ser 0..6 (guardrail)"}
        n = int(valor)
        return {"alvo": alvo, "descricao": f"scale {alvo}={n}", "argv": ["-n", NS, "scale", f"deploy/{alvo}", f"--replicas={n}"], "rollout": False}
    if cmd == "deploy":
        if not re.fullmatch(r"[\w./-]+:[\w.-]+", valor, re.ASCII) or valor.endswith(":latest"):
            return {"erro": "imagem precisa de tag explícita (sem :latest)"}
        return {"alvo": alvo, "descricao": f"deploy {alvo} → {valor}", "argv": ["-n", NS, "set", "image", f"deploy/{alvo}", f"{alvo}={valor}"], "rollout": True}
    return {"alvo": alvo, "descricao": f"rollback {alvo}", "argv": ["-n", NS, "rollout", "undo", f"deploy/{alvo}"], "rollout": True}


def analisar_impacto(acao):
    """Impacto antes de aprovar: dry-run no servidor e, quando dá, o diff do que muda."""
    if "undo" in acao["argv"]:
        h = kubectl(["-n", NS, "rollout", "history", f"deploy/{acao['alvo']}"])
        n = len(h["stdout"].strip().split("\n")) - 2
        return {"ok": h["ok"], "texto": f"volta para a revisão anterior ({n} revisões no histórico)" if h["ok"] else h["stderr"].strip()}
    dry = kubectl([*acao["argv"], "--dry-run=server", "-o", "yaml"])
    if not dry["ok"]:
        return {"ok": False, "texto": dry["stderr"].strip()}
    diff = kubectl(["diff", "-f", "-"], input=dry["stdout"])  # exit 1 = há diferenças
    linhas = [l for l in diff["stdout"].split("\n")
              if re.match(r"^[-+]\s", l) and not re.search(r"generation|resourceVersion|managedFields|time:", l)]
    return {"ok": True, "texto": " ".join(re.sub(r"\s+", " ", l).strip() for l in linhas) or "sem mudança"}


def executar(acao):
    """Executa e VALIDA: para deploy/rollback, só é sucesso se o rollout ficar pronto."""
    r = kubectl(acao["argv"])
    if not r["ok"]:
        return {"ok": False, "texto": r["stderr"].strip()}
    if not acao["rollout"]:
        return {"ok": True, "texto": r["stdout"].strip()}
    st = kubectl(["-n", NS, "rollout", "status", f"deploy/{acao['alvo']}", "--timeout=40s"])
    if st["ok"]:
        return {"ok": True, "texto": "rollout pronto"}
    # Mitigação automática do próprio bot: desfaz a mudança que não ficou pronta.
    kubectl(["-n", NS, "rollout", "undo", f"deploy/{acao['alvo']}"])
    kubectl(["-n", NS, "rollout", "status", f"deploy/{acao['alvo']}", "--timeout=60s"])
    return {"ok": False, "texto": "rollout não ficou pronto em 40s → desfeito automaticamente"}
