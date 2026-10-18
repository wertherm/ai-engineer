# Exemplo 04 · Orquestração multiagente com o Google ADK (no LLM local)

**Conceito novo**: orquestrar **vários agentes e LLMs** com o **ADK (Agent Development Kit)** do Google
(`@google/adk` 2.3.0): um `Workflow` com dois `LlmAgent` (pesquisador com ferramenta, redator) e um nó
de **código** que verifica as citações, passando dados pelo **estado da sessão** (`outputKey`,
`{pergunta}`, `{evidencias}`).

O ADK TypeScript só traz modelos Gemini/Vertex/Apigee/Chrome; os conectores LiteLLM e Ollama existem
apenas no ADK Python (conferido na documentação oficial). Por isso este exemplo **estende `BaseLlm`**
([`ollama-llm.js`](ollama-llm.js)) e traduz o formato do Gemini para Chat Completions — o ADK roda
inteiro no Ollama local, sem chave. Usar Gemini de verdade (`model: 'gemini-2.5-flash'` + `GOOGLE_API_KEY`)
fica **não executado localmente** (exige conta Google). Detalhes e diagrama no
[doc 02](../../docs/02-rag-agentes-e-mcp.md#orquestração-multiagente-com-o-google-adk).

**Pré-requisito**: [entrega 1](../01-entrega-1-rag-cli/) (`npm run seed`). A ferramenta do pesquisador
chama a mesma fachada `servico.buscar` da API, então isolamento por tenant, PII e auditoria (canal `adk`)
valem aqui também.

## Como rodar

```bash
cd modulos/11-capstone-micro-saas
npm run e4                                   # tenant acme, pergunta padrão (3 chamadas ao LLM: lento em CPU)
npm run e4 -- padaria "Posso tirar férias em dezembro e dividir em quantas partes?"
MODELO_REDATOR=qwen3.5:4b MODELO_PESQUISADOR=qwen3.5:4b npm run e4   # um modelo por agente
npx vitest run exemplos/04-orquestracao-adk  # testes da tradução Gemini <-> OpenAI (sem rede)
```

## Saída esperada

Saída real da versão final dos prompts:

```
Tenant: Acme Software
Pergunta: Quantos dias por semana posso trabalhar de casa e quanto recebo de auxílio para isso?

 407.4s [pesquisador] chama buscar_politicas({"consulta":"auxílio home office"})
   0.7s [pesquisador] tool devolveu home-office.md, home-office.md, home-office.md
 391.5s [pesquisador] - Auxílio home office de R$ 150,00 por mês [home-office.md]
 165.1s [redator] Não encontrei informações sobre o número de dias por semana disponíveis para trabalho remoto. Encontrei apenas que o auxílio home office é de R$ 150,00 por mês [home-office.md].
   0.0s [verificar] {"verificado":true,"citados":["home-office.md"],"lidos":["home-office.md"]}

estado final: ["pergunta","evidencias","resposta"] · total 964.6s
```

**A lição está na primeira versão.** Com os prompts iniciais (o redator não era instruído a admitir
lacunas), a mesma execução produziu uma resposta **errada e com citação válida**:

```
 313.1s [pesquisador] - Auxílio home office de R$ 150,00 por mês [home-office.md]
 157.6s [redator] Você pode trabalhar de casa todos os dias da semana, conforme a política de home office descrita no arquivo [home-office.md]. O auxílio para esse trabalho remoto é de R$ 150,00 por mês.
   0.0s [verificar] {"verificado":true,"citados":["home-office.md"],"lidos":["home-office.md"]}
```

A política diz "3 dias remotos e 2 presenciais" — o trecho **estava** no resultado da busca, mas o
pesquisador (modelo de 4B) resumiu só um fato, e o redator completou o resto com suposição. O verificador
aprovou porque ele checa **de onde** veio a citação, não **se o fato está no trecho**. Três aprendizados:
(1) em pipeline multiagente, a perda de informação entre agentes é o defeito típico; (2) "citação
válida" não é "resposta correta" — o próximo nível é um verificador de **fidelidade** (cada frase
sustentada por um trecho, com LLM-juiz ou NLI); (3) o prompt "diga que não encontrou essa parte" troca
alucinação por resposta incompleta e honesta, que é o comportamento certo para um produto de RH.

Avisos que o ADK 2.3.0 imprime (silenciados com `setLogLevel(LogLevel.ERROR)`): `Class Workflow is
experimental` e, se você trocar por `SequentialAgent`, `SequentialAgent is deprecated in favor of Workflow`.

Testes do adaptador:

```
 ✓ exemplos/04-orquestracao-adk/ollama-llm.test.js > adaptador OllamaLlm > converte o Schema do Gemini para JSON Schema 8ms
 ✓ exemplos/04-orquestracao-adk/ollama-llm.test.js > adaptador OllamaLlm > converte system, tool call e tool response 2ms
 ✓ exemplos/04-orquestracao-adk/ollama-llm.test.js > adaptador OllamaLlm > converte a resposta com tool_calls em functionCall 1ms
      Tests  3 passed (3)
```

## Experimente

1. Faça o pesquisador **não resumir**: troque o `FunctionTool` para devolver os trechos e use `outputKey` só no redator, ou peça ao pesquisador "copie os trechos literalmente". Compare a resposta sobre os dias de home office.
2. Troque o nó `verificar` por um `LlmAgent` "revisor" que recebe evidências e resposta e diz se cada frase está sustentada — e meça quanto tempo (e quantos tokens) isso adiciona.
3. Use o `MCPToolset` do ADK (`@google/adk` → `MCPToolset` com `StreamableHTTPConnectionParams`) apontando para `http://127.0.0.1:31180/mcp` com o header `Authorization: Bearer sk-acme-demo` no lugar do `FunctionTool`: o pesquisador passa a usar o Micro-SaaS **pelo MCP**, como um agente externo.

## Versão Python

[`python/main.py`](python/main.py) com o **ADK Python** (`google-adk` 2.12.0): o mesmo `Workflow`
`START -> pesquisador -> redator -> verificar`, `LlmAgent` com `output_key`, instruções com `{pergunta}` e
`{evidencias}` lidos do estado da sessão, e o nó final em código.

A grande diferença: o ADK Python **já traz o conector LiteLLM**, então não há adaptador próprio (o
`ollama-llm.js` e o teste dele não têm equivalente — **não se aplica**). Cada agente recebe
`LiteLlm(model="ollama_chat/qwen3.5:4b", api_base="http://localhost:11434", reasoning_effort="none", temperature=0, max_tokens=...)`:
`ollama_chat/` é a API nativa do Ollama, a recomendada na doc do ADK para tools, e o LiteLLM traduz
`reasoning_effort="none"` para `think: false`. A tool é uma função Python comum embrulhada em `FunctionTool`:
o ADK gera a declaração pela assinatura e pela docstring (no JS, schema zod). A fachada `servico.buscar` é a
mesma da API Python, então isolamento por tenant, PII e auditoria (canal `adk`, em `m11.auditoria_py`) valem aqui também.

### Como rodar

```bash
cd modulos/11-capstone-micro-saas
uv sync
uv run python exemplos/04-orquestracao-adk/python/main.py
uv run python exemplos/04-orquestracao-adk/python/main.py padaria "Posso tirar férias em dezembro e dividir em quantas partes?"
MODELO_PESQUISADOR=qwen3.5:4b MODELO_REDATOR=qwen3.5:4b uv run python exemplos/04-orquestracao-adk/python/main.py
```

### Saída esperada (Python)

Saída real (2026-10-18; Ollama sem fila):

```
Tenant: Acme Software
Pergunta: Quantos dias por semana posso trabalhar de casa e quanto recebo de auxílio para isso?

  24.5s [pesquisador] chama buscar_politicas({"consulta": "auxílio home office"})
   0.8s [pesquisador] tool devolveu home-office.md, home-office.md, home-office.md
  16.5s [pesquisador] - A empresa paga um auxílio home office de R$ 150,00 por mês, junto com o salário, para custear internet e energia [home-office.md]
  10.5s [redator] A empresa oferece um auxílio de R$ 150,00 por mês para custear despesas como internet e energia [home-office.md]. Não foi encontrada informação sobre a quantidade de dias por semana que o colaborador pode trabalhar de casa.
   0.0s [verificar] {"verificado":true,"citados":["home-office.md"],"lidos":["home-office.md"]}

estado final: ["pergunta","evidencias","resposta"] · total 52.3s
```

A mesma lição da versão JS: o trecho "3 dias remotos e 2 presenciais" veio na busca, mas o pesquisador
resumiu só um fato; o redator, instruído a admitir lacunas, respondeu incompleto e honesto. Com a padaria:

```
  22.1s [pesquisador] chama buscar_politicas({"consulta": "férias dezembro divisão"})
   0.8s [pesquisador] tool devolveu ferias.md, ferias.md, ferias.md
  15.6s [pesquisador] - Não são concedidas férias em dezembro [ferias.md]
          - As férias podem ser divididas em no máximo 2 períodos [ferias.md]
  14.7s [redator] Não é possível tirar férias em dezembro, pois não são concedidas nesse mês [ferias.md]. Quanto à divisão das férias, elas podem ser feitas em no máximo dois períodos [ferias.md].
   0.0s [verificar] {"verificado":true,"citados":["ferias.md","ferias.md"],"lidos":["ferias.md"]}
```

Detalhes do ADK Python 2.12: o `Workflow` aceita uma função comum como nó (o parâmetro `node_input` recebe
a saída do nó anterior); o evento da saída desse nó vem com `author` do Workflow, por isso o nome do nó é lido
de `ev.node_info.path` (`politicas_adk@1/verificar@1`). O único aviso impresso é
`[EXPERIMENTAL] feature FeatureName.JSON_SCHEMA_FOR_FUNC_DECL is enabled`, silenciado com `warnings.filterwarnings`.
Com Gemini de verdade (`model="gemini-2.5-flash"` + `GOOGLE_API_KEY`): não executado localmente (exige conta Google).
