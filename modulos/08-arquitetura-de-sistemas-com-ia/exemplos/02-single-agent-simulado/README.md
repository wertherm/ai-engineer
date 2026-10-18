# 02 · Single-agent em fluxo linear: Reactive × Memory-Enhanced com usuário simulado

**Conceito novo:** comparar **padrões de single-agent** com um **usuário simulado** (roteiro fixo de falas): a mesma
conversa vira teste reproduzível. O padrão Reactive responde só ao estímulo atual; o Memory-Enhanced guarda
**fatos** extraídos (não o histórico inteiro) e os injeta no prompt. Teoria em
[doc 02](../../docs/02-single-agent-e-multi-agent.md#padrões-de-single-agent).

**Pré-requisito:** [exemplo 01](../01-decision-framework/).

## Como rodar

```bash
npm run ex02    # 6 chamadas ao LLM local
```

## Saída esperada

Saída real (respostas encurtadas com `...`):

```text
== reactive ==
  usuário: Oi, sou a Ana e tenho uma padaria em Recife.
  agente:  Olá, Ana! Como posso ajudar sua padaria em Recife hoje? ...
  usuário: Vendo muito parcelado no cartão. Antecipar recebíveis faz sentido?
  agente:  Sim, antecipar recebíveis pode ser estratégico para melhorar seu fluxo de caixa ...
  usuário: Lembra meu nome e meu tipo de negócio?
  agente:  Não tenho acesso às suas informações pessoais ou detalhes do seu negócio por questões de privacidade e segurança. ...
  → lembrou do contexto? não · 280 tokens · 23 s

== memory-enhanced ==
  usuário: Oi, sou a Ana e tenho uma padaria em Recife.
  agente:  Olá, Ana! Como você é proprietária de uma padaria em Recife, posso ajudar ...
  usuário: Vendo muito parcelado no cartão. Antecipar recebíveis faz sentido?
  agente:  Sim, antecipar recebíveis pode ser estratégico ... fornecedores da sua padaria. ...
  usuário: Lembra meu nome e meu tipo de negócio?
  agente:  Sim, Ana, seu nome é Ana e você tem uma padaria. Posso ajudar com o que precisar!
  → lembrou do contexto? sim · 323 tokens · 22 s
```

Memória de fatos custou só ~15% a mais de tokens e personalizou até o turno 2 ("fornecedores da sua padaria").
Mandar o histórico inteiro também funcionaria, mas o custo cresce a cada turno (O(n²) tokens na conversa toda).

## Experimente

1. Troque a memória de fatos pelo histórico completo (`messages` acumuladas) e compare os tokens no 3º turno.
2. Acrescente um turno "Na verdade a padaria é em Olinda" e trate **atualização** de fato (memória também envelhece).
3. Os padrões Tool-Using e ReAct estão no [exercício 02](../../exercicios/02-agentic-rag/) e no
   [módulo 04](../../../04-agentes-autonomos/README.md); Self-Reflection também está no módulo 04.

## Versão Python

[`python/main.py`](python/main.py). O `re` do Python não tem `\p{Lu}`/`\p{Ll}`: o nome é capturado com `[^\W\d_]+`
("letra Unicode") e a caixa é conferida com `isupper()`/`islower()`.

**Como rodar** (da pasta do módulo, depois de `uv sync`):

```bash
uv run python exemplos/02-single-agent-simulado/python/main.py   # 6 chamadas ao LLM
```

**Saída esperada (Python)** — saída real (respostas encurtadas com `...`):

```text
== reactive ==
  usuário: Oi, sou a Ana e tenho uma padaria em Recife.
  agente:  Olá, Ana! Como posso ajudar sua padaria em Recife hoje? Você precisa de informações sobre financiamento, gestã ...
  usuário: Vendo muito parcelado no cartão. Antecipar recebíveis faz sentido?
  agente:  Sim, antecipar recebíveis pode ser estratégico para melhorar seu fluxo de caixa e evitar juros sobre o saldo d ...
  usuário: Lembra meu nome e meu tipo de negócio?
  agente:  Não tenho acesso às suas informações pessoais ou detalhes do seu negócio por questões de privacidade e seguran ...
  → lembrou do contexto? não · 280 tokens · 52 s

== memory-enhanced ==
  usuário: Oi, sou a Ana e tenho uma padaria em Recife.
  agente:  Olá, Ana! Como você é proprietária de uma padaria em Recife, posso ajudar com soluções financeiras específicas ...
  usuário: Vendo muito parcelado no cartão. Antecipar recebíveis faz sentido?
  agente:  Sim, antecipar recebíveis pode ser estratégico para melhorar seu fluxo de caixa e evitar atrasos no pagamento  ...
  usuário: Lembra meu nome e meu tipo de negócio?
  agente:  Sim, Ana, seu nome é Ana e você tem uma padaria. Posso ajudar com o que precisar!
  → lembrou do contexto? sim · 323 tokens · 40 s
```

Mesmo resultado do JS (inclusive os 280 × 323 tokens): só a memória de fatos lembra do nome e do negócio.
