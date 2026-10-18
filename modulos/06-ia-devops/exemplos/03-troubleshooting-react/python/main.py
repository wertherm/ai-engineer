"""Troubleshooting assistido com ReAct: o agente decide quais evidências coletar (describe, logs),
raciocina sobre elas e devolve diagnóstico + correção sugerida. Nada é alterado no cluster.
"""
import json
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[2]))  # raiz do módulo (comum_py)
sys.path.insert(0, str(AQUI))
from comum_py.llm import chat, extrair_json, resumo_uso  # noqa: E402
from comum_py.shell import kubectl  # noqa: E402
from ferramentas import FERRAMENTAS, NS, TOOLS_SCHEMA, classificar_por_regra  # noqa: E402

MAX_PASSOS = 3
# Gabarito: a causa raiz plantada em cada pod (mesmo YAML do JS: ../pods-quebrados.yaml).
GABARITO = {"checkout": "CrashLoopBackOff", "catalogo": "ImagePullBackOff", "relatorios": "OOMKilled"}
CATEGORIAS = ["CrashLoopBackOff", "ImagePullBackOff", "OOMKilled", "Outro"]

SYSTEM = f"""Você é um SRE fazendo troubleshooting de Kubernetes. Use as ferramentas para coletar evidências
(chame descrever_pod primeiro; logs_pod só se o container chegou a rodar). Use no máximo 2 ferramentas e então
responda SÓ com JSON: {{"categoria": um de {'|'.join(CATEGORIAS)}, "causa": "1 frase", "correcao": "1 frase com a ação concreta"}}."""


def diagnosticar(pod):
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": f'Diagnostique o pod "{pod}".'}]
    vistas = set()
    for passo in range(1, MAX_PASSOS + 1):
        msg, ms, _ = chat(messages, tools=TOOLS_SCHEMA, max_tokens=160)
        # A mensagem do assistente (com tool_calls) volta ao histórico como dict, sem campos None.
        messages.append(msg.model_dump(exclude_none=True))
        if not msg.tool_calls:
            print(f"   [resposta] {ms / 1000:.0f}s", flush=True)
            return extrair_json(msg.content)
        for call in msg.tool_calls:
            nome = call.function.name
            args = json.loads(call.function.arguments or "{}")
            # Guarda anti-loop: o qwen3.5:4b repetia describe → logs → describe → logs. Chamada repetida
            # não executa de novo: devolve um lembrete para concluir (cada volta custa minutos na CPU).
            chave = f"{nome}:{json.dumps(args, sort_keys=True)}"
            if chave in vistas:
                print(f"   [ação {passo}] {nome} repetida → lembrete para concluir", flush=True)
                messages.append({"role": "tool", "tool_call_id": call.id, "content": "Você já tem esta evidência. Responda agora com o JSON."})
                continue
            vistas.add(chave)
            # Allowlist: o modelo só consegue chamar o que está na toolbox (todas read-only).
            if nome in FERRAMENTAS:
                try:
                    saida = FERRAMENTAS[nome][0](**args)
                except Exception as e:  # erro da ferramenta vira observação para o modelo
                    saida = f"erro: {e}"
            else:
                saida = f"ferramenta desconhecida: {nome}"
            print(f"   [ação {passo}] {nome}({json.dumps(args, ensure_ascii=False)}) {ms / 1000:.0f}s → {len(saida)} chars", flush=True)
            messages.append({"role": "tool", "tool_call_id": call.id, "content": saida})
    # Orçamento estourado: força a conclusão sem mais ferramentas (evita runaway loop).
    messages.append({"role": "user", "content": "Sem mais ferramentas. Conclua agora com o JSON."})
    msg, _, _ = chat(messages, max_tokens=160)
    return extrair_json(msg.content)


def main():
    # 1. Prepara o cenário: namespace próprio + 3 pods quebrados de propósito.
    kubectl(["create", "namespace", NS])
    kubectl(["-n", NS, "apply", "-f", str(AQUI.parent / "pods-quebrados.yaml")])
    print("Aguardando os pods falharem (60 s)...", flush=True)
    time.sleep(60)
    print(kubectl(["-n", NS, "get", "pods"])["stdout"])

    acertos_llm = acertos_regra = 0
    for pod, esperado in GABARITO.items():
        print(f"── {pod} (gabarito: {esperado})", flush=True)
        regra = classificar_por_regra(pod)
        try:
            d = diagnosticar(pod)
        except Exception as e:
            d = {"categoria": "erro", "causa": str(e), "correcao": "-"}
        ok_llm = d.get("categoria") == esperado
        acertos_llm += ok_llm
        acertos_regra += regra == esperado
        print(f"   regra    : {regra} {'✓' if regra == esperado else '✗'}")
        print(f"   agente   : {d.get('categoria')} {'✓' if ok_llm else '✗'}")
        print(f"   causa    : {d.get('causa')}")
        print(f"   correção : {d.get('correcao')}\n", flush=True)
    n = len(GABARITO)
    print(f"Acerto da categoria: agente {acertos_llm}/{n} · regras {acertos_regra}/{n}")

    if "--manter" not in sys.argv:
        kubectl(["delete", "namespace", NS, "--wait=false"])
        print(f"Namespace {NS} removido (use --manter para inspecionar).")
    print(resumo_uso())


if __name__ == "__main__":
    main()
