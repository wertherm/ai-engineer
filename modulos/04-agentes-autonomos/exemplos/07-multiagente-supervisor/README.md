# Exemplo 07 · Multiagente: supervisor + analista → planejador → executor

**Conceito novo**: vários agentes especializados cooperando por **mensagens assíncronas**, coordenados por
um **supervisor** (padrões Supervisor + Delegation). Os quatro rodam concorrentemente (`Promise.all`); cada um
espera mensagens na sua caixa de entrada ([`barramento.js`](barramento.js)) e ninguém chama o outro
diretamente.

| Agente | Usa LLM? | Papel ([`agentes.js`](agentes.js)) |
|---|---|---|
| supervisor | não | roteia pelo `tipo` da mensagem; devolve ao planejador **uma vez** em caso de falha (anti ping-pong) |
| analista | sim | extrai requisitos (pessoas, dia, orçamento) em JSON |
| planejador | sim | escolhe itens respeitando o orçamento; replaneja com o feedback |
| executor | não | allowlist de ações, checa custo x orçamento, executa ações em paralelo |

O LLM **analisa e planeja**; quem **age** é código. A negociação planejador × executor sobre o orçamento é
mediada pelo supervisor.

Teoria: [doc 04](../../docs/04-sistemas-multiagente.md).

**Pré-requisito**: [exemplo 01](../01-agent-loop-do-zero/); bom ter visto o [05](../05-gerenciamento-de-contexto/).

## Como rodar

```bash
cd modulos/04-agentes-autonomos
npm run ex07
# ou outro pedido:
node exemplos/07-multiagente-supervisor/main.js "Café da manhã para 5 pessoas na segunda, orçamento de R$ 200."
```

3 chamadas ao LLM, ~20 s com o Ollama livre.

## Saída esperada

Saída real:

```
Pedido: Organize um café da manhã para 12 pessoas na sexta, com orçamento de R$ 150.

Mensagens:
  [0.0s] supervisor -> analista (pedido)
  [3.7s] analista -> supervisor (requisitos)
  [3.7s] supervisor -> planejador (planejar)
  [10.4s] planejador -> supervisor (plano)
  [10.4s] supervisor -> executor (executar)
  [10.4s] executor -> supervisor (falha)
  [10.4s] supervisor -> planejador (replanejar)
  [17.1s] planejador -> supervisor (plano)
  [17.1s] supervisor -> executor (executar)
  [17.4s] executor -> supervisor (concluido)
  [17.4s] supervisor -> executor (encerrar)
  [17.4s] supervisor -> planejador (encerrar)

Resultado: {
  "status": "concluido",
  "plano": {
    "itens": [
      "pao",
      "cafe"
    ],
    "dia": "sexta"
  },
  "requisitos": {
    "pessoas": 12,
    "dia": "sexta",
    "orcamento": 150,
    "feedback": "plano anterior [\"cafe\",\"suco\",\"frutas\"] falhou: custo R$ 180 > orçamento R$ 150. Corte itens."
  },
  "resultado": {
    "total": 66,
    "feitos": [
      "cotação ok: R$ 66",
      "sala reservada: sexta",
      "12 convites enviados"
    ]
  }
}

12 mensagens trocadas · 3 chamadas ao LLM · 320 tokens de prompt · 82 de resposta · 17.1s no modelo
```

O primeiro plano estourou o orçamento (R$ 180 > R$ 150); o executor recusou, o supervisor devolveu ao
planejador com o motivo e o segundo plano coube (R$ 66). As 3 ações finais rodaram em paralelo (~0,3 s).
O histórico do barramento (`bus.historico`) é a trilha de auditoria da conversa entre agentes.

## Experimente

1. Orçamento de R$ 10 para 12 pessoas: nenhum plano cabe (o item mais barato custa R$ 18); após a única rodada de replanejamento o supervisor
   encerra com `status: "falha"` (sem loop infinito).
2. Adicione um agente **revisor** que recebe o plano antes do executor (padrão hierárquico/consenso) e só
   aprova se tiver bebida e comida.
3. Faça o executor tentar uma ação fora de `ACOES` (ex.: `comprar_cartao`) e veja a falha por allowlist.
