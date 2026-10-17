# Boas práticas

## Serving (vLLM)

- **Fixe versões**: imagem (`vllm-openai-cpu:v0.31.0-x86_64`, nunca `latest`), modelo (de preferência com `--revision`) e parâmetros.
- **Mande os parâmetros de sampling em toda requisição**: o `generation_config.json` do modelo muda o padrão sem avisar.
- **Dimensione o contexto**: `--max-model-len` do tamanho que você usa, não o máximo do modelo.
- **Reserve núcleos** para o servidor HTTP em CPU (`VLLM_CPU_OMP_THREADS_BIND=0-5` numa máquina de 8).
- **Aqueça antes de medir ou de receber tráfego**: a 1ª requisição compila kernels.
- **Não exponha a porta crua**: `--api-key` não protege `/metrics`; ponha um gateway ou Route com autenticação na frente.

## Avaliação e mudanças

- **Prompt, parâmetros e casos de avaliação no Git, juntos.** O que vai para produção é o conjunto.
- **`temperature=0` para avaliar**; a temperatura de produção é testada à parte.
- **Toda mudança passa pelo portão** (avaliação + SLO), como no [projeto final](../trilhas-extras/llmops-vllm-openshift/projeto-final/).
- **Falha conhecida fica registrada** (`xfail`) e cada bug de produção vira um caso novo.
- **Meça antes de mudar o prompt** e depois de mudar. Intuição sobre prompt engana.

## Observabilidade

- Alertas em **percentis** (p95/p99) de TTFT e ITL, mais fila (`num_requests_waiting`) e `kv_cache_usage_perc`.
- Benchmarks com **tamanho de saída fixo** (`ignore_eos`), prompts variados (sem prefix cache inflando) e aquecimento descartado.
- **Não logue dados pessoais** em prompts e traces sem mascarar.

## Kubernetes / OpenShift

- **`startupProbe`** generoso + readiness + liveness em `/health`.
- **requests = o que o pod precisa para funcionar**; limit de memória para não derrubar o nó.
- **Imagens sem root**: UID arbitrário, grupo 0, pastas com `chgrp 0` / `g=u`, porta > 1024.
- **Sem `anyuid`/`privileged` fora do laboratório.** Corrija a imagem.
- **Manifests numerados ou Kustomize**, para a ordem de aplicação ser explícita.
- **`enableServiceLinks: false`** em apps que leem variáveis `<NOME>_PORT` (o vLLM lê).
- **Cache do modelo em PVC** (ou imagem OCI do modelo): baixar o modelo a cada pod novo é lento e caro.

## MLOps

- **Versione código, dados e modelo juntos**: parâmetros em arquivo (`params.yaml`), digest do dataset no run, modelo no registry.
- **Seeds fixas** em split, modelo e validação cruzada.
- **Pré-processamento dentro do `Pipeline`** do scikit-learn e salvo junto com o modelo.
- **Escolha a métrica pelo custo do erro** (recall da classe crítica, não acurácia) e escreva a regra no código.
- **Valide os dados antes de treinar** (esquema, nulos, faixas): dado ruim deve parar o pipeline.
- **Promova por alias, com portão**: mínimos absolutos + "melhor que o champion".
- **Monitore drift de dados e de previsão** e meça o desempenho real quando o rótulo chegar.
- **Retreino automático só passando pelo mesmo portão** do treino manual.

