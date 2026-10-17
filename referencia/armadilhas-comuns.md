# Armadilhas comuns

Erros que **aconteceram de verdade** ao montar este repositório estão marcados com ⚡.

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| ⚡ 1ª requisição leva ~2 min; as seguintes ~1 s | compilação de kernels no aquecimento | aquecer antes (o `subir-vllm.sh` faz) e descartar das medições |
| ⚡ `ValueError: VLLM_PORT 'tcp://10.96.x.x:8000' appears to be a URI` | Service chamado `vllm` faz o Kubernetes injetar `VLLM_PORT` no pod | `enableServiceLinks: false` no pod |
| ⚡ `Error from server (NotFound): namespaces "llmops" not found` | `kubectl apply -f pasta/` aplica em ordem alfabética | numerar os arquivos (`01-namespace.yaml`) |
| ⚡ pod novo `Pending`: `0/1 nodes are available: 1 Insufficient cpu` | RollingUpdate precisa do pod velho e do novo ao mesmo tempo | `strategy: Recreate` (nó único) ou folga de CPU |
| ⚡ `mkdir() "/var/cache/nginx/client_temp" failed (13: Permission denied)` | imagem assume root; OpenShift roda com UID aleatório | imagem *unprivileged*, `chgrp 0`/`g=u`, `HOME`/caches em pastas graváveis |
| ⚡ `would violate PodSecurity "restricted:latest": ... must not include "SYS_NICE"` | capabilities extras e `hostPath` são proibidos no modo restrito / SCC | remover `SYS_NICE` e trocar `hostPath` por PVC |
| ⚡ métrica `e2e` saindo 0 no parser | regex `[a-z_:]+` não aceita dígitos | `[a-zA-Z_:][a-zA-Z0-9_:]*` |
| ⚡ script com `set -o pipefail` morre em `cmd \| head -1` | `head` fecha o pipe e `cmd` recebe SIGPIPE | capturar a saída numa variável antes de cortar |
| ⚡ modelo erra `12 + 30` ou classifica fato como "positivo" | limite de um modelo de 0,5B | avaliação com casos de regressão; modelo maior se o caso for crítico |
| `RuntimeError: Failed to infer device type` | `pip install vllm` (build CUDA) numa máquina sem GPU | imagem `vllm-openai-cpu` ou wheel `+cpu` |
| `get_mempolicy: Operation not permitted` | container sem `SYS_NICE` / seccomp padrão | no Docker: `--cap-add SYS_NICE --security-opt seccomp=unconfined`; no OpenShift, aceite o aviso |
| `RuntimeError: An attempt has been made to start a new process before ...` | uso offline do `LLM(...)` fora de `if __name__ == "__main__":` | proteger o ponto de entrada |
| saída estranha com `llm.generate` num modelo instruct | `generate` não aplica o chat template | usar `llm.chat` ou `/v1/chat/completions` |
| erro de KV cache insuficiente ao subir | `max_model_len` padrão (32k) maior do que cabe no cache | `--max-model-len 4096` e/ou mais `VLLM_CPU_KVCACHE_SPACE` |
| benchmark "bom demais" na 2ª rodada | prefix caching reaproveitou os mesmos prompts | prompts variados, `--seed` diferente ou reiniciar o servidor |
| `404` com `model "..." does not exist` | campo `model` diferente do `--served-model-name` | usar o nome servido (`qwen-mini`) |
| `must be in the ranges: [1000850000, 1000859999]` | `runAsUser` fixo no manifest, no OpenShift | não fixar UID; deixar a SCC escolher |
| resposta cortada / 504 pela Route | timeout padrão do roteador, curto (costuma ser 30 s; a doc 4.22 não cita o valor) | anotação `haproxy.router.openshift.io/timeout` |
| YAML de tutorial com Knative/ModelMesh falha no OpenShift AI 3.x | Serverless e ModelMesh foram deprecados no 2.25 | KServe RawDeployment ou llm-d |

## MLOps

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| ⚡ `Run ... has no artifacts at artifact path 'modelo', registering model based on models:/m-... instead` | no MLflow 3 o modelo é um LoggedModel, não artefato do run | registrar pelo `model_uri` do `log_model` ou via `mlflow.search_logged_models` |
| ⚡ `Failed to resolve installed pip version` | o venv do uv não traz `pip` | inofensivo |
| ⚡ requisitos do modelo com ~100 pacotes | MLflow detecta o projeto uv e exporta todas as dependências | `pip_requirements=[...]` só com o necessário |
| ⚡ `HTTP 400 INVALID_PARAMETER_VALUE: Model is missing inputs [...]` | payload fora da assinatura do modelo | mandar todas as colunas com os nomes certos |
| ⚡ `415 Unsupported Media Type` no `/invocations` | `Content-Type` diferente de JSON, CSV ou parquet | `-H 'Content-Type: application/json'` |
| ⚡ ambiente virtual em Python 3.14, docs dizendo 3.12 | `uv init --bare` não fixa a versão; o uv escolhe o Python mais novo | `uv python pin <versão>` (cria `.python-version`) |
| ⚡ `pkill -f "texto"` derruba o próprio shell (exit 144) | o padrão casa com a linha de comando de quem chamou | `pkill -f "[m]lflow models serve"` ou matar pelo PID |
| `MlflowException: Could not find the pyenv binary` | `--env-manager` padrão é `virtualenv` | `--env-manager local` (ou `uv`) |
| `The filesystem tracking backend (e.g., './mlruns') is in maintenance mode` | file store saiu do padrão no MLflow 3.7 | usar `sqlite:///mlflow.db` (ou `mlflow migrate-filestore`) |
| `FutureWarning: ... transition_model_version_stage ... deprecated since 2.9.0` | stages estão deprecados | aliases (`champion`) |
| `KeyError: 0` em `mlflow.search_runs(...)[0]` | o retorno é um DataFrame (o exemplo da doc erra) | `.iloc[0]` ou `output_format="list"` |
| acurácia alta e tumores malignos passando | classe desbalanceada; acurácia esconde falso negativo | recall da classe crítica, ROC AUC, matriz de confusão |
| modelo ótimo no teste e ruim em produção | vazamento de dados ou training-serving skew | pré-processamento dentro do `Pipeline`, salvo junto com o modelo |
| alerta de drift com 30 colunas sem drift real | múltiplos testes a 5% geram falsos alarmes | limite por fração de colunas, PSI, correção de Bonferroni |

<!-- consolidado-modulos -->
## Módulos da pós

Armadilhas reais encontradas ao construir e executar os módulos (todas aconteceram de verdade).

### [Módulo 01 · Fundamentos de IA e LLMs](../modulos/01-fundamentos-ia-llms/)

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| tfjs puro no Node imprime "Hi, looks like you are running TensorFlow.js in Node.js" | sugere o tfjs-node, que quebra no Node 24 | `tf.setBackend('cpu')` e ignorar o aviso |
| `ValueError: The first layer in a Sequential model must get an inputShape` | modelo sem camada oculta: a saída vira a 1ª camada | dar `inputShape` a ela |
| vídeo parado (`readyState=4`, 0 frames) | `loadeddata` disparou antes do listener | checar `video.readyState` antes de esperar o evento |
| MediaPipe com `delegate: 'GPU'` no headless: ~19 s/frame | WebGL emulado em software | `delegate: 'CPU'` (~600 ms/frame) |
| página aberta por `file://` não carrega .wasm/.tflite | fetch bloqueado em file:// | servir por HTTP |
| Ollama compartilhado: 6 tokens em 116 s | disputa de CPU entre processos | prompts curtos, `max_tokens` baixo, `timeout` de 600 s no cliente |
| few-shot com exemplo ruim piorou o placar e dobrou tokens | exemplo enviesa | medir sempre |
| chunk sem título do documento perde contexto | janela fixa corta o assunto | prefixar o título em cada chunk |

### [Módulo 02 · APIs de IA Generativa](../modulos/02-apis-ia-generativa/)

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| `UND_ERR_HEADERS_TIMEOUT` aos 300 s mesmo com `timeout: 600000` no SDK | o fetch nativo do Node (undici) tem `headersTimeout` de 300 s | `new Agent({ headersTimeout: 0, bodyTimeout: 0 })` do undici passado como `fetch` ao SDK |
| `onFailedAttempt` do retry nunca chamado | `withRetry(...).withConfig(...)` recria o RunnableRetry e descarta as opções | chamar `withConfig` antes de `withRetry` |
| `valor_unitario: 2.59e-15` no JSON | LLM converte número mal | pedir o valor como texto copiado e converter no código; checar a soma |
| regex recusa `"R$ 225,80"` vindo da visão | o modelo copia o símbolo | aceitar `R$` opcional e logar o valor recebido |
| `500 llama-server process no longer running` (`signal: killed`) | OOM com a máquina compartilhada | rodar de novo; menos processos simultâneos |
| tesseract.js baixa o idioma toda vez | não cria a pasta do `cachePath` e falha em silêncio | `mkdirSync` antes |
| informação perdida entre elos do chaining | o elo de extração não repassava o campo | template versionado com o campo faltante |
| caractere chinês espúrio no fim do texto | resposta truncada pelo `max_tokens` | limitar o tamanho no prompt ("até 15 palavras") |
| `cached_tokens` parcial ou 0 | cache por slot despejado por outros processos | confiar em `cached_tokens`, não na latência |
| visão "corrige" o texto lido (acento a mais) | o modelo normaliza | comparar sem acento ou validar contra cadastro |
| RAG recupera o trecho certo e mesmo assim conclui errado | o modelo erra a conta/regra | regras numéricas em código; RAG só traz o fato |

### [Módulo 03 · MCP](../modulos/03-mcp/)

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| `console.log` num servidor MCP stdio quebra o JSON-RPC | stdout é o canal do protocolo | logar com `console.error` |
| filho stdio sem `DATABASE_URL` | `StdioClientTransport` só repassa variáveis seguras (PATH, HOME...) | `env: { ...getDefaultEnvironment(), DATABASE_URL }` |
| 401 "Token has no expiration time" com token válido | `requireBearerAuth` exige `expiresAt` no retorno de `verifyAccessToken` | sempre retornar `expiresAt` |
| data muda de dia com o fuso | `pg` converte DATE em Date local e `toISOString()` desloca | `pg.types.setTypeParser(1082, v => v)` |
| `node --test pasta/` falha ("test failed") | Node 24 trata a pasta como arquivo | passar glob `'pasta/*.test.js'` |
| Inspector CLI contra HTTP sem token: `auth_required` / "Interactive OAuth requires a TTY" | no 401 tenta OAuth interativo | `--stored-auth-only` em CI |
| Inspector leva 429 | uma execução faz várias requisições | limite maior no ambiente de teste |
| `I="npx ..."; $I args` falha no zsh | zsh não divide a string em palavras | array no bash (`"${INSPECTOR[@]}"`) |
| provedor recusa tool com `"$schema"` em parameters | inputSchema do MCP traz `$schema` | remover ao converter para tool OpenAI |
| teste de Host forjado com `fetch` não funciona | fetch não deixa sobrescrever Host | usar `http.request` |

### [Módulo 04 · Agentes Autônomos](../modulos/04-agentes-autonomos/)

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| mesma chamada de 4 s a mais de 7000 s | Ollama disputado por vários processos | comparar chamadas e tokens, não segundos |
| planner devolve JSON inválido e tool inventada | geração livre | `response_format: {type:'json_object'}` + exemplo de plano no prompt |
| solver LLM do ReWOO reescreve o número da evidência | LLM reescreve dados | solver determinístico |
| modelo faz a conta "de cabeça" mesmo com tool `calcular` | modelo pequeno ignora a instrução | contas críticas em executor determinístico |
| `maxTokens` baixo corta a resposta final do agente | limite curto demais | subir o limite e pedir resposta curta no prompt |
| preferência do usuário não recuperada por similaridade | preferência não se parece com a tarefa | carregar perfil sempre; similaridade só para episódios |
| estimativa chars/4 subestima tokens (260 × 406 reais) | template de chat + português | medir com o `usage`; contexto do Ollama é 4096 e trunca em silêncio |
| retry do LangGraph: tentativas falhas somem da auditoria e a última exceção derruba o `invoke` | updates das tentativas são descartados | capturar na última tentativa e gravar `erro` no estado |
| `interrupt()` repete efeitos colaterais | o nó reexecuta do início ao retomar | nada com efeito colateral antes do `interrupt` |

### [Módulo 05 · IA para UX & UI](../modulos/05-ia-ux-ui/)

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| `Error: Please use browser.newContext()` no axe | `browser.newPage()` não funciona com `@axe-core/playwright` | `browser.newContext()` → `newPage()` |
| axe aceita `placeholder` como rótulo | o placeholder conta como nome acessível | checagem própria de rótulo visível |
| nota 100 de acessibilidade num documento vazio | resposta cortada por `max_tokens` dentro do `<style>` | markup primeiro, CSS curto no fim; checar `finish_reason` e contar elementos |
| LLM mantém a cor pedida e fere o contraste | requisitos em conflito | dizer explicitamente que acessibilidade tem prioridade |
| teste gerado por LLM testa um mock ou vem sem imports | o modelo "resolve" o teste em vez do código | "importe o módulo real, não crie mock" + portão de aceitação escrito por humano |
| `MCP error -32602: Tool ... not found` no plano do agente | campos trocados no plano | few-shot + validação semântica do plano + 2ª chamada com os erros |
| `aria-label` diferente do rótulo visível passa no axe | WCAG 2.5.3 não é coberta | revisão humana |
| `node_modules` com 170 MB de Bun | dependência opcional do `@mcp-ui/server` | `.npmrc` com `omit=optional` |
| README do npm do `@mcp-ui/server` mostra formato legado | doc desatualizada no registry | seguir a doc do repositório (v6: `text/html;profile=mcp-app`) |
| DeprecationWarning do pg 8 (query concorrente) | `pgvector.registerTypes` no evento `connect` do Pool | não registrar quando só se envia vetor com `toSql` |
| rate limit "não funciona" no teste | a chamada lenta ao LLM passa da janela | testar com rajada de requisições inválidas (o limit roda antes) |

### [Módulo 06 · IA para DevOps](../modulos/06-ia-devops/)

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| `tofu init`: "no available releases match the given constraints ~> 3.0" | o LLM inventou a versão do provider | colar no prompt o `required_providers` com as versões reais |
| "An argument named "min_uppercase" is not expected here" repetido | o erro sozinho não ensina modelo pequeno | anexar ao feedback os argumentos reais (`tofu providers schema -json`) |
| `local_file` sem `file_permission` passa no validate | default do provider é `"0777"` | aplicar a política OPA sobre o plano (`tofu show -json`), não sobre o texto |
| `.terraform.lock.hcl` trava o init entre tentativas | lock da tentativa anterior | `tofu init -upgrade` |
| cache de providers dentro do repo quebra links | links simbólicos no cache | `TF_PLUGIN_CACHE_DIR` e `TF_DATA_DIR` fora do repo |
| `kubectl logs --previous` falha em CrashLoopBackOff | o container anterior já foi coletado | tentar o log do container atual primeiro |
| STATUS do pod oscila entre `Error` e `CrashLoopBackOff` | a coluna é transitória | classificar por `lastState.terminated` + `waiting.reason` |
| agente ReAct alterna describe → logs → describe | loop sem memória do que já fez | guarda de chamada repetida + `MAX_PASSOS` + conclusão forçada |
| `--dry-run=client --validate=strict` aceita campo inválido no pod | validação local incompleta | `--dry-run=server` |
| PromQL válida e errada (`*100` no denominador) | sintaxe e catálogo não checam significado | golden set + revisão humana |
| post-mortem cortado e com fatos inventados | `max_tokens` baixo | checar `finish_reason == "length"`, anexar a timeline pelo código, "a confirmar" para o desconhecido |
| `kubectl diff` sai com código 1 | há diferença, não é erro | tratar exit 1 como "tem diff" |

### [Módulo 07 · IA para Gestão de Projetos](../modulos/07-ia-gestao-de-projetos/)

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| zod aceita critério contraditório e mudança apontando para épico | schema garante forma, não conteúdo | auditoria de regras + revisão humana |
| justificativa do LLM compara números errado (1867 "superior" a 2100) | modelo compara números mal | tabela calculada é a fonte da verdade |
| `z.string()` para responsável/prazo gera ata inválida (`DUE:Quartafeira`) | campo livre | `z.enum` gerado dos dados (participantes, datas) e validar antes de gerar o .ics |
| "número certo em frase errada" no status report | checagem de números com lastro não pega semântica | revisão humana nos textos para diretoria |
| bot troca a intenção ("arquive" virou mover) | modelo pequeno | tabela verbo→ação, enum das listas e política em código |
| few-shot enviesa campos | o exemplo vira padrão | instrução explícita para o campo |
| hash da trilha diverge sem adulteração | jsonb não preserva ordem das chaves | JSON canônico com chaves ordenadas |
| CPM otimista | ignora capacidade (meio período) | Monte Carlo com capacidade |
| `node --test <diretório>` falha | Node 24 | passar os *.test.js por glob |

### [Módulo 08 · Arquitetura de Sistemas com IA](../modulos/08-arquitetura-de-sistemas-com-ia/)

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| hash do audit trail não bate sem adulteração | jsonb reordena as chaves | serialização canônica com chaves ordenadas |
| empate no RRF muda o resultado ao acaso | RRF só olha posição | desempate explícito |
| full-text quase não casa pergunta em linguagem natural | `websearch_to_tsquery` faz AND de todas as palavras | montar OR dos lexemas (`to_tsquery` com ` \| `) |
| Agentic RAG inventa o dado sem buscar | modelo pequeno decide mal quando buscar | forçar a busca por regra (regex de IDs) + validar que cada `[id]` citado foi recuperado |
| cache semântico com falso hit ("CDB" × "CDI", 0,79) | limiar baixo | limiar 0,9 + instrução de "perguntas equivalentes" no embedding |
| explosão de cardinalidade nas métricas | label com valor livre (tenant desconhecido) | mapear valores fora da lista para `desconhecido` |
| Prompt Cache sem efeito no Ollama | `cached_tokens: 0` reportado | medir em provedor que reporta; tratar como conceitual |

### [Módulo 09 · Dados e Fine-Tuning](../modulos/09-dados-e-fine-tuning/)

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| `ollama create` com `ADAPTER` responde "LoRA adapters are no longer supported" | o Ollama removeu o suporte (PR #14969, set/2026) | `merge_and_unload()` e importar o modelo inteiro |
| fine-tuning da OpenAI indisponível para conta nova | a OpenAI está encerrando o recurso para novos usuários | considerar LoRA local ou outro provedor |
| `hyperparameters` no topo do job de fine-tuning | campo deprecado | `method.supervised.hyperparameters` |
| `PermissionError` em `~/.cache/huggingface/hub` | gravação bloqueada no cache global | `HF_HOME` dentro do projeto |
| validador acusa arquivos vazios do HF | `.lock` e `.no_exist` do cache são vazios | cache dentro de `.venv/` (ignorado) |
| processo Python morre sem traceback no 2º treino | OOM com dois modelos no mesmo processo | uma variante por processo + `gc.collect()` |
| linha de resultado some no `grep -v` | barra do tqdm usa `\r` | `tr '\r' '\n'` antes do grep |
| modelo de 135M repete o ticket em vez de classificar | modelo minúsculo não segue instrução | LoRA corrige o formato |
| LoRA perde conhecimento geral ("capital da França" errada) | esquecimento catastrófico | avaliar fora do domínio; misturar dados gerais |
| system prompt diferente entre treino e uso | distribuição diferente da vista no treino | fonte única do prompt |

### [Módulo 10 · Segurança e Governança](../modulos/10-seguranca-e-governanca/)

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| `timeout: 600_000` do SDK openai não corta chamada presa na fila do Ollama | fila no servidor compartilhado | poucos casos por execução; filtro `--casos` |
| script trava com `Warning: Detected unsettled top-level await` | import circular com top-level await | mover as peças compartilhadas para um módulo comum |
| `ValueError: max() iterable argument is empty` ao escolher limiar | meta de recall inatingível | meta realista e `default=` no `max` |
| AUC diferente entre dois scripts com o mesmo seed | inverter o rótulo antes do `stratify` muda o split | estratificar pelo rótulo original |
| `DataFrame.to_markdown` falha | dependência escondida (`tabulate`) | função própria ou declarar a dependência |
| nome próprio passa pelo mascaramento de PII | regex não detecta nome | NER para nomes |
| desmascaramento devolve o cartão inteiro | reidentificação total por padrão | revelar só os 4 últimos dígitos |
| um usuário em loop bloqueia todos | orçamento só por feature | cota por usuário |
| réplicas estouram o orçamento juntas | checar e gravar o gasto não é atômico | operação atômica no banco |

### [Módulo 11 · Capstone Micro-SaaS](../modulos/11-capstone-micro-saas/)

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| Angular CLI 22.2.3 recusa o Node 24.11 do host | exige Node `^24.15.0` | rodar `ng new`/`ng build` no container `node:24.22.0-alpine` (igual ao Dockerfile e ao CI) |
| `npm ci` passa no host e falha no `docker build` (`Missing: @grpc/grpc-js ... from lock file`) | lock gerado por npm mais antigo não registra peer opcional | gerar o lock dentro da imagem (`npm install --package-lock-only`) |
| ADK TypeScript sem conector para Ollama/LiteLLM | só o ADK Python tem LiteLLM | `class OllamaLlm extends BaseLlm` traduzindo para Chat Completions |
| `SequentialAgent is deprecated in favor of Workflow` (ADK 2.3) | API nova e experimental | `Workflow`; passar dados pelo estado da sessão |
| pipeline multiagente alucina com citação válida | o pesquisador resumiu e perdeu um fato; o verificador só checa procedência | instruir "se não cobre, diga que não encontrou" e verificar conteúdo, não só a fonte |
| UI mostra dados do tenant anterior | corrida na troca de tenant | carregar tudo e só então publicar os signals |
| 405 no `GET /mcp` no console | stream SSE em servidor stateless | esperado; o SDK segue sem stream |
| DELETE 404 apagava o cache inteiro do tenant | invalidação incondicional | invalidar só quando `rowCount > 0` (com teste) |
| Inspector CLI com exit ≠ 0 derruba script `set -e` | exit 5 em `isError`, 3 em `auth_required` | `set +e` em volta, ou tratar o código |
| bundle Angular avisa CommonJS | SDK MCP traz `ajv`, `content-type` | `allowedCommonJsDependencies` no `angular.json` |
| LLM chamado à toa em pergunta fora do tema | limiar de relevância baixo | limiar 0,5 no melhor trecho (fora do tema ficou em 0,33–0,41) |

### [Módulo 12 · Carreira](../modulos/12-carreira/)

| Sintoma / mensagem | Causa | Correção |
|---|---|---|
| juiz LLM pequeno dá nota 5 listando 3 lacunas | LLM-as-judge sem calibração | nota do checklist determinístico; texto do LLM só como sugestão; calibrar contra notas humanas |
| link de docs/ para outro módulo quebrado | precisa subir dois níveis | `../../03-mcp/` e não `../03-mcp/` |
| SSI do LinkedIn usado como meta | o próprio LinkedIn diz que é métrica de vendas e não reflete mais o ambiente | tratar os 4 pilares como hábitos |
