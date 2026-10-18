"""Contexto ativo sob orçamento de tokens: mostra o que a janela ingênua perde e como
pruning + sumarização + stitching (+ contexto compartilhado global/local) preservam o essencial."""

from comum_py.llm import chat, js, resumo_uso
from contexto import costurar, estimar_tokens, janela, podar_tools_antigas, sumarizar

ORCAMENTO = 220  # tokens estimados para o histórico (pequeno de propósito)

# Histórico longo de um agente de suporte: o fato importante (pedido 8812) aparece só no começo.
historico = [
    {"role": "user", "content": "Oi, sou a Ana da Padaria Pão Quente. Meu pedido 8812 de 40 caixas de farinha não chegou."},
    {"role": "assistant", "content": "Vou verificar o pedido 8812."},
    {"role": "tool", "content": js({"pedido": 8812, "status": "em trânsito", "transportadora": "RodoSul",
                                    "eventos": [f"evento {i}: centro de distribuição {i}" for i in range(1, 9)]})},
    {"role": "assistant", "content": "O pedido está em trânsito pela RodoSul."},
]
for i in range(1, 7):
    historico += [
        {"role": "user", "content": f"Pergunta extra {i}: e sobre o horário de entrega da semana {i}?"},
        {"role": "tool", "content": js({"semana": i, "janelas": ["08h-10h", "14h-16h"],
                                        "observacao": "sujeito a confirmação da transportadora parceira"})},
        {"role": "assistant", "content": f"Na semana {i} as entregas são 08h-10h ou 14h-16h."},
    ]
pergunta = {"role": "user", "content": "Qual é o número do meu pedido e quantas caixas eram? Responda em uma frase."}
SYSTEM = 'Você é o agente de suporte. Responda só com base no contexto; se não souber, diga "não sei".'

print(f"Histórico completo: {len(historico)} mensagens, ~{estimar_tokens(historico)} tokens (orçamento: {ORCAMENTO})")

# 1) Pruning de resultados de tool antigos.
podado = podar_tools_antigas(historico)
print(f"Após podar tools antigas: ~{estimar_tokens(podado)} tokens")

# 2) Janela ingênua: só o que cabe no orçamento, do fim para o começo.
recentes = janela(podado, ORCAMENTO)
descartadas = podado[:len(podado) - len(recentes)]
print(f"Janela: mantém {len(recentes)} mensagens recentes, descarta {len(descartadas)} antigas")

# 3) Contexto compartilhado entre agentes: GLOBAL (todos veem) x LOCAL (só a etapa atual).
quadro = {
    "global": {"cliente": "Padaria Pão Quente", "objetivo": "resolver atraso de entrega"},
    "local": {"suporte": ["Política: atraso > 5 dias dá frete grátis no próximo pedido."],
              "financeiro": ["Limite de crédito: R$ 5.000."]},
}

# Versão A: só a janela (o fato do pedido sumiu).
ingenuo = [{"role": "system", "content": SYSTEM}, *recentes, pergunta]
# Versão B: resumo do que saiu + fatos fixados + contexto local do agente de suporte.
resumo = sumarizar(descartadas)
print(f"\nResumo das {len(descartadas)} mensagens descartadas: {resumo}")
costurado = costurar(
    global_=f"{SYSTEM}\nCliente: {quadro['global']['cliente']}. Objetivo: {quadro['global']['objetivo']}.",
    fatos=["Pedido principal: 8812"],
    resumo=resumo,
    local=quadro["local"]["suporte"],  # o agente de suporte NÃO recebe o contexto local do financeiro
    recentes=recentes,
) + [pergunta]


def sem_tool_role(msgs: list[dict]) -> list[dict]:
    """O papel "tool" sem tool_call_id é recusado por APIs estritas; aqui convertemos para texto do assistente."""
    return [{"role": "assistant", "content": f"[resultado de ferramenta] {m['content']}"} if m["role"] == "tool" else m
            for m in msgs]


for nome, msgs in [("A · só janela", ingenuo), ("B · podado + resumo + stitching", costurado)]:
    r = chat(sem_tool_role(msgs), max_tokens=60)
    print(f"\n[{nome}] ~{estimar_tokens(msgs)} tokens estimados / {r.usage['prompt_tokens']} reais, {r.segundos:.0f}s")
    print(f"  resposta: {r.msg['content'].strip()}")
print(f"\n{resumo_uso()}")
