# Exemplo 01 · Text-to-UI acessível: gerar, renderizar, auditar e corrigir

**Conceito novo:** gerar UI a partir de linguagem natural e **medir** o resultado no navegador: o LLM local gera
HTML/CSS, o Chrome headless renderiza e tira screenshot, o **axe-core** (WCAG 2.1 A/AA) e duas checagens próprias
auditam, e as violações voltam ao LLM numa segunda iteração. Nota de 0 a 100 antes e depois.

**Pré-requisito:** infra no ar (Ollama) e `npm install` na pasta do módulo. Google Chrome instalado.

## Arquivos

| Arquivo | Papel |
|---|---|
| [`gerar.js`](gerar.js) | Descrição → v1 (prompt ingênuo) → auditoria → v2 (com o relatório do axe) → auditoria |
| [`../../comum/acessibilidade.js`](../../comum/acessibilidade.js) | `auditar()`: Chrome + `@axe-core/playwright` + checagens `rotulo-visivel` e `clicavel-sem-semantica`; `nota()` |
| [`acessibilidade.test.js`](acessibilidade.test.js) | Testa o "juiz" sem LLM (HTML ruim, HTML bom, documento vazio) |
| `saida/` | `v1.html`, `v2.html`, `v1.png`, `v2.png` gerados (ignorados pelo git) |

## Como rodar

```bash
cd modulos/05-ia-ux-ui
node --test "exemplos/01-text-to-ui-acessivel/*.test.js"   # o juiz, sem LLM (~5 s)
npm run ex01                                                # 2 chamadas ao LLM (5 a 15 min em CPU com fila)
npm run ex01 -- "Barra de busca com botão de ícone de lupa e filtros em chips"   # sua descrição
```

## Saída esperada

Teste do juiz (saída real):

```
✔ HTML com problemas clássicos perde pontos
✔ HTML acessível tira 100
✔ nota desconta por nó afetado e por impacto
✔ documento sem conteúdo (resposta cortada) tira 0, não 100
ℹ pass 4
ℹ fail 0
```

**Execução registrada** (o prompt da v2 ainda sem a frase de prioridade), saída real:

```
[v1] 318s, 788 tokens, 16 elementos -> nota 85/100, 1 regra(s) violada(s)
- [serious] color-contrast: Elements must meet minimum color contrast ratio thresholds (em: p)

[v2] 410s, 871 tokens, 16 elementos -> nota 85/100, 1 regra(s) violada(s)
- [serious] color-contrast: Elements must meet minimum color contrast ratio thresholds (em: p)

Nota: 85 -> 85 | arquivos em .../saida (v1/v2 .html e .png)
```

O v2 tinha no CSS `color: #9e9e9e; /* Mantido conforme solicitado, mas texto é curto */`: o pedido de cor da
descrição e a regra de contraste **conflitavam**, e o modelo preferiu o pedido. Correção no prompt: "acessibilidade
tem **prioridade** sobre as cores pedidas: troque #9e9e9e por #595959". Execução com o prompt atual (saída real):

```
Modelo: qwen3.5:4b
Descrição: Card de inscrição na newsletter: logo da empresa (imagem logo.png), título, campos nome e e-mail, checkbox "aceito receber e-mails" e botão Enviar. Textos auxiliares em cinza #9e9e9e sobre fundo branco, estilo minimalista.

[v1] 142s, 788 tokens, 16 elementos -> nota 85/100, 1 regra(s) violada(s)
- [serious] color-contrast: Elements must meet minimum color contrast ratio thresholds (em: p)

[v2] 2471s, 788 tokens, 16 elementos -> nota 100/100, 0 regra(s) violada(s)
  (nenhuma violação)

Nota: 85 -> 100 | arquivos em .../saida (v1/v2 .html e .png)
```

O tempo da v2 (2471 s) é quase todo **fila**: o Ollama é compartilhado e atende um pedido por vez
(`-np 1`); a geração em si leva de 2 a 7 min. Com `temperature: 0` e `seed`, a v1 sai igual em toda execução.

Antes disso, a 1ª versão do exemplo pedia "HTML com `<style>`" e `max_tokens` 700: o modelo gastou tudo no CSS, a
resposta foi **cortada antes do markup** e o axe deu **nota 100 a um documento vazio**. Daí o "markup primeiro, CSS
curto no fim", o aviso `[CORTADA por max_tokens]` e a contagem de `elementos` (nota 0 se nada renderizou).

## Experimente

1. Troque a descrição por algo com ícones ("barra de ferramentas com botões de ícone") e veja `button-name`
   e `image-alt` aparecerem.
2. Mande o `saida/v1.png` para o modelo com visão (`image_url` em data URI, como no
   [módulo 02](../../../02-apis-ia-generativa/exemplos/05-documentos-ocr-e-visao/)) pedindo uma avaliação pelas
   heurísticas de Nielsen, e compare com o que o axe encontrou.
3. Adicione uma checagem própria em `comum/acessibilidade.js` (ex.: `outline: none` sem estilo de `:focus-visible`).

## Versão Python

| Arquivo | Papel |
|---|---|
| [`python/gerar.py`](python/gerar.py) | Mesmo fluxo do `gerar.js` (mesmos prompts e `max_tokens`), com Playwright async + SDK `openai` Python |
| [`../../comum_py/acessibilidade.py`](../../comum_py/acessibilidade.py) | `auditar()`: injeta o **mesmo** `node_modules/axe-core/axe.min.js` (4.14.0) com `page.add_script_tag` + `page.evaluate("axe.run(...)")`, mais as checagens `rotulo-visivel` e `clicavel-sem-semantica`, nota 0 se nada renderizou |
| [`python/test_acessibilidade.py`](python/test_acessibilidade.py) | O juiz em pytest (5 testes, sem LLM) |

Por que injetar o `axe.min.js` em vez do pacote `axe-playwright-python` 0.1.8: ele embute o axe **4.12.1** (o JS usa
4.14.0, regras e mensagens diferentes) e é só um wrapper das mesmas duas chamadas. Com o mesmo arquivo, o juiz Python
e o JS dão a mesma nota. As checagens próprias rodam dentro da página, então continuam em JavaScript
(`page.eval_on_selector_all`). O `finish_reason == "length"` aparece como `[CORTADA por max_tokens]`.

**Como rodar** (da pasta do módulo, depois de `npm install` e `uv sync`):

```bash
uv run pytest exemplos/01-text-to-ui-acessivel/python -vv        # o juiz, sem LLM (~5 s)
uv run python exemplos/01-text-to-ui-acessivel/python/gerar.py   # 2 chamadas ao LLM
```

**Saída esperada (Python)** (saída real; teste encurtado):

```
test_html_com_problemas_classicos_perde_pontos PASSED [ 20%]
test_html_acessivel_tira_100 PASSED [ 40%]
test_nota_desconta_por_no_afetado_e_por_impacto PASSED [ 60%]
test_div_clicavel_e_acusada_pela_checagem_propria PASSED [ 80%]
test_documento_sem_conteudo_tira_0_nao_100 PASSED [100%]
============================== 5 passed in 7.14s ===============================
```

```
Modelo: qwen3.5:4b
Descrição: Card de inscrição na newsletter: logo da empresa (imagem logo.png), título, campos nome e e-mail, checkbox "aceito receber e-mails" e botão Enviar. Textos auxiliares em cinza #9e9e9e sobre fundo branco, estilo minimalista.

[v1] 245s, 788 tokens, 16 elementos -> nota 85/100, 1 regra(s) violada(s)
- [serious] color-contrast: Elements must meet minimum color contrast ratio thresholds (em: p)

[v2] 287s, 788 tokens, 16 elementos -> nota 100/100, 0 regra(s) violada(s)
  (nenhuma violação)

Nota: 85 -> 100 | arquivos em .../exemplos/01-text-to-ui-acessivel/python/saida (v1/v2 .html e .png)
```

Com `temperature=0` e `seed=42`, o SDK Python recebeu do modelo as **mesmas** respostas que o JS (788 tokens nas
duas iterações e a mesma nota 85 → 100): o prompt é que manda, não a linguagem do cliente.
