# Exemplo 01 · Prompt chaining + templates + saída estruturada validada com zod

**Conceito novo:** dividir uma tarefa em uma **corrente de 3 chamadas** (extrair → classificar → redigir),
com prompts guardados como **templates versionados** e saídas em **JSON Schema** validadas com **zod**
(com nova tentativa e feedback do erro quando a validação falha).

**Pré-requisito:** infra no ar (`bash infra/subir-ia.sh` na raiz) e `npm install` na pasta do módulo.
Teoria: [doc 01](../../docs/01-engenharia-de-prompts-avancada.md) e [doc 02](../../docs/02-consistencia-e-custo.md).

| Arquivo | Papel |
|---|---|
| [`templates.js`](templates.js) | templates `id@versao` com `{{variaveis}}` e falha rápida |
| [`main.js`](main.js) | a corrente, com checagem determinística anti-alucinação entre os elos |
| [`templates.test.js`](templates.test.js) | testa os templates sem chamar o LLM |
| [`../../comum/estruturado.js`](../../comum/estruturado.js) | `chamarEstruturado()`: `zodResponseFormat` + `safeParse` + retry com feedback |

## Como rodar

```bash
cd modulos/02-apis-ia-generativa
npm run ex01                                  # ou: node exemplos/01-prompt-chaining-e-templates/main.js "seu texto"
npx vitest run exemplos/01-prompt-chaining-e-templates
```

## Saída esperada

Saída real (`qwen3.5:4b` em CPU, ~2 min no total):

```
Entrada: Comprei um fone Bluetooth (pedido 48213) e ele chegou sem o cabo de carga. Preciso dele para uma viagem na sexta!

[1] extrair-reclamacao v3
  · {"etapa":"extracao","tentativa":1,"ms":56117,"tokens":149}
  → {"produto":"fone Bluetooth","problema":"chegou sem o cabo de carga","pedido":"48213","prazo":"viagem na sexta"}
[2] classificar-urgencia v3
  · {"etapa":"classificacao","tentativa":1,"ms":38512,"tokens":112}
  → {"urgencia":"media","justificativa":"Cliente tem prazo curto (viagem sexta), mas não há risco financeiro imediato."}
[3] responder-cliente v1
  → Lamentamos que seu pedido 48213 tenha chegado sem o cabo de carga e já estamos verificando a situação com prioridade. Entraremos em contato em breve para informar os próximos passos sobre a reposição do item faltante.
```

Por que os templates estão na **v3**? Duas lições reais desta corrente:

- **v2 → v3 do `extrair`**: sem o campo `prazo`, o elo 2 nunca soube da "viagem na sexta" e classificou a
  urgência como `baixa`. Em chaining, o que um elo não repassa, o próximo não sabe.
- **v2 → v3 do `classificar`**: sem "justificativa em até 15 palavras", o modelo escreveu um parágrafo que
  terminou num caractere chinês solto (`...resolução do caso,抬`). Limite de tamanho vai no prompt, não só no `max_tokens`.

Ao incluir `{{prazo}}` no template, o teste `monta system + user` quebrou com
`Variável ausente no template: prazo` — a falha rápida pegou no teste o que iria para o modelo como `{{prazo}}` literal.

## Experimente

1. Rode com um texto **sem** número de pedido (`node .../main.js "O fone chegou sem cabo."`) e confira que
   `pedido` vem `null` — e, se o modelo inventar um, a checagem `texto.includes(...)` descarta.
2. Remova `prazo` do template `classificar` e veja a urgência mudar.
3. Troque `max_tokens` do elo 1 para `20`: o JSON sai cortado, a validação falha e o `chamarEstruturado`
   faz a 2ª tentativa (e também falha). É o erro "JSON inválido" das [armadilhas do doc 02](../../docs/02-consistencia-e-custo.md#armadilhas).

## Versão Python

Mesma corrente em [`python/`](python/): [`templates.py`](python/templates.py) (mesmos textos e versões),
[`main.py`](python/main.py) com modelos **pydantic** no lugar dos schemas zod e
[`test_templates.py`](python/test_templates.py) (pytest). A chamada estruturada com retry e feedback está em
[`comum_py/estruturado.py`](../../comum_py/estruturado.py): o schema vai no `response_format` (gerado por
`Modelo.model_json_schema()`) e a validação é `Modelo.model_validate_json(texto)`.

Por que não `client.chat.completions.parse(response_format=Modelo)`? Ele também existe no SDK Python e faz o
mesmo envio + validação, mas quando a validação falha ele **levanta a exceção** e você não tem o texto bruto
para devolver ao modelo como feedback. Para o retry com feedback, `create` + pydantic é mais simples.

### Como rodar

```bash
cd modulos/02-apis-ia-generativa
uv sync
uv run python exemplos/01-prompt-chaining-e-templates/python/main.py      # ou: ... main.py "seu texto"
uv run pytest exemplos/01-prompt-chaining-e-templates
```

### Saída esperada (Python)

Saída real (`qwen3.5:4b` em CPU, 3 min 25 s com o Ollama compartilhado) — o JSON de cada elo saiu
idêntico ao da versão JS (mesmo `seed`, `temperature: 0` e prompts):

```
Entrada: Comprei um fone Bluetooth (pedido 48213) e ele chegou sem o cabo de carga. Preciso dele para uma viagem na sexta!

[1] extrair-reclamacao v3
  · {"etapa": "extracao", "tentativa": 1, "ms": 163130, "tokens": 149}
  → {"produto":"fone Bluetooth","problema":"chegou sem o cabo de carga","pedido":"48213","prazo":"viagem na sexta"}
[2] classificar-urgencia v3
  · {"etapa": "classificacao", "tentativa": 1, "ms": 16999, "tokens": 112}
  → {"urgencia":"media","justificativa":"Cliente tem prazo curto (viagem sexta), mas não há risco financeiro imediato."}
[3] responder-cliente v1
  → Lamentamos que seu pedido 48213 tenha chegado sem o cabo de carga e já estamos verificando a situação com prioridade. Entraremos em contato em breve para informar os próximos passos sobre a reposição do item faltante.
```

```
$ uv run pytest exemplos/01-prompt-chaining-e-templates
3 passed in 0.02s
```
