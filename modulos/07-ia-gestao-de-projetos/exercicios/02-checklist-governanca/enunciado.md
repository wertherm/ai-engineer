# Exercício 02 · Checklist de governança automatizado em JavaScript

## Contexto

A auditoria interna pede evidência de que todo projeto segue o mínimo de governança: documentação,
controle de versões, decisões registradas, rastreabilidade de requisito até teste e nenhum segredo no
código. Fazer isso à mão a cada release não escala. Você vai escrever um checklist que audita uma
pasta de projeto, imprime o resultado com evidências, grava um JSON para o auditor e **sai com código 1
se algo falhar** (para virar etapa de CI).

A pasta `projeto-exemplo/` é um projeto fictício com falhas plantadas.

Teoria: [doc 04 · U8 Governança](../../docs/04-automacao-governanca-e-integracoes.md).

## Requisitos

Cada verificação é uma função `(pasta) => { ok, evidencia }` (`ok = null` quando não se aplica):

| ID | Verificação |
|---|---|
| GOV-01 | `README.md` e `CHANGELOG.md` existem |
| GOV-02 | a `version` do `package.json` aparece no CHANGELOG como `[x.y.z]` |
| GOV-03 | dependências com versão exata (sem `^`, `~`, `*`, `latest`, intervalos) |
| GOV-04 | todo ADR em `docs/adr/*.md` tem `Status:`, `Data:` e `Decisores:` |
| GOV-05 | todo `HU-xx` de `docs/requisitos.md` é citado em algum `*.test.js` |
| GOV-06 | nenhum segredo fixo (`api_key`, `secret`, `password`, `senha`, `token` = string com 8+ caracteres) |
| GOV-07 | se for repositório git, existe a tag `v<version>`; senão, pula |

## Critério de pronto

- No `projeto-exemplo`, falham exatamente GOV-02, GOV-03, GOV-04, GOV-05 e GOV-06; GOV-07 é pulado.
- `auditoria.json` gravado com data, pasta, total de falhas e evidências.
- Código de saída 1 quando há falha.

## Dicas

- Percorra os arquivos recursivamente ignorando `node_modules` e `.git`.
- Use `execFileSync('git', ['-C', pasta, 'tag', '--list'])` (sem shell, sem injeção).
- Nada de LLM na verificação: auditoria precisa dar o mesmo resultado sempre. Um LLM pode, no máximo,
  **sugerir** o texto do ADR que está faltando.

## Solução

`solucao/checklist.js` (verificações), `solucao/main.js` (CLI), `solucao/checklist.test.js`.

```bash
cd modulos/07-ia-gestao-de-projetos
npm run exe02                                   # audita projeto-exemplo/ (sai com código 1: há falhas)
node exercicios/02-checklist-governanca/solucao/main.js /caminho/de/outro/projeto
node --test exercicios/02-checklist-governanca/solucao/checklist.test.js
```

Saída real:

```text
Auditoria de governança: /home/werther/Repos/ai-engineer/modulos/07-ia-gestao-de-projetos/exercicios/02-checklist-governanca/projeto-exemplo

✅ GOV-01 README e CHANGELOG presentes
      ambos presentes
❌ GOV-02 Versão do package.json registrada no CHANGELOG (controle de versão)
      versão 1.3.0 não aparece no CHANGELOG
❌ GOV-03 Dependências com versão exata (build reproduzível)
      zod@^4.6.7
❌ GOV-04 ADRs com Status, Data e Decisores (trilha de decisão)
      incompletos: 0002-email-sem-link.md
❌ GOV-05 Rastreabilidade: todo requisito citado em algum teste
      sem teste: HU-02
❌ GOV-06 Sem segredo fixo no código
      possível segredo em: src/config.js
⏭  GOV-07 Tag git da versão atual (se for repositório git)
      não é repositório git: verificação pulada

5 falha(s). Evidências em solucao/auditoria.json
```

(código de saída 1)

```text
✔ projeto-exemplo falha exatamente nos itens plantados
ℹ pass 1
```

## Para ir além

- Corrija o `projeto-exemplo` até o checklist passar com código 0.
- Rode o checklist em um repositório seu (ex.: um serviço NestJS) e transforme em job de CI.
- Adicione GOV-08: todo commit desde a última tag segue Conventional Commits (`git log v1.2.0..HEAD`).

## Versão Python

Solução em [`solucao/python/`](solucao/python/): `checklist.py` (uma função por verificação, `pathlib` +
`re` + `subprocess.run([...])` sem shell para o `git tag`), `main.py` (CLI, grava
`solucao/python/auditoria.json`) e `test_checklist.py`. Audita o mesmo `projeto-exemplo/` (um projeto Node:
as regras olham `package.json`, CHANGELOG, ADRs e `*.test.js`). Os arquivos são percorridos em ordem
alfabética (`sorted`) para a evidência sair estável.

### Como rodar

```bash
cd modulos/07-ia-gestao-de-projetos
uv run python exercicios/02-checklist-governanca/solucao/python/main.py      # sai com código 1 de propósito
uv run python exercicios/02-checklist-governanca/solucao/python/main.py /caminho/de/outro/projeto
uv run pytest exercicios/02-checklist-governanca/solucao/python
```

### Saída esperada (Python)

Saída real:

```text
Auditoria de governança: /home/werther/Repos/ai-engineer/modulos/07-ia-gestao-de-projetos/exercicios/02-checklist-governanca/projeto-exemplo

✅ GOV-01 README e CHANGELOG presentes
      ambos presentes
❌ GOV-02 Versão do package.json registrada no CHANGELOG (controle de versão)
      versão 1.3.0 não aparece no CHANGELOG
❌ GOV-03 Dependências com versão exata (build reproduzível)
      zod@^4.6.7
❌ GOV-04 ADRs com Status, Data e Decisores (trilha de decisão)
      incompletos: 0002-email-sem-link.md
❌ GOV-05 Rastreabilidade: todo requisito citado em algum teste
      sem teste: HU-02
❌ GOV-06 Sem segredo fixo no código
      possível segredo em: src/config.js
⏭  GOV-07 Tag git da versão atual (se for repositório git)
      não é repositório git: verificação pulada

5 falha(s). Evidências em solucao/python/auditoria.json
```

(código de saída 1)

```text
.                                                                        [100%]
1 passed
```
