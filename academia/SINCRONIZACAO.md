# Sincronização e retomada

O conhecimento e o progresso ficam **nos arquivos do repositório**, não no histórico de uma conversa. Uma conversa
pode acabar, o assistente pode mudar, o aluno pode passar semanas sem estudar: o curso continua de onde parou.

> Um chat (ChatGPT ou outro) normalmente **não** consegue ler nem escrever o repositório sozinho, e não enxerga os
> dados do outro aluno. Por isso a sincronização é **manual**: o aluno leva o contexto para a conversa e traz o
> relatório da sessão de volta. Um agente com acesso ao repositório (Claude Code, Codex, Cursor...) pode fazer os
> mesmos passos sozinho.

## O que cada arquivo guarda

| Arquivo | Quem escreve | Para quê |
|---|---|---|
| [`AI_CONTEXT.md`](../AI_CONTEXT.md) | mantenedores | regras que o assistente segue |
| `alunos/<aluno>/perfil.md` | o aluno | objetivo, ritmo, ambiente, `compartilhar_xp` |
| `alunos/<aluno>/sessoes/AAAA-MM-DD-sNN.md` | o assistente propõe, o aluno salva | **fonte de verdade**: atividades, XP, competências, feedback, pendências. Um arquivo por sessão, nunca editado depois |
| `alunos/<aluno>/entregas/etapa-NN/` | o aluno | código, relatórios e respostas que servem de evidência |
| `alunos/<aluno>/retomada.md` | **gerado** | cartão de retomada: onde parou, nível, pendências, revisões sugeridas |
| [`PROGRESS.md`](PROGRESS.md) | **gerado** | visão geral dos alunos |

Os arquivos gerados nunca são editados à mão: `node academia/ferramentas/academia.mjs progresso` os recria a partir das
sessões. Se estiverem desatualizados, o `validar` avisa.

## Início da sessão

1. Abra o seu `academia/alunos/<aluno>/retomada.md`. Ele mostra a etapa, o nível, as pendências, a próxima missão e as
   **revisões sugeridas**.
2. Abra a lição da etapa (`academia/licoes/NN-.../README.md`).
3. Numa conversa **sem acesso ao repositório**, cole o prompt de abertura abaixo, seguido de `AI_CONTEXT.md`, do seu
   `retomada.md` e da lição (sem o `gabarito.md`).
4. Comece pela revisão mais antiga sugerida (até três perguntas, de memória). Voltou depois de uma pausa? Diga ao
   assistente; ele vai propor um aquecimento em vez de seguir direto.

**Prompt de abertura** (copie e preencha o que está entre `<>`):

```text
Você é o tutor da Academia de Engenharia de IA do repositório ai-engineer. Siga as regras do AI_CONTEXT.md que
colo abaixo. Eu sou o aluno <slug>. Abaixo estão o meu cartão de retomada e a lição desta sessão.
Comece pelas revisões sugeridas, depois conduza a lição uma atividade por vez, sem entregar solução antes das
dicas. Não tenho acesso ao repositório nesta conversa: no fim vou pedir o relatório da sessão.

=== AI_CONTEXT.md ===
<cole>
=== retomada.md ===
<cole>
=== lição ===
<cole>
```

## Durante a sessão

- Uma atividade de cada vez: quiz → exemplos → desafio → explicação.
- Guarde as respostas e o código em `academia/alunos/<aluno>/entregas/etapa-NN/`. É isso que comprova o XP.
- Quiz: responda **antes** de ver o gabarito. Desafio: tente, registre a tentativa e só então peça a dica seguinte.
- Pergunte "o que eu já sei fazer nesta etapa?" quando quiser um retrato das competências.

## Fim da sessão

1. **Peça o relatório da sessão** ao assistente (prompt de fechamento abaixo). Ele deve listar apenas o que ficou
   comprovado na conversa.
2. **Crie o arquivo da sessão** (gera o nome, o número e a data corretos):

   ```bash
   node academia/ferramentas/academia.mjs sessao <aluno>
   ```

   Cole o relatório gerado pelo assistente no arquivo criado, em `academia/alunos/<aluno>/sessoes/`.
3. **Confira e atualize** os registros derivados:

   ```bash
   node academia/ferramentas/academia.mjs validar      # erros? corrija a sessão (ou a próxima)
   node academia/ferramentas/academia.mjs progresso    # recria retomada.md e PROGRESS.md
   ```

4. **Versione** só o que é seu: `alunos/<aluno>/` e, se mudou, `PROGRESS.md`.
   Mensagem sugerida: `sessao(<aluno>): AAAA-MM-DD etapa N`. O fluxo padrão é um pull request pequeno por sessão
   (os responsáveis pelo repositório podem preferir commitar direto; o procedimento é o mesmo).

**Prompt de fechamento:**

```text
Encerre a sessão. Gere o relatório de sessão completo no formato de templates/relatorio-sessao.md (front matter e
tabelas Atividades, Competências, Checkpoints; seções Resumo, Feedback, Pendências e Próxima missão).
Inclua só atividades comprovadas nesta conversa; XP conforme a tabela do GAMIFICACAO.md (zero se não for aprovado
ou sem evidência); níveis de competência 0 a 3 com a evidência de cada um. Não invente nada. Se algo ficou sem
evidência, deixe em Pendências.
```

### Se você não puder rodar Node ou Git

Dá para trabalhar só pela interface do GitHub: crie o arquivo da sessão em `alunos/<aluno>/sessoes/` seguindo o
[template](templates/relatorio-sessao.md) e abra um pull request. O `retomada.md` e o `PROGRESS.md` ficam
desatualizados até alguém rodar `progresso`. Enquanto isso, o aluno pode colar **todos** os relatórios de sessão num
chat e pedir ao assistente o cartão de retomada (as regras de cálculo estão em [GAMIFICACAO.md](GAMIFICACAO.md)).

## Retomada em outra conversa ou com outro assistente

Não depende de nada que estivesse na conversa anterior. Repita o **Início da sessão**: o `retomada.md` e a lição
bastam. Se quiser mais histórico, cole também as duas últimas sessões de `sessoes/`.

## Dois alunos sem conflitos

- Cada aluno escreve **apenas** em `alunos/<o-seu-slug>/`. Os relatórios de sessão têm nome único por data e número;
  dois alunos nunca editam o mesmo arquivo.
- O único arquivo compartilhado é o `PROGRESS.md`, que é gerado. Se houver conflito de merge nele, aceite qualquer
  versão e rode `progresso` de novo.
- O XP de um aluno não afeta o outro. O XP só aparece no `PROGRESS.md` para quem escreveu `compartilhar_xp: sim`.
- Revisão por pares é opcional: o outro aluno pode **ler** uma entrega e escrever feedback no chat; quem registra é
  sempre o dono da pasta.

## Esqueci de registrar uma sessão

Registre na próxima: o relatório pode listar atividades de dias anteriores se houver evidência nos arquivos de
`entregas/`. Nenhum ponto se perde por atraso, e a data da sessão registra quando o relatório foi escrito.

## Novo aluno

```bash
node academia/ferramentas/academia.mjs novo-aluno <slug> "Nome de exibição"
```

Cria `alunos/<slug>/perfil.md` e `retomada.md`. O `slug` é a pasta (minúsculas, sem espaços).
