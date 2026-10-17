# Exemplo 01 · Auditoria de README de portfólio

**Conceito novo:** o README é a vitrine do projeto. Um checklist **executável** transforma "o que o
recrutador procura" (propósito, como rodar, saída real, números medidos, diagrama, demo, limitações) em
critérios objetivos, que você roda no seu repositório antes de mandar o link.

**Pré-requisito:** `npm install` na pasta do módulo (este exemplo não usa LLM nem banco).

- `checklist.js`: 10 critérios com peso; 5 são obrigatórios. Passa com nota >= 80% e todos os obrigatórios.
- `auditar.js`: audita pastas reais deste repositório (ou as que você passar).
- `template-readme.md`: modelo de README de projeto de IA que passa no checklist quando preenchido.
- `fixtures/projeto-fraco/`: o README típico de portfólio iniciante ("funciona muito bem e é rápido").

## Como rodar

```bash
cd modulos/12-carreira
npm run ex01                                             # pastas padrão
node exemplos/01-auditoria-de-readme/auditar.js ../03-mcp   # qualquer pasta
node --test exemplos/01-auditoria-de-readme/             # testes do checklist
```

## Saída esperada

Saída real (2026-10-16), encurtada:

```text
✗ trilhas-extras/llmops-vllm-openshift/projeto-final · nota 79% · NÃO PASSA
   [x] proposito       *
   [x] como-rodar      *
   [ ] pre-requisitos    Pré-requisitos explícitos (runtime, serviços, variáveis)
   [x] saida-real      *
   [x] metricas        *
   [x] diagrama
   [x] demo
   [ ] limitacoes      * Limitações, trade-offs ou o que NÃO foi executado (honestidade técnica)
   [x] testes
   [x] versoes
   faltando (obrigatório): limitacoes

✗ modulos/03-mcp/exemplos/04-mcp-http-producao · nota 57% · NÃO PASSA
   ...
   faltando (obrigatório): metricas, limitacoes
...
✗ modulos/12-carreira/exemplos/01-auditoria-de-readme/fixtures/projeto-fraco · nota 0% · NÃO PASSA
   ...
   faltando (obrigatório): proposito, como-rodar, saida-real, metricas, limitacoes

0/4 READMEs passam no checklist (* = obrigatório).
```

Repare: nem os READMEs deste repositório passam. Eles foram escritos para **estudo** (como rodar e o que
sai), não para **portfólio** (que problema resolve, quanto melhorou, o que ainda não funciona). O projeto
final da trilha LLMOps está a um critério de passar: é o melhor candidato a virar peça de portfólio, e é
justamente o que o [exercício 01](../../exercicios/01-readme-que-passa/) faz.

## Experimente

1. Rode `node exemplos/01-auditoria-de-readme/auditar.js .` dentro de um repositório seu e corrija até passar.
2. Copie o `template-readme.md` para um projeto real, preencha com números medidos e rode a auditoria.
3. Endureça o critério `metricas` (ex.: exigir uma tabela "Resultados medidos") e veja quem deixa de passar.
