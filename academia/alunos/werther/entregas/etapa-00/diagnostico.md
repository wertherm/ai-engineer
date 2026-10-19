# Diagnóstico · Missão 0

**Data:** 2026-10-19 · respostas de memória, sem pesquisa, transcritas da conversa com o tutor.

Autoavaliação: 0 nunca vi · 1 já ouvi falar · 2 explico com ajuda · 3 explico e aplico sozinho.
Nota: critério do [gabarito](../../../../licoes/00-missao-0-diagnostico/gabarito.md), atribuída na correção comentada.

## Respostas

| # | Resposta | Autoavaliação | Nota | Comentário da correção |
|---|---|---|---|---|
| 1 | É como o BIT dos modelos, a menor unidade de informação que modelos usam para aprender e responder. Importa bastante para os custos, pois dependendo do consumo de tokens a janela de contexto pode estourar e deixar o custo bem alto. | 2 | 1 | Ligou token a custo e janela. Mas token não é um bit: é um pedaço de texto do vocabulário do tokenizer, e a contagem muda com o idioma e o modelo. |
| 2 | O ID da sessão, mas existem outras formas de atualizar o contexto pro agente, como salvar as sessões em arquivos markdown no Obsidian. | 2 | 0 | A API de chat não guarda estado: a aplicação reenvia o histórico (`messages`) a cada chamada. O Obsidian é memória do agente, uma camada acima. |
| 3 | Acredito que um guard ou try catch. | 1 | 1 | Capturar o erro é o começo. Faltam timeout, retry com backoff e jitter, `Retry-After`, limite de tentativas e separar erros que valem repetir (429, 5xx) dos que não valem (400, 401). |
| 4 | Fazendo um parse do JSON. | 1 | 1 | O parse pega JSON inválido, mas não confere os campos. Faltam schema, saída estruturada do provedor, `finish_reason: length` e repetir com o erro. |
| 5 | É uma forma matemática de modelos criarem semântica e significado, criando buscas mais inteligentes, baseando-se nas palavras-chave pesquisadas. | 2 | 1 | "Significado" está certo. Faltam o vetor e a proximidade (cosseno). "Palavras-chave" é o contrário: isso é a busca lexical. |
| 6 | Acredito que dividir facilita o processamento e memória dos modelos, chunks grandes demais poderiam fazer o modelo alucinar. | 2 | 1 | Parcial. Grande demais dilui a similaridade e gasta contexto. Pequeno demais perde o contexto (frase cortada, título perdido). Esse lado ficou faltando. |
| 7 | Não sei. | 0 | 0 | Perguntas com o trecho certo já conhecido, medidas com hit@k e MRR, separando recuperação de resposta. |
| 8 | Acredito que enriquecer treinamento do modelo com informações para reduzir o custo com tokens; o modelo na inferência já saberia sobre as informações sem precisar pesquisar. | 2 | 0 | Isso é fine-tuning, não RAG. Sem evidência, o RAG deve se abster ("não encontrei nos documentos") em vez de inventar. |
| 9 | Não sei. | 0 | 0 | A lexical (BM25) acerta nomes e códigos exatos; a vetorial acerta o significado. O reranker reordena os candidatos com um modelo mais caro, com mais latência e custo. |
| 10 | É um método legado de conectar modelos a ferramentas, o padrão mais atual aceito agora é o MCP. | 3 | 0 | Não é legado: o modelo devolve nome e argumentos em JSON, e **o seu código executa**. O MCP padroniza a oferta das ferramentas, que continuam chegando ao modelo por tool calling. |
| 11 | Não hackear para alcançar objetivos, ter muito cuidado com informações sensíveis. | 2 | 1 | São intenções, não limites aplicáveis. Esperado: máximo de passos, orçamento de tokens ou custo, tempo, ferramentas permitidas, aprovação humana e condição de parada. |
| 12 | O agente deve perguntar pro usuário se deseja fazer a ação de ignorar, pois isso pode ser um prompt injection. | 1 | 1 | Reconheceu o prompt injection. Mas texto recuperado é dado, não instrução, então nem se pergunta. Somam-se permissões mínimas, aprovação para ações de risco e testes adversariais. |
| 13 | É um protocolo atual para conectar modelos a ferramentas como pesquisa na web, executar comandos CLI etc. | 2 | 1 | O "o que é" está certo. O problema resolvido ficou de fora: clientes e servidores padronizados no lugar de uma integração sob medida por par aplicação-sistema. |
| 14 | Sim, uso muito, costumo usar o Obsidian como forma de armazenar todo contexto importante. | 3 | 1 | Respondeu só a metade do contexto. Faltou a revisão: ler o diff, rodar os testes e não aceitar sem entender. Instruções versionadas (`AGENTS.md`) e o escopo da tarefa também contam. |
| 15 | A quantidade de tokens gastos, latência não sei e erros acredito que guards no prompt system. | 2 | 1 | Tokens, certo. Guards no prompt previnem; a pergunta era sobre registrar: id da execução, latência por etapa, custo, erro, versão do prompt e do modelo. |
| 16 | Clonando meu repositório. | 2 | 1 | É o primeiro passo. Faltam o README com passos, versões travadas, `.env` sem segredos, testes com LLM simulado e um comando único para subir. |

## Perguntas pessoais

- **Onde acho que estou no roadmap:** bem no início.
- **Maior dúvida hoje:** como usar e implementar RAG.
- **Tempo por semana:** cerca de 3 horas (seg, qua e sex às 15h), em sessões curtas.

## Mapa de partida

| Fase | Média da nota | Média da autoavaliação | Calibragem (distância média) | Leitura |
|---|---|---|---|---|
| 1 · Fundamentos | 0,75 | 1,50 | 0,75 | conteúdo novo |
| 2 · RAG | 0,40 | 1,20 | 0,80 | conteúdo novo |
| 3 · Agentes | 0,67 | 2,00 | 1,33 | conteúdo novo |
| 4 · Ecossistema | 1,00 | 2,33 | 1,33 | familiaridade parcial |
| 5 · Projeto | 1,00 | 2,00 | 1,00 | familiaridade parcial |
| **Geral** | **0,69** | **1,69** | **1,00** | — |

Nenhuma autoavaliação ficou abaixo da nota: a tendência é de **superestimar** (mais em Agentes e Ecossistema,
onde o uso diário dá familiaridade com os termos). Sugestão do gabarito: seguir a ordem do roadmap com calma e fazer o
quiz de cada etapa **antes** de ler o material. Sem *fast track* por enquanto.

## Minhas anotações

As três correções que mais me surpreenderam:

1. A API não guarda estado.
2. RAG não é fine-tuning.
3. Function calling é complementar ao MCP.

**Plano para pausas:** numa pausa de 15 dias, tentaria fazer um dia ou outro, conforme a minha disponibilidade.
