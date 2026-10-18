# Cheatsheet

## vLLM

| Tarefa | Comando |
|---|---|
| Subir / parar (este repo) | `bash infra/subir-vllm.sh` · `bash infra/parar-vllm.sh` |
| Logs | `docker logs -f vllm-estudo` |
| Pronto? | `curl -sf localhost:8000/health && echo ok` |
| Versão | `curl -s localhost:8000/version` |
| Modelos servidos | `curl -s localhost:8000/v1/models` |
| Chat | `curl -s localhost:8000/v1/chat/completions -H 'Content-Type: application/json' -d '{"model":"qwen-mini","messages":[{"role":"user","content":"oi"}],"max_tokens":20}'` |
| Tokenizar | `curl -s localhost:8000/tokenize -H 'Content-Type: application/json' -d '{"model":"qwen-mini","prompt":"Kubernetes"}'` |
| Métricas principais | `curl -s localhost:8000/metrics \| grep -E '^vllm:(num_requests\|kv_cache\|time_to_first)'` |
| Benchmark | `docker exec vllm-estudo vllm bench serve --model Qwen/Qwen2.5-0.5B-Instruct --served-model-name qwen-mini --dataset-name random --random-input-len 128 --random-output-len 32 --num-prompts 8 --max-concurrency 4` |

Flags de `vllm serve`: `--dtype bfloat16` · `--max-model-len 4096` · `--served-model-name` · `--api-key` ·
`--generation-config vllm` · `--max-num-seqs` · `--kv-cache-memory-bytes`.

## PromQL

| Pergunta | Consulta |
|---|---|
| TTFT médio (5 min) | `rate(vllm:time_to_first_token_seconds_sum[5m]) / rate(vllm:time_to_first_token_seconds_count[5m])` |
| TTFT p95 | `histogram_quantile(0.95, rate(vllm:time_to_first_token_seconds_bucket[5m]))` |
| Tokens gerados/s | `rate(vllm:generation_tokens_total[1m])` |
| Fila | `vllm:num_requests_waiting` |
| Hit rate do prefix cache | `rate(vllm:prefix_cache_hits_total[5m]) / rate(vllm:prefix_cache_queries_total[5m])` |

## kind / kubectl

| Tarefa | Comando |
|---|---|
| Criar cluster + carregar imagem | `bash exemplos/07-vllm-no-kubernetes/criar-cluster.sh` |
| Pausar / retomar o cluster | `docker stop estudo-control-plane` · `docker start estudo-control-plane` |
| Apagar o cluster | `kind delete cluster --name estudo` |
| Aplicar e esperar | `kubectl apply -f pasta/` · `kubectl -n llmops rollout status deploy/vllm` |
| Ver tudo | `kubectl -n llmops get pods,svc,deploy -o wide` |
| Por que não sobe? | `kubectl -n llmops describe pod -l app=vllm` (seção *Events*) |
| Logs (inclusive do crash anterior) | `kubectl -n llmops logs deploy/vllm` · `... logs <pod> --previous` |
| Túnel local | `kubectl -n llmops port-forward svc/vllm 8001:8000` |
| Validar sem aplicar | `kubectl apply --dry-run=server -f arquivo.yaml` |
| Modo "OpenShift" | `kubectl label ns X pod-security.kubernetes.io/enforce=restricted` |

## oc (OpenShift)

| Tarefa | Comando |
|---|---|
| Login | `oc login --token=<t> --server=<url>` (copie do console) · `oc whoami` |
| Projeto | `oc new-project demo` · `oc project` · `oc project -q` |
| App a partir do Git / imagem | `oc new-app https://github.com/sclorg/cakephp-ex` · `oc new-app --image=<img> --name=x` |
| Expor | `oc expose service/x` · `oc create route edge --service=x` · `oc get route` |
| Diagnóstico | `oc status` · `oc get events --sort-by=.lastTimestamp` · `oc rsh <pod>` |
| SCC | `oc get scc` · `oc get pod <p> -o jsonpath='{.metadata.annotations.openshift\.io/scc}'` |
| Faixa de UID do projeto | `oc get ns <proj> -o jsonpath='{.metadata.annotations.openshift\.io/sa\.scc\.uid-range}'` |
| Permissões | `oc adm policy add-role-to-user edit <user> -n <proj>` · `oc auth can-i create route` |

## OpenShift Local (CRC)

`crc setup` · `crc config set preset microshift` · `crc start` · `eval $(crc oc-env)` ·
`crc console --credentials` · `crc stop` · `crc delete`

## MLflow (MLOps)

| Tarefa | Comando |
|---|---|
| UI | `uv run mlflow server --backend-store-uri sqlite:///mlflow.db --port 5000` |
| Servir o champion | `bash trilhas-extras/mlops/exemplos/03-servindo-o-modelo/servir.sh` (porta 5001) |
| Prever | `curl -s localhost:5001/invocations -H 'Content-Type: application/json' -d '{"dataframe_split": {...}}'` |
| Melhor run | `mlflow.search_runs(experiment_names=["cancer-de-mama"], order_by=["metrics.roc_auc DESC"]).iloc[0]` |
| Registrar | `mlflow.register_model(model_uri, "cancer-clf")` |
| Promover | `MlflowClient().set_registered_model_alias("cancer-clf", "champion", versao)` |
| Carregar o que está em produção | `mlflow.sklearn.load_model("models:/cancer-clf@champion")` |
| Silenciar a dica para agentes | `export MLFLOW_DISABLE_AGENT_HINT=1` |
| Banco de versão antiga | `mlflow db upgrade sqlite:///mlflow.db` |

## Kubeflow Pipelines

| Tarefa | Comando |
|---|---|
| Compilar | `uv run --group kfp python trilhas-extras/mlops/exemplos/05-pipeline-de-treino/pipeline_kfp.py` |
| Executar sem cluster | `uv run --group kfp python trilhas-extras/mlops/exemplos/05-pipeline-de-treino/rodar_kfp_local.py [C]` |
| Importar no OpenShift AI | Dashboard → Pipelines → Import pipeline → `pipeline_kfp.yaml` |

<!-- consolidado-modulos -->
## Módulos da pós

### [Módulo 01 · Fundamentos de IA e LLMs](../modulos/01-fundamentos-ia-llms/)

| Tarefa | Comando |
|---|---|
| Backend do tfjs puro | `await tf.setBackend('cpu'); tf.tidy(() => ...)` |
| Busca vetorial | `SELECT ..., 1 - (embedding <=> $1) AS sim FROM m01.chunks ORDER BY embedding <=> $1 LIMIT 3` |
| Índice vetorial | `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)` |
| pgvector no Node | `await pgvector.registerTypes(db)` e `pgvector.toSql(vetor)` |
| Chrome headless sem baixar browser | `chromium.launch({ channel: 'chrome', headless: true })` (playwright-core) |
| Catálogo do OpenRouter (sem chave) | `curl https://openrouter.ai/api/v1/models` |
| (Python) rodar um exemplo | `cd modulos/01-fundamentos-ia-llms && uv sync && uv run python exemplos/02-primeira-rede-neural/python/main.py` |
| (Python) camada densa em NumPy | `np.maximum(x @ W + b, 0)` |
| (Python) vetor no Postgres | `register_vector(db); db.execute("... ORDER BY embedding <=> %s", (np.array(v),))` |
| (Python) cliente para Ollama lento | `OpenAI(base_url=..., timeout=900, max_retries=0)` + `reasoning_effort="none"` |

### [Módulo 02 · APIs de IA Generativa](../modulos/02-apis-ia-generativa/)

| Tarefa | Comando |
|---|---|
| Saída validada | `response_format: zodResponseFormat(Schema, "nome")` + `Schema.safeParse(JSON.parse(content))` |
| Reprodutível no Ollama | `{ reasoning_effort: "none", temperature: 0, seed: 42 }` |
| Ver cache de prefixo | `r.usage.prompt_tokens_details.cached_tokens` |
| Retry com log no LangChain | `llm.withConfig({ runName }).withRetry({ stopAfterAttempt: 4, onFailedAttempt })` |
| Imagem para o Ollama | `{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }` |
| Whisper local | `pipeline("automatic-speech-recognition", "onnx-community/whisper-base", { dtype: "q8" })` |
| Frames de vídeo | `ffmpeg -i video.mp4 -vf "fps=1/3,scale=480:-2" frames/%03d.png` |
| Chamadas longas no Node | `new Agent({ headersTimeout: 0, bodyTimeout: 0 })` (undici) |
| (Python) saída estruturada validada | `create(response_format={"type":"json_schema","json_schema":{"name":n,"schema":M.model_json_schema(),"strict":True}})` → `M.model_validate_json(txt)` |
| (Python) retry só para erro transitório (LangChain) | `llm.with_retry(stop_after_attempt=4, retry_if_exception_type=(openai.InternalServerError, openai.RateLimitError))` |
| (Python) mockar o LLM no FastAPI | `app.dependency_overrides[obter_llm] = lambda: Mock(...)` |
| (Python) Whisper local em CPU | `WhisperModel("base", device="cpu", compute_type="int8").transcribe(wav, language="pt")` |

### [Módulo 03 · MCP](../modulos/03-mcp/)

| Tarefa | Comando |
|---|---|
| Registrar tool | `server.registerTool(nome, { description, inputSchema: { a: z.number() } }, async (args) => ({ content: [{ type: 'text', text }] }))` |
| Client stdio | `await client.connect(new StdioClientTransport({ command: process.execPath, args: ['server.js'] }))` |
| Client HTTP com token | `new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: 'Bearer ...' } } })` |
| Testes em memória | `InMemoryTransport.createLinkedPair()` |
| Inspector CLI | `npx -y @modelcontextprotocol/inspector@2.11.0 --cli node server.js --method tools/list` |
| (Python) servidor MCP | `mcp = MCPServer("nome"); @mcp.tool(...)` · `mcp.run()` |
| (Python) client stdio | `async with Client(stdio_client(StdioServerParameters(command=sys.executable, args=[...]))) as c:` |
| (Python) client HTTP com token | `Client(streamable_http_client(url, http_client=httpx2.AsyncClient(headers={"Authorization": "Bearer ..."})))` |
| (Python) teste em processo | `async with Client(criar_servidor()) as c:` + `pytestmark = pytest.mark.anyio` |

### [Módulo 04 · Agentes Autônomos](../modulos/04-agentes-autonomos/)

| Tarefa | Comando |
|---|---|
| Devolver resultado de tool | `messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(r) })` |
| Thinking desligado no LangChain | `new ChatOpenAI({ configuration: { baseURL }, modelKwargs: { reasoning_effort: 'none' } })` |
| Retry e checkpoint no LangGraph | `.addNode('x', fn, { retryPolicy: { maxAttempts: 3 } })` · `.compile({ checkpointer: new MemorySaver() })` |
| Pausar e retomar | `interrupt(payload)` · `graph.invoke(new Command({ resume: 'aprovar' }), { configurable: { thread_id } })` |
| Depurar o grafo | `graph.stream(input, { streamMode: 'updates', recursionLimit: 10 })` · `getStateHistory(cfg)` |
| Agente pronto (LangChain v1) | `createAgent({ model, tools: [tool(fn, { name, description, schema })], systemPrompt })` |
| (Python) agente pronto LangChain v1 | `create_agent(ChatOpenAI(base_url=..., extra_body={"reasoning_effort":"none"}), [tool1], system_prompt="...")` |
| (Python) retry + fallback no LangGraph | `g.add_node("n", fn, retry_policy=RetryPolicy(max_attempts=3, retry_on=MeuErro), error_handler=lambda s, error: Command(goto="fallback"))` |
| (Python) HITL | `interrupt({...})` no nó · retomar: `grafo.stream(Command(resume="aprovar"), {"configurable": {"thread_id": "B"}})` |

### [Módulo 05 · IA para UX & UI](../modulos/05-ia-ux-ui/)

| Tarefa | Comando |
|---|---|
| Auditoria de acessibilidade | `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()` |
| Recurso de UI no MCP | `createUIResource({ uri: 'ui://app/x', content: { type: 'rawHtml', htmlString }, encoding: 'text' })` |
| Tool com UI | `server.registerTool('t', { description, _meta: { ui: { resourceUri: 'ui://app/x' } } }, handler)` |
| Localizadores acessíveis | `page.getByLabel('Nova tarefa').fill(...)` · `page.getByRole('button', { name: 'Adicionar' }).click()` |
| Gemini CLI sem interação | `gemini -p "..." -o json --approval-mode auto_edit` |
| (Python) Chrome instalado no Playwright | `await pw.chromium.launch(channel="chrome", headless=True)` |
| (Python) axe no Python | `await page.add_script_tag(path=AXE_JS); await page.evaluate("t => axe.run(document,{runOnly:{type:\"tag\",values:t}})", TAGS)` |
| (Python) recurso MCP Apps | `apps = Apps(); @apps.tool(resource_uri="ui://..."); MCPServer(..., extensions=[apps])` |

### [Módulo 06 · IA para DevOps](../modulos/06-ia-devops/)

| Tarefa | Comando |
|---|---|
| Validar IaC | `tofu fmt -check; tofu init -upgrade; tofu validate -json` |
| Política sobre o plano | `tofu plan -out plan.bin && tofu show -json plan.bin > plan.json && conftest test plan.json -p politicas` |
| Testar as políticas | `conftest verify -p politicas` |
| Deploy com rollback | `kubectl apply --dry-run=server -f m.yaml && kubectl rollout status deploy/x --timeout=75s \|\| kubectl rollout undo deploy/x` |
| Validar regras Prometheus | `docker run --rm -i --entrypoint promtool prom/prometheus:v3.15.0 check rules /dev/stdin < regras.yml` |
| Scan com Trivy | `trivy config alvos/` · `trivy fs --scanners secret .` |
| (Python) binário sem risco de injeção | `subprocess.run(["kubectl","--context","kind-estudo",*args], input=yaml, capture_output=True, text=True)` |
| (Python) testes sem LLM e sem cluster | `cd modulos/06-ia-devops && uv sync && uv run pytest` |

### [Módulo 07 · IA para Gestão de Projetos](../modulos/07-ia-gestao-de-projetos/)

| Tarefa | Comando |
|---|---|
| Structured output com zod | `client.chat.completions.parse({ response_format: zodResponseFormat(schema, 'nome'), reasoning_effort: 'none', temperature: 0 })` |
| Enum a partir dos dados | `z.enum(participantes(transcricao))` |
| RICE / WSJF | `reach*impact*confidence/effort` · `(businessValue+timeCriticality+riskReduction)/jobSize` |
| Checklist de governança no CI | `npm run exe02 -- /caminho/projeto` (exit 1 bloqueia) |
| (Python) structured output com pydantic | `client.chat.completions.parse(model=..., response_format=Modelo).choices[0].message.parsed` |
| (Python) `Math.round` / `toFixed` do JS | `math.floor(x + 0.5)` / `Decimal(x).quantize(Decimal("0.1"), ROUND_HALF_UP)` |
| (Python) jsonb com psycopg 3 | `conn.execute("INSERT ... %s", (Jsonb(dict),))` |

### [Módulo 08 · Arquitetura de Sistemas com IA](../modulos/08-arquitetura-de-sistemas-com-ia/)

| Tarefa | Comando |
|---|---|
| Fila durável no Postgres | `WITH m AS (INSERT ... RETURNING id) SELECT pg_notify($1, id::text) FROM m` |
| Consumir sem duplicar | `UPDATE ... WHERE id = (SELECT id ... FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING ...` |
| Embedding de consulta (Qwen3) | `Instruct: Given a question, retrieve passages that answer it\nQuery: <q>` |
| Streaming com uso de tokens | `stream: true, stream_options: { include_usage: true }` |
| Auditoria só de inserção | trigger `BEFORE UPDATE OR DELETE` com `RAISE EXCEPTION` |
| (Python) streaming com tokens | `client.chat.completions.create(..., stream=True, stream_options={"include_usage": True})` (o último chunk traz `usage`) |
| (Python) ouvir NOTIFY (psycopg 3) | `await conn.execute(sql.SQL("LISTEN {}").format(sql.Identifier(c)))` · `async for n in conn.notifies(timeout=0.1): ...` |
| (Python) vetor no pgvector sem numpy | `register_vector(conn)`; `conn.execute("... ORDER BY emb <=> %s", (Vector(lista),))` |

### [Módulo 09 · Dados e Fine-Tuning](../modulos/09-dados-e-fine-tuning/)

| Tarefa | Comando |
|---|---|
| Job de fine-tuning (OpenAI) | `client.fineTuning.jobs.create({ model, training_file, method: { type: 'supervised', supervised: { hyperparameters: { n_epochs: 3 } } } })` |
| LoRA com PEFT | `get_peft_model(m, LoraConfig(r=8, lora_alpha=16, target_modules=["q_proj","k_proj","v_proj","o_proj"], task_type="CAUSAL_LM"))` |
| Comparar base e LoRA nos mesmos pesos | `with modelo.disable_adapter(): ...` |
| torch só CPU no uv | `[tool.uv.sources] torch = { index = "pytorch-cpu" }` com `explicit = true` |
| Treinar LoRA (módulo 09) | `uv run python exemplos/03-lora-peft-cpu/treinar_lora.py --r 4 --epocas 1` |
| (Python) upload e job de fine-tuning | `client.files.create(file=Path("dados/treino.jsonl"), purpose="fine-tune")` · `client.fine_tuning.jobs.create(model=..., training_file=id, method={"type": "supervised", ...})` |
| (Python) contar tokens como o js-tiktoken | `tiktoken.get_encoding("o200k_base").encode(txt)` |
| (Python) conferir paridade com o JS | `cmp dados/python/treino.jsonl dados/treino.jsonl` |

### [Módulo 10 · Segurança e Governança](../modulos/10-seguranca-e-governanca/)

| Tarefa | Comando |
|---|---|
| Importância por permutação | `permutation_importance(modelo, X_te, y_te, scoring="roc_auc", n_repeats=20)` |
| Contribuição local (modelo linear) | `coef * scaler.transform(x)[0]` |
| Limiar sem vazamento | `cross_val_predict(m, X_tr, y_tr, cv=5, method="predict_proba")` |
| Reponderação por grupo | `w = P(g)*P(y)/P(g,y)` → `fit(..., sample_weight=w)` |
| Bateria de prompt injection | `node exemplos/03-prompt-injection/bateria.js --casos D1,I1` (em modulos/10-seguranca-e-governanca) |
| (Python) bateria de injeção com poucos casos | `cd modulos/10-seguranca-e-governanca && uv run python exemplos/03-prompt-injection/python/bateria.py --casos I1` |
| (Python) Postgres com autocommit | `with psycopg.connect(DATABASE_URL, autocommit=True) as db: db.execute(sql, params)` |

### [Módulo 11 · Capstone Micro-SaaS](../modulos/11-capstone-micro-saas/)

| Tarefa | Comando |
|---|---|
| Perguntar pela CLI (Entrega 1) | `npm run seed && npm run e1 -- perguntar acme "Posso dividir minhas férias?"` (em modulos/11-capstone-micro-saas) |
| Testar o MCP com o Inspector | `npx @modelcontextprotocol/inspector@2.11.0 --cli URL --header "Authorization: Bearer sk-acme-demo" --method tools/list` |
| Subir, testar a UI e derrubar | `npm run e3:subir && npm run e3:ui && npm run e3:descer` |
| CI local | `npm run e3:ci` |
| MCP dentro do Fastify | `reply.hijack(); await transport.handleRequest(req.raw, reply.raw, req.body)` |
| Compose usando a rede da infra | `networks: { infra: { external: true, name: ai-engineer_default } }` |
| (Python) preparar, popular e testar | `uv sync && uv run python -m app_py.seed && INTEGRACAO=1 uv run pytest && uv run ruff check .` |
| (Python) ADK no Ollama | `LiteLlm(model="ollama_chat/qwen3.5:4b", api_base="http://localhost:11434", reasoning_effort="none")` |
| (Python) UI Angular contra a API Python | `docker compose -f exemplos/03-entrega-3-front-e-implantacao/python/compose.yaml up -d --build --wait && URL_UI=http://localhost:31191 npm run e3:ui` |

### [Módulo 12 · Carreira](../modulos/12-carreira/)

| Tarefa | Comando |
|---|---|
| Auditar README de portfólio | `npm run ex01 -- <pasta>` (em modulos/12-carreira) |
| Simulador de entrevista | `node exemplos/04-simulador-de-entrevista/simulador.js --sortear 3 --seed 12` |
| Capacidade e custo | `rpsPico = reqDia/(horas*3600)*fatorPico` · `concorrência = rpsPico*latência` · `custo = tokens/1e6*preço` |
| Armazenamento vetorial | `vetores × dimensões × 4 bytes` (float32) |
| (Python) auditar README | `cd modulos/12-carreira && uv sync && uv run python exemplos/01-auditoria-de-readme/python/auditar.py ../03-mcp` |
| (Python) simulador de entrevista | `uv run python exemplos/04-simulador-de-entrevista/python/simulador.py --sortear 3 --seed 12` |
