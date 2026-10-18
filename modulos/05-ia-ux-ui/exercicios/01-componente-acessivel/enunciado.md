# Exercício 01 · Gerar e corrigir um componente até passar nas checagens de acessibilidade

## Contexto

Um protótipo gerado por IA chegou com a barra de busca em [`componente-ruim.html`](componente-ruim.html):
ícones sem texto, `div` clicável, campo só com placeholder e dica em cinza claro. A auditoria do módulo
([`comum/acessibilidade.js`](../../comum/acessibilidade.js): axe-core + checagens próprias) dá **nota 0**.
Você vai automatizar o ciclo "auditar → pedir correção ao LLM → auditar" do [exemplo 01](../../exemplos/01-text-to-ui-acessivel/).

## Requisitos

1. Ler `componente-ruim.html`, auditar e imprimir nota e violações.
2. Em laço (no máximo 3 tentativas, configurável por `MAX_TENTATIVAS`), mandar ao LLM o HTML **atual** e as
   violações **atuais**, com regras objetivas (aria-label em botão de ícone, `alt=""` em imagem decorativa,
   `<button>` no lugar de `div` clicável, `<label for>` visível, contraste ≥ 4,5:1).
3. Só aceitar uma versão nova se ela **não piorar a nota** e **tiver conteúdo** (resposta cortada não vale).
4. Parar ao atingir 100; salvar o resultado em `solucao/saida/componente-corrigido.html`; código de saída 0 só com nota 100.

## Critério de pronto

`npm run exe01` termina com `Resultado final: nota 100/100` (ou explica, pelas violações restantes, por que não
chegou lá dentro do limite de tentativas).

## Dicas

- O contexto do modelo local é de 4096 tokens: mande o estado atual, não o histórico inteiro da conversa.
- `max_tokens` ~450 basta para esse componente; confira `finish_reason === 'length'`.
- Desafio extra: o axe não reprova `div` com `onclick` nem placeholder no lugar de label; por isso a auditoria
  do módulo tem checagens próprias (`clicavel-sem-semantica`, `rotulo-visivel`). Que outra checagem você
  adicionaria? (Ex.: foco visível, `outline: none` sem substituto.)

## Solução

[`solucao/corrigir.js`](solucao/corrigir.js)

```bash
npm run exe01
```

Saída real (os 4308 s são quase todos fila no Ollama compartilhado):

```
[original] nota 0/100 (7 elementos)
- [critical] button-name: Buttons must have discernible text (em: button)
- [serious] color-contrast: Elements must meet minimum color contrast ratio thresholds (em: p)
- [critical] image-alt: Images must have alternative text (em: img[src$="lupa.svg"], img[src$="filtro.svg"])
- [serious] clicavel-sem-semantica: Elemento com onclick precisa ser <button> ou <a> (teclado e leitor de tela) (em: div[onclick])
- [serious] rotulo-visivel: Campos precisam de <label> visível (placeholder não substitui rótulo) (em: input[name=?])

[tentativa 1] 4308s -> nota 100/100 (9 elementos)

Resultado final: nota 100/100 -> saida/componente-corrigido.html
```

Numa execução anterior, com `max_tokens` 450 e sem rejeitar respostas cortadas, deu:

```
[tentativa 1] 130s [CORTADA] -> nota 100/100 (9 elementos)

Resultado final: nota 100/100 -> saida/componente-corrigido.html
```

A resposta tinha sido **cortada no meio do `<style>`** e mesmo assim tirou 100 (o navegador "perdoa" CSS
truncado). Por isso a solução atual usa `max_tokens` 700 e rejeita `finish_reason === 'length'`.

**Revisão humana do resultado (nota 100 não é "perfeito"):** o LLM deu ao campo um `<label>` visível "Buscar
produtos" **e** um `aria-label="Campo de pesquisa de produtos"`. O `aria-label` vence, e o nome falado deixa de
conter o texto visível, o que fere a WCAG 2.5.3 (*Label in Name*): quem usa comando de voz diz "Buscar produtos"
e nada acontece. O axe não reprovou: a regra dele para a 2.5.3 (`label-content-name-mismatch`) só olha
elementos cujo texto visível é o próprio conteúdo (ex.: um botão com texto e `aria-label`), não um `<label for>` separado. Correção manual: remover o `aria-label` do input (o `<label for>` basta). Também sobrou uma lupa
decorativa duplicada fora do botão.

## Versão Python

[`solucao/python/corrigir.py`](solucao/python/corrigir.py): o mesmo laço, com o juiz Python
([`comum_py/acessibilidade.py`](../../comum_py/acessibilidade.py): axe-core 4.14.0 injetado + as mesmas checagens
próprias) e as mesmas regras de aceite (`finish_reason != "length"`, pelo menos 3 elementos, nota não pior).
O componente continua HTML/CSS. Saída em `solucao/python/saida/componente-corrigido.html`.
[`solucao/python/test_juiz.py`](solucao/python/test_juiz.py) confere, sem LLM, que o juiz Python dá 0 ao original
(com as 5 regras) e 100 à versão corrigida registrada do JS.

**Como rodar** (da pasta do módulo):

```bash
uv run pytest exercicios/01-componente-acessivel                          # juiz, sem LLM
uv run python exercicios/01-componente-acessivel/solucao/python/corrigir.py   # até 3 chamadas (MAX_TENTATIVAS)
```

**Saída esperada (Python)** (saída real):

```
[original] nota 0/100 (7 elementos)
- [critical] button-name: Buttons must have discernible text (em: button)
- [serious] color-contrast: Elements must meet minimum color contrast ratio thresholds (em: p)
- [critical] image-alt: Images must have alternative text (em: img[src$="lupa.svg"], img[src$="filtro.svg"])
- [serious] clicavel-sem-semantica: Elemento com onclick precisa ser <button> ou <a> (teclado e leitor de tela) (em: div[onclick])
- [serious] rotulo-visivel: Campos precisam de <label> visível (placeholder não substitui rótulo) (em: input[name=?])

[tentativa 1] 154s -> nota 100/100 (9 elementos)

Resultado final: nota 100/100 -> saida/componente-corrigido.html
```

As mesmas violações e a mesma nota do JS, e o modelo repetiu o mesmo deslize: `<label for>` visível "Buscar produtos"
**e** `aria-label="Campo de pesquisa de produtos"` no input (fere a WCAG 2.5.3, e o axe não pega). A revisão humana
descrita acima vale igual para a versão Python.
