# Competências

Catálogo das 24 competências da Academia. É a **fonte de verdade** dos IDs usados nas lições, nos relatórios de
sessão e na [visão geral de progresso](PROGRESS.md): o validador (`node academia/ferramentas/academia.mjs validar`)
rejeita IDs que não estejam nesta tabela.

Competência não é XP. O XP mede **atividade comprovada**; a competência mede **o que o aluno consegue fazer**,
com evidência (rubrica, teste que passa, explicação independente). Veja [GAMIFICACAO.md](GAMIFICACAO.md).

## Níveis de domínio

| Nível | Nome | O que significa |
|---|---|---|
| 0 | não demonstrada | ainda sem evidência |
| 1 | em desenvolvimento | fez com ajuda ou com falhas nos critérios da rubrica |
| 2 | demonstrada | cumpriu os critérios de aceitação sozinho e explicou o porquê |
| 3 | dominada | aplicou em contexto novo (checkpoint, projeto ou revisão espaçada) sem ajuda |

O nível registrado numa competência é o **da evidência mais recente**. Um nível pode cair depois de uma revisão
mal-sucedida: isso é sinal de que vale revisar, não uma punição (o XP nunca diminui).

## Catálogo

| ID | Competência | Etapa | Fase |
|---|---|---|---|
| C01 | Explicar tokens e tokenização e o impacto deles em custo e em limites | 1 | 1 |
| C02 | Dimensionar a janela de contexto e o orçamento de tokens de uma chamada | 1 | 1 |
| C03 | Explicar a inferência (prefill, decode, sampling, determinismo) e seu efeito na latência | 1 | 1 |
| C04 | Integrar um LLM por API com timeout, retry e tratamento de erros | 2 | 1 |
| C05 | Separar fundamentos de detalhes de fornecedor e trocar de provedor só por configuração | 2 | 1 |
| C06 | Escrever prompts como especificações versionadas e testáveis | 3 | 1 |
| C07 | Obter saídas estruturadas validadas por schema e testá-las contra casos | 3 | 1 |
| C08 | Ingerir documentos com parsing e metadados rastreáveis até a fonte | 4 | 2 |
| C09 | Escolher e medir estratégias de chunking | 4 | 2 |
| C10 | Gerar embeddings e executar busca vetorial por similaridade | 5 | 2 |
| C11 | Construir RAG com respostas fundamentadas e citações verificáveis | 6 | 2 |
| C12 | Avaliar a recuperação com métricas (hit@k, MRR) sobre um conjunto rotulado | 7 | 2 |
| C13 | Avaliar fidelidade à fonte e implementar abstenção quando faltam evidências | 7 | 2 |
| C14 | Combinar busca lexical e vetorial, aplicar reranking e controlar custo | 8 | 2 |
| C15 | Projetar ferramentas com schemas e executá-las por function calling | 9 | 3 |
| C16 | Implementar o ciclo de um agente com estado, memória e limites explícitos | 10 | 3 |
| C17 | Aplicar permissões mínimas, guardrails e aprovação humana a ações de risco | 11 | 3 |
| C18 | Reconhecer e mitigar prompt injection e vazamento de dados em agentes | 11 | 3 |
| C19 | Construir e consumir servidores e clientes MCP | 12 | 4 |
| C20 | Estruturar contexto para coding agents (instruções, skills, escopo) e revisar o que produzem | 13 | 4 |
| C21 | Instrumentar um sistema com logs, métricas e custo por execução | 14 | 4 |
| C22 | Registrar decisões técnicas (ADRs) com alternativas e trade-offs | 14 | 4 |
| C23 | Testar ponta a ponta e entregar uma execução reproduzível por outra pessoa | 15 | 5 |
| C24 | Demonstrar e defender tecnicamente o sistema com evidências | 16 | 5 |

## Como uma competência é registrada

1. A lição lista, na seção 13, as competências que a atividade pode evidenciar e o critério de cada nível.
2. No fim da sessão, o assistente (ou o outro aluno, numa revisão por pares) propõe o nível com base na
   [rubrica](templates/licao.md) e justifica com evidência.
3. O nível vai para a tabela **Competências** do [relatório de sessão](templates/relatorio-sessao.md).
4. `node academia/ferramentas/academia.mjs progresso` atualiza o cartão de retomada do aluno.
