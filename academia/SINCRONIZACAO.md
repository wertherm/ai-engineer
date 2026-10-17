# Sincronização e retomada

O conhecimento e o progresso ficam **nos arquivos do repositório**, não no histórico de uma conversa. Uma conversa
pode acabar, o assistente pode mudar, o aluno pode passar semanas sem estudar: o curso continua de onde parou.

> Um chat (ChatGPT ou outro) normalmente **não** consegue ler nem escrever o repositório sozinho, e não enxerga os
> dados do outro aluno. Por isso a sincronização é **manual**: o aluno leva o contexto para a conversa (o comando
> `kit` monta tudo de uma vez) e traz o relatório da sessão de volta. Um agente com acesso ao repositório (Claude
> Code, Codex, Cursor...) pode fazer os mesmos passos sozinho.

## O que cada arquivo guarda

| Arquivo | Quem escreve | Para quê |
|---|---|---|
| [`AI_CONTEXT.md`](../AI_CONTEXT.md) | mantenedores | regras que o assistente segue |
| `alunos/<aluno>/perfil.md` | o aluno | objetivo, ritmo, ambiente, `compartilhar_xp` |
| `alunos/<aluno>/sessoes/AAAA-MM-DD-sNN.md` | o assistente propõe, o aluno salva | **fonte de verdade**: atividades, XP, competências, feedback, pendências. Um arquivo por sessão, nunca editado depois |
| `alunos/<aluno>/entregas/etapa-NN/` | o aluno | código, relatórios e respostas que servem de evidência |
| `alunos/<aluno>/retomada.md` | **gerado** | cartão de retomada: onde parou, nível, pendências, último feedback, revisões sugeridas, próxima sessão |
| [`PROGRESS.md`](PROGRESS.md) | **gerado** | visão geral dos alunos |

Os arquivos gerados nunca são editados à mão: `node academia/ferramentas/academia.mjs progresso <aluno>` os recria a
partir das sessões. Se estiverem desatualizados, o `validar` avisa.

> **Privacidade.** O repositório é compartilhado (e pode ser público): perfil, sessões e entregas de cada aluno ficam
> visíveis a quem tem acesso. Não escreva dados pessoais sensíveis nem segredos. O `PROGRESS.md` mostra o nível e a
> etapa de cada aluno; o XP só aparece para quem escreveu `compartilhar_xp: sim`. A regra de ouro: cada aluno e cada
> assistente mexe **apenas** na pasta do aluno da conversa; ler o trabalho do outro só acontece numa revisão por
> pares combinada pelos dois.

## Início da sessão

1. Gere o **kit de colagem** do aluno:

   ```bash
   node academia/ferramentas/academia.mjs kit <aluno> > kit.txt     # ou: ... | clip   (Windows)  /  | pbcopy  (macOS)
   ```

   O kit reúne, nesta ordem: as instruções ao tutor, o `AI_CONTEXT.md`, as tabelas de XP e de competências, o modelo
   de relatório de sessão, o seu `retomada.md`, a lição da etapa atual (**sem** o gabarito) e o quiz das revisões
   sugeridas. No topo ele informa os dados da sessão a registrar: aluno, **número da sessão**, data e etapa.
2. Abra uma conversa nova com o assistente e cole o kit inteiro. Sem Node? Cole à mão os mesmos arquivos, na mesma
   ordem (a lista está no topo do kit), e pegue o número da sessão em `retomada.md` ("Próxima sessão").
3. O assistente começa pelas revisões sugeridas (até três perguntas, de memória). Voltou depois de uma pausa? Diga:
   ele propõe um aquecimento em vez de seguir direto.

## Durante a sessão

- Uma atividade de cada vez: quiz → exemplos → desafio → explicação.
- Guarde as respostas e o código em `academia/alunos/<aluno>/entregas/etapa-NN/`. É isso que comprova o XP.
- **Quiz:** responda **antes** de ver o gabarito. Quando terminar, cole o conteúdo de `gabarito.md` da lição para o
  assistente fazer a correção comentada (ele não o tem no kit de propósito). As revisões funcionam do mesmo jeito.
- **Desafio:** tente, registre a tentativa e só então peça a dica seguinte. O assistente não vê a pasta `entregas/`:
  cole o que ele precisa avaliar (a saída do `verificar.mjs`, o `relatorio.md`, as respostas do quiz).
- Pergunte "o que eu já sei fazer nesta etapa?" quando quiser um retrato das competências.

## Fim da sessão

1. **Peça o relatório da sessão** ao assistente com o prompt de fechamento abaixo. Ele usa os dados do topo do kit e
   lista apenas o que ficou comprovado na conversa.
2. **Crie o arquivo da sessão** (gera o nome, o número e a data corretos):

   ```bash
   node academia/ferramentas/academia.mjs sessao <aluno>
   ```

   Abra o arquivo criado e **substitua o conteúdo inteiro** pelo relatório do assistente, que já traz o front matter
   (`aluno`, `data`, `sessao`, `etapa`...). Confira se `sessao` e `data` batem com o nome do arquivo. Sem Node: crie
   o arquivo pelo GitHub com o nome `AAAA-MM-DD-sNN.md` (o `NN` é a "Próxima sessão" do `retomada.md`).
3. **Salve as evidências** citadas (as respostas do quiz, o relatório do laboratório...) em `entregas/etapa-NN/`.
   O validador confere se cada arquivo citado entre crases existe.
4. **Confira e atualize** os registros derivados:

   ```bash
   node academia/ferramentas/academia.mjs validar --aluno <aluno>   # erros? corrija a sessão (ou registre a correção na próxima)
   node academia/ferramentas/academia.mjs progresso <aluno>         # recria o seu retomada.md e o PROGRESS.md
   ```

5. **Versione** só o que é seu: `alunos/<aluno>/` e, se mudou, `PROGRESS.md`.
   Mensagem sugerida: `sessao(<aluno>): AAAA-MM-DD etapa N`. O fluxo padrão é um pull request pequeno por sessão
   (os responsáveis pelo repositório podem preferir commitar direto; o procedimento é o mesmo).

**Prompt de fechamento** (use os dados do topo do kit):

```text
Encerre a sessão. Gere o relatório de sessão completo, em um único bloco de código Markdown, no formato do modelo
templates/relatorio-sessao.md: front matter com aluno, data, sessao e etapa exatamente como informados no topo do kit
(retomada: sim só se passaram 14 dias ou mais desde a sessão anterior), as tabelas Atividades, Competências e
Checkpoints e as seções Resumo, Feedback, Pendências e Próxima missão.
Regras: só atividades comprovadas nesta conversa; ids e XP conforme a tabela do GAMIFICACAO.md (XP zero se não
aprovada ou sem evidência; uma vez por id); evidência = caminho entre crases de um arquivo que o aluno salvou em
entregas/ ou uma nota objetiva; níveis de competência de 0 a 3 com a evidência de cada um. Não invente nada. O que
ficou sem evidência vai para Pendências.
```

### Se você não puder rodar Node ou Git

Dá para trabalhar só pela interface do GitHub: crie o arquivo da sessão em `alunos/<aluno>/sessoes/` seguindo o
[template](templates/relatorio-sessao.md) e abra um pull request. O `retomada.md` e o `PROGRESS.md` ficam
desatualizados até alguém rodar `progresso`. Enquanto isso, o aluno pode colar **todos** os relatórios de sessão num
chat e pedir ao assistente o cartão de retomada (as regras de cálculo estão em [GAMIFICACAO.md](GAMIFICACAO.md)).

## Retomada em outra conversa ou com outro assistente

Não depende de nada que estivesse na conversa anterior. Repita o **Início da sessão**: o kit basta. Se quiser mais
histórico, cole também as duas últimas sessões de `sessoes/`.

**O que é "voltar de uma pausa".** São 14 dias ou mais desde a sessão anterior. Nesse caso, marque `retomada: sim`
(isso rende a conquista A19 e faz o assistente propor um aquecimento). O validador recusa `retomada: sim` com menos
de 14 dias e na primeira sessão.

## Dois alunos sem conflitos

- Cada aluno escreve **apenas** em `alunos/<o-seu-slug>/`. Os relatórios de sessão têm nome único por data e número;
  dois alunos nunca editam o mesmo arquivo.
- O único arquivo compartilhado é o `PROGRESS.md`, que é gerado. Se houver conflito de merge nele, aceite qualquer
  versão e rode `progresso` de novo.
- `validar --aluno <aluno>` e `progresso <aluno>` olham a pasta do aluno e o `PROGRESS.md`: o estado do outro aluno
  nunca bloqueia o seu trabalho. (`validar` e `progresso` sem argumento cobrem todos; é o que um mantenedor roda.)
- O XP de um aluno não afeta o outro.
- Revisão por pares é opcional: o outro aluno pode **ler** uma entrega e dar feedback no chat; quem registra é
  sempre o dono da pasta.

## Esqueci de registrar uma sessão

Registre na próxima: o relatório pode listar atividades de dias anteriores se houver evidência nos arquivos de
`entregas/`. Nenhum ponto se perde por atraso, e a data da sessão registra quando o relatório foi escrito.

## Novo aluno

```bash
node academia/ferramentas/academia.mjs novo-aluno <slug> "Nome de exibição"
```

Cria `alunos/<slug>/` com `perfil.md`, `retomada.md` e as pastas `sessoes/` e `entregas/`. O `slug` é o nome da pasta
(minúsculas, números e hífen).
