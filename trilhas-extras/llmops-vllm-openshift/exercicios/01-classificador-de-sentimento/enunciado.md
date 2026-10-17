# Exercício 01 · Classificador de sentimento (prompt engineering medido)

**Tópicos praticados:** exemplos 01, 02 e 05 · [docs/05](../../docs/05-avaliacao.md)

## Contexto

O time de atendimento quer marcar cada mensagem de cliente como `positivo`, `negativo` ou `neutro`,
usando o modelo self-hosted (`qwen-mini`) em vez de uma API paga.

## Requisitos

1. Crie `classificar.py` com uma função `classificar(frase: str) -> str` que devolva **sempre** um dos três rótulos.
2. Crie `test_classificar.py` com pelo menos 6 frases (2 de cada rótulo) e rode com pytest.
3. **Itere o prompt medindo**: anote no código a taxa de acerto de cada versão que você tentar.
4. Se sobrar um caso que o modelo não acerta, registre como `xfail` com o motivo. Não esconda o caso.

## Critério de pronto

- `uv run pytest` dentro da sua pasta passa (com no máximo 1 `xfail` justificado).
- O histórico de versões do prompt, com a taxa de acerto de cada uma, está comentado no código.

## Dicas

- `temperature=0` e `max_tokens` baixo (o rótulo cabe em ~3 tokens).
- *Few-shot*: mensagens `user`/`assistant` de exemplo antes da frase real.
- Normalize a saída: o modelo pode responder `Positivo.` em vez de `positivo`.
- Modelos pequenos têm viés. Veja qual rótulo ele "puxa" e compense no prompt.

A solução está em [`solucao/`](solucao/). Ela chega a 5/6 e registra a 6ª frase como falha conhecida.
Rode com `cd exercicios/01-classificador-de-sentimento/solucao && uv run pytest -v`.
