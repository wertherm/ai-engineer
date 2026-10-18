# Exemplo 02 · Perfil do LinkedIn contra uma vaga

**Conceito novo:** recrutador acha você por **busca de palavras-chave** e decide em segundos pela headline
e pelo começo do "Sobre". Este exemplo mede isso: cobertura dos termos da vaga, cargo visível nos primeiros
~60 caracteres da headline, clichês, número no gancho do "Sobre", projetos listados e chamada para ação. No
fim, gera um calendário de conteúdo de 4 semanas a partir do que você aprendeu (marca pessoal = constância).

**Pré-requisito:** nenhum além do Node. Não acessa o LinkedIn: você cola o texto do seu perfil em `perfil.json`
(nada de scraping nem login). A `vaga.txt` é **ilustrativa** (texto criado para o exemplo).

## Como rodar

```bash
cd modulos/12-carreira
npm run ex02
```

## Saída esperada

Saída real (2026-10-16):

```text
== ANTES ==
headline: 87/220 car. · cargo nos 60 visíveis: NÃO · clichês: 3
sobre: 189/2600 car. · número no gancho: sim · projetos listados: 0 · chamada para ação: NÃO
palavras-chave da vaga: 20% (3/15)
  faltando: RAG, Agentes de IA, MCP, LangChain/LangGraph, Avaliação de LLMs, Observabilidade, Banco vetorial, Kubernetes, Prompt engineering, Fine-tuning, vLLM, LLMOps/MLOps

== DEPOIS ==
headline: 101/220 car. · cargo nos 60 visíveis: sim · clichês: 0
sobre: 883/2600 car. · número no gancho: sim · projetos listados: 4 · chamada para ação: sim
palavras-chave da vaga: 87% (13/15)
  faltando: Docker, Fine-tuning

Calendário de conteúdo (1 publicação/semana + 3 comentários técnicos em posts de outras pessoas):
  semana 1 · post curto: 1 aprendizado + 1 trecho de código · "Por que o thinking do qwen3.5 deixava as respostas lentas em CPU e como desligar (reasoning_effort)"
  semana 2 · case: problema -> decisão -> número · "TTFT x ITL: as duas latências que importam num LLM e como medir com o /metrics do vLLM"
  semana 3 · artigo técnico (blog/dev.to) linkado no post · "MCP vs function calling: quando vale padronizar as tools da empresa"
  semana 4 · demo: GIF de 20 s + link do repo · "Portão de promoção: CI/CD para prompt e modelo com exit 0/1"
```

"Faltando: Fine-tuning" é proposital: **não** coloque no perfil o que você não fez. Docker, sim, faltou por
esquecimento (está nos projetos): é só adicionar às skills. A checagem "número no gancho" do ANTES passa por
"6 anos" — é uma heurística, não um juiz.

## Experimente

1. Cole a sua headline e o seu "Sobre" em `perfil.json` e uma vaga real em `vaga.txt`.
2. Adicione termos ao dicionário `TERMOS` (ex.: `Bedrock`, `Vertex AI`) conforme as vagas que você mira.
3. Rode `node --test exemplos/02-perfil-linkedin/` e escreva um teste para a checagem de clichês.

## Versão Python

`python/analisar.py` + `python/test_analisar.py` (pytest). Lê os mesmos `perfil.json` e `vaga.txt`.

### Como rodar

```bash
cd modulos/12-carreira
uv run python exemplos/02-perfil-linkedin/python/analisar.py
uv run pytest exemplos/02-perfil-linkedin/
```

### Saída esperada (Python)

Saída real (2026-10-17), encurtada; idêntica à do JS (`diff` vazio):

```text
== ANTES ==
headline: 87/220 car. · cargo nos 60 visíveis: NÃO · clichês: 3
sobre: 189/2600 car. · número no gancho: sim · projetos listados: 0 · chamada para ação: NÃO
palavras-chave da vaga: 20% (3/15)
...
== DEPOIS ==
headline: 101/220 car. · cargo nos 60 visíveis: sim · clichês: 0
sobre: 883/2600 car. · número no gancho: sim · projetos listados: 4 · chamada para ação: sim
palavras-chave da vaga: 87% (13/15)
  faltando: Docker, Fine-tuning
...
  semana 4 · demo: GIF de 20 s + link do repo · "Portão de promoção: CI/CD para prompt e modelo com exit 0/1"
```

Atenção: `len()` do Python conta code points; o `.length` do JS conta unidades UTF-16. Com emoji na
headline (fora do BMP), o JS conta 2 por emoji e o Python 1. Os textos daqui não têm emoji, então batem.
