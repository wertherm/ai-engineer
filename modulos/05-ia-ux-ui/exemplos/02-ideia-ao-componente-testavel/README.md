# Exemplo 02 · Da ideia ao componente funcional e testável

**Conceito novo:** o fluxo "spec → componente gerado → testes gerados **a partir da spec** → testes de aceitação
humanos → execução real", e o que fazer quando o LLM erra (correção humana documentada). Inclui a configuração de
um agente de terminal (Gemini CLI) para o mesmo fluxo.

**Pré-requisito:** [exemplo 01](../01-text-to-ui-acessivel/) (gerar código com o LLM e verificar automaticamente).

## Arquivos

| Arquivo | Papel |
|---|---|
| [`spec.md`](spec.md) | A ideia virou spec curta, numerada e verificável (componente de paginação) |
| [`main.js`](main.js) | Gera `gerado/paginacao.js` e `gerado/paginacao.test.js` (2 chamadas ao LLM) e roda os testes |
| [`aceitacao.test.js`](aceitacao.test.js) | Testes de aceitação escritos por humano: o portão |
| [`execucao-registrada/`](execucao-registrada/) | O que o LLM gerou na 1ª execução (componente e teste quebrado) |
| [`correcao-humana/paginacao.js`](correcao-humana/paginacao.js) | A correção feita à mão, com o porquê |
| [`gemini/`](gemini/) | `GEMINI.md` + `.gemini/settings.json` para fazer o mesmo fluxo no Gemini CLI (⚠️ não executado localmente: exige login) |

## Como rodar

```bash
cd modulos/05-ia-ux-ui
npm run ex02             # gera e testa (2 chamadas ao LLM; de 2 a 15 min em CPU, conforme a fila do Ollama)
npm run ex02:corrigido   # roda a aceitação contra a correção humana (sem LLM)
```

## Saída esperada

**1ª execução registrada** (prompt de teste sem "não crie mock", `max_tokens` 500), saída real:

```
[componente] 274s, 219 tokens -> gerado/paginacao.js
[teste do LLM] 497s, 500 tokens -> gerado/paginacao.test.js

== testes gerados pelo LLM: pass 0, fail 1
✖ .../gerado/paginacao.test.js (124.494426ms)

== testes de aceitação (humanos): pass 3, fail 1
✖ só a página atual tem aria-current (3.614718ms)

Resultado: testes do LLM FALHARAM; aceitação REPROVADA (veja a seção "Correção humana" do README)
```

O que aconteceu (arquivos em [`execucao-registrada/`](execucao-registrada/)):

- **Componente:** validação e links corretos, mas **sem `aria-current`** e com os botões **fora do `<nav>`**, os
  dois depois da lista. Os testes de aceitação pegaram o primeiro; o segundo apareceu na leitura do diff.
- **Teste do LLM:** dois defeitos clássicos. (1) Em vez de importar o módulo, o modelo **escreveu um mock** do
  componente e testou o mock, ou seja, não testava nada. (2) Bateu nos 500 tokens e o arquivo terminou no meio de
  uma string: `SyntaxError: Invalid or unexpected token`.

### Correção humana

1. No componente: `aria-current="page"` no link da página atual; botões dentro do `<nav>`, Anterior antes e Próxima
   depois da lista; `type="button"`. Resultado:

```
$ npm run ex02:corrigido
✔ nav com aria-label e um link por página (4.008619ms)
✔ só a página atual tem aria-current (1.153852ms)
✔ Anterior desabilitado na 1ª página e Próxima na última (1.227193ms)
✔ RangeError para entradas inválidas (2.047277ms)
ℹ pass 4
ℹ fail 0
```

2. No prompt de teste (`main.js`): "importe o módulo real... **NÃO crie mock** nem reimplemente a função",
   "4 testes CURTOS (1 a 3 asserts cada)" e `max_tokens` 700.

**2ª execução, com o prompt corrigido** (saída real):

```
[componente] 261s, 219 tokens -> gerado/paginacao.js
[teste do LLM] 224s, 414 tokens -> gerado/paginacao.test.js

== testes gerados pelo LLM: pass 0, fail 1
✖ .../gerado/paginacao.test.js (114.463893ms)

== testes de aceitação (humanos): pass 3, fail 1
✖ só a página atual tem aria-current (3.695502ms)

Resultado: testes do LLM FALHARAM; aceitação REPROVADA (veja a seção "Correção humana" do README)
```

Com `temperature: 0` e `seed`, o componente saiu **idêntico** (mesmo bug). O teste melhorou (importa o módulo
real, sem mock, coube em 414 tokens), mas trouxe dois erros novos
([`execucao-registrada/paginacao.test.gerado-2.js.txt`](execucao-registrada/paginacao.test.gerado-2.js.txt)):

- **Esqueceu os imports** de `node:test` e `node:assert`: `ReferenceError: test is not defined`. Corrigindo só
  isso à mão, os testes do LLM rodam e **também pegam** o `aria-current` ausente (2 pass, 2 fail contra o
  componente gerado).
- **Um teste contradiz a spec:** espera `<button>Anterior</button>` (sem `disabled`) na página 1. Contra a
  correção humana ele continua falhando (3 pass, 1 fail): o erro está no teste, não no componente.

Moral: teste gerado por LLM é **rascunho de teste**. Ele precisa de revisão como qualquer código, e o portão de
aceitação escrito a partir da spec é o que decide.

## Experimente

1. Mostre o código gerado ao LLM ao pedir os testes e compare: os testes passam a "confirmar" os bugs?
2. Devolva ao LLM a saída do `node --test` que falhou e peça a correção (o ciclo do exercício 01, agora com testes).
3. Use o [`gemini/GEMINI.md`](gemini/GEMINI.md) num projeto seu e rode
   `gemini -p "implemente @spec.md e os testes; rode node --test até passar" --approval-mode auto_edit`
   (exige login no Gemini CLI).
