# Exemplo 04 · Reflection + memória longa e episódica (pgvector)

**Conceito novo**: o agente **se autoavalia e se corrige** (reflection loop) e **guarda o que aprendeu** num
memory store de longo prazo com embeddings, recuperado numa execução seguinte (outro processo, nada em RAM).

| Peça | Onde | O que faz |
|---|---|---|
| Memória curta | `messages` de cada chamada | só dura a chamada |
| Memória longa | `m04.memorias` tipo `longa` | preferência do usuário ("respostas curtas, em tópicos, Node + Postgres") |
| Memória episódica | `m04.memorias` tipo `episodica` | "na tarefa X o rascunho foi reprovado por Y; lição: Z" |
| Memória contextual | system prompt da sessão 2 | top-k memórias por cosseno (`<=>`) com limiar de distância 0,6 |
| Reflection | `criticar()` + `revisar()` em [`main.js`](main.js) | crítico LLM com critérios explícitos + checagem determinística de tamanho |

Teoria: [doc 02 · memória](../../docs/02-tools-memoria-e-contexto.md#memória) e
[doc 01 · Reflection](../../docs/01-arquitetura-e-padroes-de-raciocinio.md#padrões-de-raciocínio-e-execução).

**Pré-requisito**: [exemplo 01](../01-agent-loop-do-zero/), Postgres com pgvector (schema `m04`) e o modelo
de embeddings `qwen3-embedding:0.6b` (1024 dimensões).

## Como rodar

```bash
cd modulos/04-agentes-autonomos
npm run ex04:s1   # sessão 1: zera m04.memorias, responde, critica, revisa e grava as memórias (~3 min)
npm run ex04:s2   # sessão 2: outra pergunta parecida; recupera memórias e responde (~1 min)
```

## Saída esperada

Saída real da sessão 1:

```
[sessão 1] tarefa: Como devo guardar os logs de execução de um agente?

[rascunho]
A forma ideal de guardar os logs de execução de um agente depende do seu caso de uso específico (ex: LLM, robô, script de automação), mas existem princípios fundamentais de engenharia de dados que devem ser seguidos para garantir **auditoria, depuração eficiente e segurança**.
...

[crítica] aprovado=false problemas=["Texto incompleto","Falta estrutura JSON válida","tem 85 palavras (máx. 50)"]

[revisada]
- Use Postgres para armazenar logs estruturados em JSONB.
- Defina tabelas com chaves primárias e índices para performance.
- Implemente rotacionamento automático de arquivos temporários.
- Adicione campos de timestamp, nível e ID do evento obrigatórios.
- Garanta criptografia em repouso para dados sensíveis.

[crítica 2] aprovado=true problemas=[]

[memória gravada] Episódio "Como devo guardar os logs de execução de um agente?": o rascunho foi reprovado (Texto incompleto; Falta estrutura JSON válida; tem 85 palavras (máx. 50)). Lição: responder no máximo 50 palavras; em tópicos começando com "- "; cita Postgres.

Memórias no banco: episodica=1, longa=1 · 4 chamadas ao LLM · 586 tokens de prompt · 244 de resposta · 202.9s no modelo
```

Saída real da sessão 2 (novo processo):

```
[sessão 2] tarefa: Onde guardo o histórico de decisões dos meus agentes?

[memórias recuperadas por embedding]
┌─────────┬─────────────┬──────────────────────────────────────────────────────────────┬───────────┐
│ (index) │ tipo        │ conteudo                                                     │ distancia │
├─────────┼─────────────┼──────────────────────────────────────────────────────────────┼───────────┤
│ 0       │ 'episodica' │ 'Episódio "Como devo guardar os logs de execução de um ag... │ '0.556'   │
└─────────┴─────────────┴──────────────────────────────────────────────────────────────┴───────────┘

[resposta já com memória]
- Use um banco de dados relacional como PostgreSQL para armazenar logs estruturados.
- Crie tabelas para guardar timestamp, agente, decisão e contexto da execução.
- Isso garante integridade dos dados e permite consultas históricas eficientes.

[crítica] aprovado=true problemas=[]

Memórias no banco: episodica=1, longa=1 · 2 chamadas ao LLM · 255 tokens de prompt · 70 de resposta · 67.0s no modelo
```

### O que observar

- **Reflection funcionou**: o rascunho (sem memória) foi longo e cortado por `max_tokens`; o crítico reprovou,
  a revisão passou. Note que o crítico LLM inventou um problema ("falta estrutura JSON") e **não** contou as
  palavras: foi a checagem determinística que pegou "85 palavras".
- **Aprendizado incremental**: na sessão 2 a lição episódica chegou pelo retrieval (distância 0,556) e a
  resposta saiu em tópicos, curta e citando Postgres de primeira: 2 chamadas em vez de 4.
- **A preferência (memória longa) NÃO foi recuperada**: a distância dela para a pergunta da sessão 2 é 0,746,
  acima do limiar 0,6. Lição de design: **perfil e preferências não são "parecidos" com a tarefa**; carregue-os
  sempre (contexto global) e use similaridade para episódios e conhecimento.

## Experimente

1. Rode `npm run ex04:s2` de novo com `distanciaMax: 0.8` em `recuperar()`: a memória longa entra também.
2. Mude `responder()` para sempre incluir as memórias `tipo = 'longa'` (sem embedding) e só buscar por
   similaridade as episódicas. É o desenho recomendado acima.
3. Rode a sessão 2 com uma pergunta sem relação ("Qual a capital da França?"): nada passa do limiar e o
   agente responde sem memória, como deve ser.
