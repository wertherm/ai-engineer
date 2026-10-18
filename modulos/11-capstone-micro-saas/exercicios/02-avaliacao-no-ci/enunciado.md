# Exercício 02 · Avaliação automática de qualidade como portão de CI

## Contexto

Os testes de contrato garantem que a API **responde**; não garantem que ela responde **certo**. Uma
mudança inocente (outro modelo de embedding, outro chunking, um limiar novo) pode derrubar a qualidade
sem quebrar nenhum teste. Você vai criar uma avaliação automática que **reprova o CI** quando a qualidade
cai — o mesmo raciocínio da avaliação com pytest da [trilha LLMOps](../../../../trilhas-extras/llmops-vllm-openshift/).

## Requisitos

1. Um **golden set** versionado (`golden.json`) com ao menos 10 perguntas dos 2 tenants, cada uma rotulada com o arquivo que a responde.
2. Métricas de **recuperação** sem LLM de chat (rápidas): **hit@1**, **hit@3** e **MRR**, usando `servico.buscar` (a mesma busca da produção).
3. **Checagem de citações**: rodar a guarda `verificarResposta` contra fixtures de respostas boas e ruins (sem citação, citação inventada, link) e exigir 100% de acerto.
4. Opcional `--com-llm N`: gerar N respostas reais e conferir se citam o arquivo esperado.
5. Limiares mínimos por métrica; **exit code 1** se qualquer uma ficar abaixo (é isso que deixa o CI vermelho).
6. Um job de CI que rode a avaliação (veja a dica sobre onde ele roda).

## Critério de pronto

- `npm run exe02` imprime as métricas e "APROVADO" com o corpus atual.
- Trocar o rótulo de uma pergunta para um arquivo errado faz o script terminar com "REPROVADO" e exit code 1.

## Dicas

- **MRR** (Mean Reciprocal Rank): média de 1/posição do primeiro acerto (0 se não achou). Pune "achou, mas em 3º lugar".
- Escreva perguntas **com palavras diferentes das do documento** ("comida" em vez de "alimentação", "aliança" em vez de "anéis"): é aí que a busca vetorial é testada de verdade.
- A avaliação precisa de embeddings (Ollama). No GitHub Actions, rode-a num job **separado e agendado** (nightly), não em todo PR:

```yaml
  avaliacao-rag:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-24.04
    services:
      postgres: { image: 'pgvector/pgvector:0.8.7-pg18', env: { POSTGRES_USER: ia, POSTGRES_PASSWORD: ia, POSTGRES_DB: ia }, ports: ['5433:5432'] }
      ollama: { image: 'ollama/ollama:0.40.5', ports: ['11434:11434'] }
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24.22.0 }
      - run: npm ci
      - run: curl -s localhost:11434/api/pull -d '{"model":"qwen3-embedding:0.6b"}'
      - run: npm run seed
      - run: npm run exe02          # exit 1 reprova o pipeline
```

(este job não foi executado localmente: precisa de um runner do GitHub; os passos equivalentes rodaram na máquina.)

## Solução

[`solucao/golden.json`](solucao/golden.json) e [`solucao/avaliar.js`](solucao/avaliar.js). Saída real de
`npm run exe02 -- --com-llm 2` (a 1ª resposta veio do cache semântico; a 2ª foi gerada na hora):

```
== Recuperação (golden set rotulado: pergunta -> arquivo que responde)
  ok  pos=1 acme     Qual o valor do auxílio home office?
  ok  pos=1 acme     Posso dividir minhas férias em partes?
  ok  pos=1 acme     Quanto posso gastar com comida numa viagem a trabalho?
  ok  pos=1 acme     Perdi meu notebook, a quem aviso e em quanto tempo?
  ok  pos=1 acme     Posso trabalhar remoto de Portugal por duas semanas?
  ok  pos=1 acme     A empresa paga minha certificação de nuvem?
  ok  pos=1 acme     Posso colar dados de cliente no ChatGPT?
  ok  pos=1 acme     Com quanta antecedência peço férias?
  ok  pos=1 padaria  Posso tirar férias em dezembro?
  ok  pos=1 padaria  Posso usar aliança na produção?
  ok  pos=1 padaria  Quero trocar de turno com uma colega, o que preciso fazer?
  ok  pos=1 padaria  Até quando entrego o atestado médico?

== Guarda de citações: 6/6 fixtures classificadas corretamente

== Respostas reais (2, LLM local)
  ok Qual o valor do auxílio home office? -> [home-office.md] (cache)
  ok Posso dividir minhas férias em partes? -> [ferias.md] (308s)

== Portão de qualidade
  PASSOU  hit@1                1.000 (mínimo 0.75)
  PASSOU  hit@3                1.000 (mínimo 0.9)
  PASSOU  mrr                  1.000 (mínimo 0.8)
  PASSOU  citacoes             1.000 (mínimo 1)
  PASSOU  citacao_correta_llm  1.000 (mínimo 1)

Resultado: APROVADO
```

Reprovação provocada: uma cópia do golden set com 3 rótulos trocados para `ferias.md`
(`jq '.[2].fonte="ferias.md" | .[9].fonte="ferias.md" | .[10].fonte="ferias.md"' solucao/golden.json > /tmp/golden-errado.json`)
e `node exercicios/02-avaliacao-no-ci/solucao/avaliar.js --golden /tmp/golden-errado.json`:

```
  X   pos=- acme     Quanto posso gastar com comida numa viagem a trabalho?
  X   pos=- padaria  Posso usar aliança na produção?
  ~   pos=2 padaria  Quero trocar de turno com uma colega, o que preciso fazer?
...
== Portão de qualidade
  PASSOU  hit@1                0.750 (mínimo 0.75)
  REPROVOU hit@3                0.833 (mínimo 0.9)
  REPROVOU mrr                  0.792 (mínimo 0.8)
  PASSOU  citacoes             1.000 (mínimo 1)

Resultado: REPROVADO (o CI falharia)
exit code: 1
```

## Versão Python

[`solucao/python/avaliar.py`](solucao/python/avaliar.py): o mesmo portão (hit@1, hit@3, MRR, guarda de
citações com as 6 fixtures, `--com-llm N` opcional, exit code 1 abaixo do limiar) sobre a fachada
`app_py.servico` e as tabelas `_py`. Usa o MESMO [`golden.json`](solucao/golden.json) da versão JS.

Como rodar:

```bash
cd modulos/11-capstone-micro-saas
uv run python exercicios/02-avaliacao-no-ci/solucao/python/avaliar.py --com-llm 2
jq '.[2].fonte="ferias.md" | .[9].fonte="ferias.md" | .[10].fonte="ferias.md"' exercicios/02-avaliacao-no-ci/solucao/golden.json > /tmp/golden-errado.json
uv run python exercicios/02-avaliacao-no-ci/solucao/python/avaliar.py --golden /tmp/golden-errado.json; echo "exit code: $?"
```

No job nightly, troque os passos Node por `astral-sh/setup-uv`, `uv sync --frozen`, `uv run python -m app_py.seed`
e `uv run python exercicios/02-avaliacao-no-ci/solucao/python/avaliar.py` (não executado localmente: precisa de runner do GitHub).

Saída real (as 2 respostas já estavam no cache semântico `m11.cache_py`, geradas antes pela entrega 1 e pelo e2e):

```
== Recuperação (golden set rotulado: pergunta -> arquivo que responde)
  ok  pos=1 acme     Qual o valor do auxílio home office?
  ok  pos=1 acme     Posso dividir minhas férias em partes?
  ...
  ok  pos=1 padaria  Até quando entrego o atestado médico?

== Guarda de citações: 6/6 fixtures classificadas corretamente

== Respostas reais (2, LLM local)
  ok Qual o valor do auxílio home office? -> [home-office.md] (cache)
  ok Posso dividir minhas férias em partes? -> [ferias.md] (cache)

== Portão de qualidade
  PASSOU  hit@1                1.000 (mínimo 0.75)
  PASSOU  hit@3                1.000 (mínimo 0.9)
  PASSOU  mrr                  1.000 (mínimo 0.8)
  PASSOU  citacoes             1.000 (mínimo 1)
  PASSOU  citacao_correta_llm  1.000 (mínimo 1)

Resultado: APROVADO
```

Reprovação provocada (idêntica à do JS, número a número):

```
  X   pos=- acme     Quanto posso gastar com comida numa viagem a trabalho?
  X   pos=- padaria  Posso usar aliança na produção?
  ~   pos=2 padaria  Quero trocar de turno com uma colega, o que preciso fazer?
== Portão de qualidade
  PASSOU  hit@1                0.750 (mínimo 0.75)
  REPROVOU hit@3                0.833 (mínimo 0.9)
  REPROVOU mrr                  0.792 (mínimo 0.8)
  PASSOU  citacoes             1.000 (mínimo 1)
Resultado: REPROVADO (o CI falharia)
exit code: 1
```
