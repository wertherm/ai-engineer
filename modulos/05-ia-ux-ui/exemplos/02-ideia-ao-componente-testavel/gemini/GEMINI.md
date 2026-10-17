# Contexto do projeto (lido pelo Gemini CLI a cada prompt)

## Stack
- Front-end em JavaScript moderno (ES modules), HTML semântico e CSS sem framework.
- Testes com `node:test` + `node:assert/strict`; E2E com `playwright-core` (Chrome do sistema).

## Regras para gerar componentes
- Um componente = uma função pura que recebe props e devolve HTML (string) ou um elemento.
- Acessibilidade é requisito: `<label for>` em todo campo, `alt` em toda imagem, contraste >= 4.5:1,
  `aria-current`/`aria-live` quando houver estado. Nada de `div` clicável: use `button`/`a`.
- Escreva o teste ANTES ou junto do componente, a partir da spec, e rode `node --test`.
- Nunca coloque chave de API no front-end: IA só via `/api/*` do servidor.

## Comandos
- Testes: `node --test "exemplos/**/*.test.js"`
- Auditoria de acessibilidade: `node exemplos/01-text-to-ui-acessivel/gerar.js`

@./spec-padrao.md
