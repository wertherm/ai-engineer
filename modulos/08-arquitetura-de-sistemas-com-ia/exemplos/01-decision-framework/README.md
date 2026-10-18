# 01 · Decision framework executável: regra × LLM × híbrido

**Conceito novo:** a decisão "IA ou regra determinística?" vira código e medição. O mesmo conjunto de pedidos
com gabarito passa por três rotas (regra, LLM, híbrida) e um SLA declarado (acerto, latência, custo) escolhe a rota.
Teoria em [doc 01](../../docs/01-fundamentos-ai-first.md#decision-framework-ia-ou-regra-determinística).

**Pré-requisito:** infra no ar (`bash infra/subir-ia.sh` na raiz) e `npm install` na pasta do módulo.

## Como rodar

```bash
cd modulos/08-arquitetura-de-sistemas-com-ia
npm run ex01            # ~8 chamadas ao LLM local: 1 a 7 min em CPU
SLA_MS=1500 npm run ex01   # SLA de latência de uma API em nuvem: nenhuma rota com LLM local passa
```

## Saída esperada

Saída real (latências do `qwen3.5:4b` em CPU, compartilhado com outros processos):

```text
- "Qual o saldo da minha conta?" → regra=saldo llm=saldo (20386 ms) gabarito=saldo
- "Quero bloquear meu cartão" → regra=cartao llm=cartao (20428 ms) gabarito=cartao
- "Como faço um pix para minha mãe?" → regra=pix llm=pix (25698 ms) gabarito=pix
- "Estou muito insatisfeito com o atendimento de ontem" → regra=reclamacao llm=reclamacao (27740 ms) gabarito=reclamacao
- "Perdi a carteira com tudo dentro, e agora?" → regra=nao_sei llm=cartao (18006 ms) gabarito=cartao
- "Mandei dinheiro pela chave do celular e não caiu" → regra=nao_sei llm=pix (35905 ms) gabarito=pix
- "Quanto ainda tenho disponível pra gastar este mês?" → regra=nao_sei llm=saldo (16111 ms) gabarito=saldo
- "Vocês abrem no feriado?" → regra=nao_sei llm=outro (6296 ms) gabarito=outro

rota    | acerto | cobertura | latência média | US$/1k pedidos
--------|--------|-----------|----------------|---------------
regra   | 50%    | 50%       | 0.1 ms         | 0.0000
llm     | 100%   | 100%      | 21321.3 ms     | 0.0136
hibrida | 100%   | 100%      | 9539.8 ms      | 0.0068

SLA: acerto >= 85%, latência <= 60000 ms, custo <= US$ 0.05/1k
Rotas que cumprem: hibrida, llm → escolhida: hibrida
```

Leitura: a regra é 100 000× mais rápida e grátis, mas só cobre metade; o LLM cobre tudo; o híbrido mantém o acerto
do LLM pela **metade** do custo e da latência média. A conta muda com o tráfego: se 90% dos pedidos forem "fáceis",
o híbrido fica ainda mais barato.

> Num teste anterior, sem a frase "Perda/roubo de cartão ou carteira = cartao" no prompt, o modelo classificou
> "quero bloquear meu cartão" como `outro`. Por isso o conjunto com gabarito é obrigatório: prompt muda, acerto muda.

## Experimente

1. Acrescente casos ambíguos ("meu pix caiu no cartão errado") e veja a regra responder `nao_sei` (duas regras casam).
2. Rode com `SLA_MS=1500`: nenhuma rota com LLM local cumpre. Decisão de arquitetura: modelo menor, GPU, API, ou só regras.
3. Troque os preços (`PRECOS='{"barato":{"in":3,"out":15}}'`) e veja o custo por 1k pedidos mudar a escolha.

## Versão Python

Mesmo experimento em [`python/main.py`](python/main.py), com o SDK `openai` para Python e o helper
[`comum_py/llm.py`](../../comum_py/llm.py). As regex usam `re.ASCII` para o `\b` se comportar como no JS.

**Como rodar** (da pasta do módulo, depois de `uv sync`):

```bash
uv run python exemplos/01-decision-framework/python/main.py            # 8 chamadas ao LLM: 1 a 7 min em CPU
SLA_MS=1500 uv run python exemplos/01-decision-framework/python/main.py
```

**Saída esperada (Python)** — saída real (Ollama compartilhado com outros processos):

```text
- "Qual o saldo da minha conta?" → regra=saldo llm=saldo (36293 ms) gabarito=saldo
- "Quero bloquear meu cartão" → regra=cartao llm=cartao (38778 ms) gabarito=cartao
- "Como faço um pix para minha mãe?" → regra=pix llm=pix (25335 ms) gabarito=pix
- "Estou muito insatisfeito com o atendimento de ontem" → regra=reclamacao llm=reclamacao (50886 ms) gabarito=reclamacao
- "Perdi a carteira com tudo dentro, e agora?" → regra=nao_sei llm=cartao (40235 ms) gabarito=cartao
- "Mandei dinheiro pela chave do celular e não caiu" → regra=nao_sei llm=pix (11729 ms) gabarito=pix
- "Quanto ainda tenho disponível pra gastar este mês?" → regra=nao_sei llm=saldo (4987 ms) gabarito=saldo
- "Vocês abrem no feriado?" → regra=nao_sei llm=outro (4786 ms) gabarito=outro

rota    | acerto | cobertura | latência média | US$/1k pedidos
--------|--------|-----------|----------------|---------------
regra   | 50%    | 50%       | 0.0 ms         | 0.0000
llm     | 100%   | 100%      | 26628.6 ms     | 0.0136
hibrida | 100%   | 100%      | 7717.1 ms      | 0.0068

SLA: acerto >= 85%, latência <= 60000 ms, custo <= US$ 0.05/1k
Rotas que cumprem: hibrida, llm → escolhida: hibrida
```

Mesmos rótulos e o mesmo custo por 1k pedidos do JS; só as latências variam com a carga do Ollama.
