"""Plan-and-Execute (variante ReWOO): 1) o PLANNER (LLM) escreve o plano inteiro de uma vez, com referências a
resultados futuros (#E1, #E2...); 2) o EXECUTOR (código determinístico) roda os passos sem chamar o LLM;
3) o SOLVER entrega o valor do último passo (código, não LLM: um modelo pequeno às vezes "reescreve" números).
Se o plano falhar, há 1 replanejamento com o erro como feedback."""

import json
import re

from comum_py.llm import chat, extrair_json, js
from ferramentas import FERRAMENTAS, executar_ferramenta

CATALOGO = "\n".join(f"- {n}({', '.join(f['parameters']['properties'])}): {f['description']}" for n, f in FERRAMENTAS.items())

PROMPT_PLANNER = (
    f"Você é um planejador. Ferramentas:\n{CATALOGO}\n"
    'Devolva SÓ JSON {"passos":[{"id":"E1","tool":"...","args":{...}}]}. '
    "Em calcular, use #E1, #E2... para citar o valor de passos anteriores. O último passo é um calcular com a resposta. "
    # One-shot: um exemplo de plano ensina o formato e o uso de #En melhor que qualquer regra.
    'Exemplo para "custo de completar teclado até 50": {"passos":[{"id":"E1","tool":"consultar_estoque","args":{"produto":"teclado"}},'
    '{"id":"E2","tool":"consultar_preco","args":{"produto":"teclado"}},{"id":"E3","tool":"calcular","args":{"expressao":"(50-#E1)*#E2"}}]}'
)


def executar_plano(plano: list[dict], log=print) -> dict:
    evid: dict[str, object] = {}
    for p in plano:
        # Substitui #En pelo valor já calculado (por isso o executor não precisa de LLM).
        def trocar(m: re.Match) -> str:
            if m.group(1) not in evid:
                raise ValueError(f"{p['id']} referencia {m.group(1)}, que ainda não existe")
            return str(evid[m.group(1)])

        args = json.loads(re.sub(r"#(E\d+)", trocar, js(p.get("args") or {})))
        r = executar_ferramenta(p["tool"], args)
        if "erro" in r:
            raise ValueError(f"{p['id']} {p['tool']}: {r['erro']}")
        evid[p["id"]] = r["valor"]
        log(f"  executor {p['id']}: {p['tool']}({js(args)}) = {r['valor']}")
    return evid


def plan_execute(tarefa: str, *, log=print) -> dict:
    llm_calls, feedback = 0, ""
    for tentativa in (1, 2):
        r = chat([{"role": "system", "content": PROMPT_PLANNER}, {"role": "user", "content": tarefa + feedback}],
                 max_tokens=300, json_mode=True)
        llm_calls += 1
        try:
            plano = extrair_json(r.msg.get("content"))["passos"]
            log(f"  planner ({r.segundos:.0f}s, tentativa {tentativa}): {len(plano)} passos")
            evid = executar_plano(plano, log)
            return {"resposta": f"Resposta: R$ {evid[plano[-1]['id']]}", "llm_calls": llm_calls,
                    "chamadas_tool": len(plano), "plano": plano}
        except Exception as e:
            log(f"  plano falhou: {e}\n  saída do planner: {(r.msg.get('content') or '')[:300]}\n  -> replanejando")
            feedback = f"\nSeu plano anterior falhou: {e}. Corrija."
    return {"resposta": None, "llm_calls": llm_calls, "chamadas_tool": 0}
