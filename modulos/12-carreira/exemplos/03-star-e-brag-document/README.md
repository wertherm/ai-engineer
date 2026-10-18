# Exemplo 03 · Histórias STAR e brag document

**Conceito novo:** evidência estruturada. Para a entrevista de RH, histórias no formato **STAR** (Situação,
Tarefa, Ação, Resultado) com a ação na primeira pessoa e o resultado medido. Para promoção/aumento, um
**brag document** (registro contínuo de impacto) que vira um caso por eixo do nível-alvo.

**Pré-requisito:** nenhum além do Node. Pessoas e números são **fictícios** (marcados nos JSON).

- `template-star.md` e `template-brag-document.md`: modelos para copiar.
- `historias.json` + `validar-star.js`: 6 checagens (partes, proporção de contexto <= 30%, "eu" > "nós",
  número no resultado, aprendizado, 1–3 min falando a ~150 palavras/min).
- `brag.json` + `caso-de-promocao.js`: agrupa entradas por eixo (impacto, escopo, liderança, execução),
  calcula antes → depois e aponta o eixo sem evidência.

## Como rodar

```bash
cd modulos/12-carreira
npm run ex03
node --test exemplos/03-star-e-brag-document/
```

## Saída esperada

Saída real (2026-10-16):

```text
✓ custo-do-rag · 165 palavras (~1.1 min falando)
   [x] quatro partes preenchidas
   [x] contexto (S+T) <= 30% do texto
   [x] ação na 1ª pessoa do singular
   [x] resultado com número
   [x] resultado com aprendizado
   [x] cabe em 1–3 min falando

✗ migracao-fraca · 57 palavras (~0.4 min falando)
   [x] quatro partes preenchidas
   [ ] contexto (S+T) <= 30% do texto
   [ ] ação na 1ª pessoa do singular
   [ ] resultado com número
   [ ] resultado com aprendizado
   [ ] cabe em 1–3 min falando
# Caso de promoção · Ana (fictícia) → Sênior

## impacto — resultados mensuráveis para o negócio, não só tarefas entregues
- 2026-03-14 · Reduzi o custo por pergunta do assistente de RH: 0.011 → 0.004 (-64%) US$/pergunta · evidência: dashboard de custo + PR de cache
- 2026-04-02 · Portão de avaliação no CI para prompts: 0 → 60 casos avaliados por deploy · evidência: pipeline do CI
...
## execucao — entrega previsível, com qualidade e operação (testes, observabilidade)
- (sem evidência registrada)

Lacunas para resolver ANTES da conversa: execucao
```

## Experimente

1. Escreva 5 histórias suas (um projeto difícil, um conflito, uma falha, uma decisão sob ambiguidade, uma
   mentoria) em `historias.json` e passe todas no validador.
2. Reescreva `migracao-fraca` até passar: quanto tempo você gastou com o contexto e quanto com a ação?
3. Adicione uma entrada de `execucao` no `brag.json` e veja a lacuna sumir.

## Versão Python

`python/validar_star.py`, `python/caso_de_promocao.py` e `python/test_star_e_brag.py` (pytest). Lê os mesmos
`historias.json` e `brag.json`.

### Como rodar

```bash
cd modulos/12-carreira
uv run python exemplos/03-star-e-brag-document/python/validar_star.py
uv run python exemplos/03-star-e-brag-document/python/caso_de_promocao.py
uv run pytest exemplos/03-star-e-brag-document/
```

### Saída esperada (Python)

Saída real (2026-10-17), encurtada; idêntica à do `npm run ex03` (`diff` vazio):

```text
✓ custo-do-rag · 165 palavras (~1.1 min falando)
   [x] quatro partes preenchidas
   ...
✗ migracao-fraca · 57 palavras (~0.4 min falando)
   [x] quatro partes preenchidas
   [ ] contexto (S+T) <= 30% do texto
   ...
# Caso de promoção · Ana (fictícia) → Sênior

## impacto — resultados mensuráveis para o negócio, não só tarefas entregues
- 2026-03-14 · Reduzi o custo por pergunta do assistente de RH: 0.011 → 0.004 (-64%) US$/pergunta · evidência: dashboard de custo + PR de cache
...
Lacunas para resolver ANTES da conversa: execucao
```

Duas diferenças de linguagem tratadas no código: (1) as regex de 1ª pessoa usam `re.ASCII`, porque no
JS (sem a flag `u`) `\w`/`\b` são ASCII. Sem isso, o Python contaria "faríamos" como plural e o JS não
(há um teste para isso); (2) `toFixed` virou `comum_py.formato.to_fixed` (meio para cima, como no JS).
