# Exemplo 04 · Prompt engineering medido (Ollama)

**Conceito novo:** comparar prompts com **números**, não com impressão. A mesma tarefa (triagem de 4 tickets
de suporte em `{"tipo", "urgente"}`) roda com 3 prompts e o script mede: JSON válido, acertos contra um
gabarito, tokens de entrada/saída e tempo.

| Prompt | Técnica |
|---|---|
| `A-vago` | pergunta solta ("o que você acha deste ticket?") |
| `B-instrucao` | papel no `system` + rótulos permitidos + critério de urgência + formato de saída |
| `C-few-shot` | B + 2 exemplos resolvidos (pares `user`/`assistant`) |

**Pré-requisito:** infra no ar (`bash infra/subir-ia.sh` na raiz do repo), modelo `qwen3.5:4b` no Ollama.
O cliente está em [`lib/llm.js`](../../lib/llm.js) e lê `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODELO_CHAT`
(defaults do `infra/.env.example`) e envia `reasoning_effort: "none"` e `temperature: 0`.

## Como rodar

```bash
cd modulos/01-fundamentos-ia-llms
npm run ex04        # 12 chamadas ao LLM; em CPU leva de 2 a 12 min (depende da carga da máquina)
```

## Saída esperada

Saída real (CPU disputada com outros processos, por isso os tempos altos):

```text
=== Prompt A-vago ===
ERR esperado=bug/true | saída: Isso é uma situação crítica e extremamente frustrante, especialmente com a perda de vendas [cortado]
ERR esperado=feature/false | saída: Essa é uma **sugestão de melhoria válida e muito comum**, especialmente para ferramentas d [cortado]
ERR esperado=duvida/false | saída: Como sou uma inteligência artificial, não tenho acesso aos seus dados pessoais nem consigo [cortado]
ERR esperado=bug/false | saída: Como sou uma inteligência artificial, não consigo ver o código ou a página web específica  [cortado]

=== Prompt B-instrucao ===
OK  esperado=bug/true | saída: {"tipo":"bug","urgente":true}
OK  esperado=feature/false | saída: {"tipo":"feature","urgente":false}
OK  esperado=duvida/false | saída: {"tipo":"duvida","urgente":false}
OK  esperado=bug/false | saída: {"tipo":"bug","urgente":false}

=== Prompt C-few-shot ===
OK  esperado=bug/true | saída: {"tipo":"bug","urgente":true}
OK  esperado=feature/false | saída: {"tipo":"feature","urgente":false}
ERR esperado=duvida/false | saída: {"tipo":"feature","urgente":false}
OK  esperado=bug/false | saída: {"tipo":"bug","urgente":false}

=== Resumo ===
┌─────────┬───────────────┬─────────────┬─────────┬────────────────┬──────────────┬───────────┐
│ (index) │ prompt        │ JSON válido │ acertos │ tokens entrada │ tokens saída │ tempo (s) │
├─────────┼───────────────┼─────────────┼─────────┼────────────────┼──────────────┼───────────┤
│ 0       │ 'A-vago'      │ '0/4'       │ '0/4'   │ 128            │ 160          │ '244.3'   │
│ 1       │ 'B-instrucao' │ '4/4'       │ '4/4'   │ 337            │ 45           │ '169.7'   │
│ 2       │ 'C-few-shot'  │ '4/4'       │ '3/4'   │ 609            │ 44           │ '306.1'   │
└─────────┴───────────────┴─────────────┴─────────┴────────────────┴──────────────┴───────────┘
```

Leituras honestas desta execução:

- **A** gasta mais tokens de saída (160) e não produz nada utilizável: todo texto é "conversa" cortada em `max_tokens`.
- **B** acertou 4/4 com ~1/4 dos tokens de saída de A.
- **C (few-shot) acertou menos que B** e custou quase o dobro de tokens de entrada. O exemplo
  "Vocês têm integração com o Slack?" → `duvida` fez o modelo associar "exportar/integração" e a pergunta de
  conta a pedidos de recurso. Few-shot ajuda quando os exemplos cobrem a **fronteira** entre as classes; exemplos
  mal escolhidos enviesam. Por isso se mede.
- Com 4 casos, 1 erro = 25 pontos. Para decidir de verdade, use dezenas de casos (ver avaliação com pytest em
  [`trilhas-extras/llmops-vllm-openshift`](../../../../trilhas-extras/llmops-vllm-openshift/)).

## Experimente

1. Adicione ao `C-few-shot` um terceiro exemplo de `duvida` parecido com "Como faço para..." e rode de novo.
2. Aumente o gabarito para 10 tickets (inclua casos ambíguos, ex.: "o PDF exportado sai sem acentos") e veja o placar mudar.
3. Rode com outro modelo sem mudar código: `MODELO_CHAT=<outro modelo do ollama> npm run ex04`.

## Versão Python

Mesmos 4 tickets, mesmos 3 prompts e o mesmo critério, com o SDK `openai` em Python
([`comum_py/llm.py`](../../comum_py/llm.py): `timeout=900`, `max_retries=0`, `reasoning_effort="none"`, `temperature=0`).

**Como rodar** (da pasta do módulo, depois de `uv sync`; 12 chamadas ao LLM, ~1 min nesta máquina):

```bash
uv run python exemplos/04-prompt-engineering/python/main.py
```

**Saída esperada (Python)** — saída real:

```text
=== Prompt A-vago ===
ERR esperado=bug/true | saída: Isso é uma situação crítica e extremamente frustrante, especialmente com a perda de vendas [cortado]
ERR esperado=feature/false | saída: Essa é uma **sugestão de melhoria válida e muito comum**, especialmente para ferramentas d [cortado]
...
=== Prompt B-instrucao ===
OK  esperado=bug/true | saída: {"tipo":"bug","urgente":true}
...
=== Prompt C-few-shot ===
...
ERR esperado=duvida/false | saída: {"tipo":"feature","urgente":false}
OK  esperado=bug/false | saída: {"tipo":"bug","urgente":false}

=== Resumo ===
        prompt |    JSON válido |        acertos | tokens entrada |   tokens saída |      tempo (s)
        A-vago |            0/4 |            0/4 |            128 |            160 |           26.7
   B-instrucao |            4/4 |            4/4 |            337 |             45 |           13.9
    C-few-shot |            4/4 |            3/4 |            609 |             44 |           17.1
```

Mesmo placar do JS (A 0/4, B 4/4, C 3/4): o resultado depende do prompt e do modelo, não da linguagem.
