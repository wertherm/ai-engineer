# Guia rápido · como estudar na Academia

A versão curta de como usar a Academia no dia a dia. Os detalhes estão no [README da Academia](README.md) e em
[SINCRONIZACAO.md](SINCRONIZACAO.md).

São três momentos: **preparar uma vez**, **estudar em sessões** e **avançar no roadmap**.

## 1 · Uma vez só (preparar)

```bash
cd ~/Repos/ai-engineer
git switch main && git pull      # pega a versão mais nova
bash infra/subir-ia.sh           # liga o LLM local (Ollama) e o banco (Postgres)
```

Seu aluno é uma pasta em [`alunos/`](alunos/). Aluno novo: `node academia/ferramentas/academia.mjs novo-aluno <slug> "Nome"`.

## 2 · Cada sessão de estudo (sempre o mesmo ciclo)

```
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │ 1. ABRIR     │──▶│ 2. ESTUDAR   │──▶│ 3. REGISTRAR │──▶│ 4. SALVAR    │
 │ assistente   │   │ quiz, lab,   │   │ relatório +  │   │ commit numa  │
 │ na pasta     │   │ explicação   │   │ XP da sessão │   │ branch e PR  │
 └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
        ▲                                                         │
        └────────────────── próxima sessão ◀──────────────────────┘
```

1. **Abrir.** Abra um assistente de IA com acesso ao repositório (ex.: `claude` dentro de `~/Repos/ai-engineer`) e diga:
   > "Sou o aluno `<aluno>`. Vamos estudar a próxima lição da Academia."

   Ele lê sozinho as regras ([`AI_CONTEXT.md`](../AI_CONTEXT.md)), o seu `alunos/<aluno>/retomada.md` (onde você parou) e
   a lição. Assistente sem acesso ao repositório? Gere o texto para colar:
   `node academia/ferramentas/academia.mjs kit <aluno>`.
2. **Estudar.** Uma atividade por vez: quiz, exemplos, laboratório (você faz, ele confere) e você explicando o que
   aprendeu. Ele não entrega a resposta antes de você tentar.
3. **Registrar.** No fim, peça "encerra a sessão e registra". São estes comandos:
   ```bash
   node academia/ferramentas/academia.mjs sessao <aluno>          # cria o relatório da sessão
   node academia/ferramentas/academia.mjs progresso <aluno>       # atualiza o "onde parei"
   node academia/ferramentas/academia.mjs validar --aluno <aluno> # confere tudo
   ```
4. **Salvar.** Commit numa **branch** e pull request. Nunca direto na `main`.

**Voltando depois de dias?** É só repetir o passo 1: o `retomada.md` lembra o que você fez e a sessão começa com
perguntas de revisão. Pausa não custa nada.

## 3 · A ordem do que estudar

```
Missão 0 (diagnóstico) → Lição 1 (tokens) → Etapa 2 → … → Etapa 16 (capstone)
```

O status de cada etapa está no [ROADMAP](ROADMAP.md): `pronta` tem a lição completa (quiz, laboratório e XP);
`roteiro` ainda não tem lição escrita. Ao chegar numa etapa em `roteiro`:

- **escreva a lição antes**: peça ao assistente "escreve a lição da etapa N pelo template" (ele segue o
  [template](templates/licao.md), marca a etapa como `pronta` e registra no [CHANGELOG](CHANGELOG.md)); ou
- **estude pelo material que já existe**: os docs e exemplos (JS e Python) dos [módulos](../modulos/) que o ROADMAP
  aponta para a etapa, sem XP.

## Resumo em 3 linhas

1. `cd ~/Repos/ai-engineer && bash infra/subir-ia.sh && claude`
2. "Sou o aluno `<aluno>`, vamos estudar a próxima lição."
3. No fim: "encerra a sessão, registra e salva numa branch".
