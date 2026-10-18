# Exemplo 03 · Troubleshooting ReAct: CrashLoopBackOff, ImagePullBackOff e OOMKilled

**Conceito novo**: um agente **ReAct** com ferramentas **somente leitura** (`descrever_pod`, `logs_pod`)
coleta evidências, raciocina e devolve `{categoria, causa, correcao}`. Três pods são quebrados de propósito
no kind (gabarito conhecido) e o **acerto é medido**, lado a lado com um baseline de regras determinísticas.

Teoria: [doc 03 · troubleshooting](../../docs/03-kubernetes-troubleshooting-e-aiops.md#troubleshooting-assistido-com-react);
ReAct em detalhe: [módulo 04](../../../04-agentes-autonomos/exemplos/02-react-vs-plan-execute/).

**Pré-requisito**: [exemplo 02](../02-agente-de-deploy-kind/) e o cluster kind no ar.

## Arquivos

| Arquivo | Papel |
|---|---|
| `pods-quebrados.yaml` | `checkout` (sai com erro: env ausente), `catalogo` (tag inexistente), `relatorios` (estoura 32Mi) |
| `ferramentas.js` | toolbox read-only com saída **filtrada** (o `describe` cru tem ~120 linhas) + `classificarPorRegra` |
| `main.js` | cria o cenário, roda o agente por pod (máx. 4 passos), compara com o gabarito e limpa `m06-troubleshoot` |

## Como rodar

```bash
cd modulos/06-ia-devops
npm run ex03          # ~7 a 12 chamadas ao LLM: dezenas de minutos com o Ollama compartilhado em CPU
```

## Saída esperada

```
Aguardando os pods falharem (60 s)...
NAME         READY   STATUS         RESTARTS      AGE
catalogo     0/1     ErrImagePull   0             61s
checkout     0/1     Error          3 (46s ago)   61s
relatorios   0/1     OOMKilled      3 (41s ago)   60s

── checkout (gabarito: CrashLoopBackOff)
   [ação 1] descrever_pod({"nome":"checkout"}) 441s → 631 chars
   [ação 2] logs_pod({"nome":"checkout"}) 207s → 81 chars
   [ação 3] descrever_pod repetida → lembrete para concluir
   regra    : CrashLoopBackOff ✓
   agente   : Outro ✗
   causa    : O container está falhando devido à variável de ambiente DATABASE_URL não estar definida.
   correção : Adicione a variável de ambiente DATABASE_URL ao deployment ou passe os argumentos do container para definir essa variável.

── catalogo (gabarito: ImagePullBackOff)
   [ação 1] descrever_pod({"nome":"catalogo"}) 21s → 688 chars
   [ação 2] logs_pod({"nome":"catalogo"}) 137s → 74 chars
   [resposta] 2476s
   regra    : ImagePullBackOff ✓
   agente   : ImagePullBackOff ✓
   causa    : O pod não consegue puxar a imagem do registro, pois ela não foi encontrada.
   correção : Verifique se o nome da imagem está correto ou se o serviço de autenticação do registro está configurado corretamente.

── relatorios (gabarito: OOMKilled)
   [ação 1] descrever_pod({"nome":"relatorios"}) 2686s → 533 chars
   [ação 2] logs_pod({"nome":"relatorios"}) 3356s → 29 chars
   [resposta] 11s
   regra    : OOMKilled ✓
   agente   : OOMKilled ✓
   causa    : O pod foi killed pelo OOM Killer por exceder o limite de memória de 32Mi.
   correção : Aumente o limite de memória do container para um valor superior ao necessário.

Acerto da categoria: agente 2/3 · regras 3/3
Namespace m06-troubleshoot removido (use --manter para inspecionar).
10 chamadas ao LLM · 6393 tokens de prompt · 395 de resposta · 9456.1s no modelo
```

Como ler:

- **Acerto medido: agente 2/3, regras 3/3.** No `checkout` o agente achou a causa e a correção certas
  (`DATABASE_URL` ausente, lida no log), mas classificou como `Outro`: confundiu "sintoma" (CrashLoopBackOff) com
  "causa". É por isso que a categoria vem das regras e o LLM fica com a explicação e o fix.
- A guarda anti-loop entrou em ação (`descrever_pod repetida → lembrete para concluir`). Na 1ª versão, sem a
  guarda e com 4 passos, o modelo alternou describe → logs → describe → logs no primeiro pod e a execução foi
  interrompida por custo.
- Os tempos são de relógio de parede: a fila do Ollama era compartilhada com outros processos e a máquina
  ficou pausada durante parte desta execução (daí os 2.476 s e 3.356 s; a última resposta levou 11 s).

## Experimente

1. Adicione um 4º pod `Pending` (peça `requests.memory: 64Gi`) e uma categoria `Unschedulable`; veja se o agente acerta.
2. Tire o filtro de `descrever_pod` e devolva o `kubectl describe` inteiro: compare tokens de prompt e tempo.
3. Troque a ordem do prompt ("chame logs_pod primeiro") e observe o agente tentando ler log de um container que nunca rodou.

## Versão Python

Arquivos em [`python/`](python/): `ferramentas.py` (mesma toolbox read-only `descrever_pod`/`logs_pod`, mesmo schema de
function calling e mesmo baseline por regras) e `main.py` (mesmo loop ReAct com guarda anti-loop e orçamento de
3 passos). Os pods quebrados vêm do **mesmo** [`pods-quebrados.yaml`](pods-quebrados.yaml), aplicado no namespace
`m06py-troubleshoot`. A mensagem do assistente com `tool_calls` volta ao histórico com `msg.model_dump(exclude_none=True)`.

### Como rodar

```bash
cd modulos/06-ia-devops
uv run python exemplos/03-troubleshooting-react/python/main.py      # ~10 chamadas ao LLM
uv run python exemplos/03-troubleshooting-react/python/main.py --manter
```

### Saída esperada (Python)

```
Aguardando os pods falharem (60 s)...
NAME         READY   STATUS         RESTARTS      AGE
catalogo     0/1     ErrImagePull   0             60s
checkout     0/1     Error          3 (47s ago)   60s
relatorios   0/1     OOMKilled      3 (42s ago)   60s

── checkout (gabarito: CrashLoopBackOff)
   [ação 1] descrever_pod({"nome": "checkout"}) 41s → 534 chars
   [ação 2] logs_pod({"nome": "checkout"}) 125s → 81 chars
   [ação 3] descrever_pod repetida → lembrete para concluir
   regra    : CrashLoopBackOff ✓
   agente   : Outro ✗
   causa    : O container falha ao iniciar devido à variável de ambiente DATABASE_URL não estar definida.
   correção : Adicione a variável de ambiente DATABASE_URL no deployment do pod checkout.

── catalogo (gabarito: ImagePullBackOff)
   [ação 1] descrever_pod({"nome": "catalogo"}) 81s → 707 chars
   [ação 2] logs_pod({"nome": "catalogo"}) 52s → 74 chars
   [resposta] 56s
   regra    : ImagePullBackOff ✓
   agente   : ImagePullBackOff ✓
   causa    : O pod está tentando puxar uma imagem que não existe no registro Docker.
   correção : Verifique o nome da imagem e a tag no deployment ou service para garantir que eles estão corretos.

── relatorios (gabarito: OOMKilled)
   [ação 1] descrever_pod({"nome": "relatorios"}) 39s → 558 chars
   [ação 2] logs_pod({"nome": "relatorios"}) 29s → 29 chars
   [ação 3] descrever_pod repetida → lembrete para concluir
   regra    : OOMKilled ✓
   agente   : OOMKilled ✓
   causa    : O container foi matado por excesso de memória devido ao limite de 32Mi ser insuficiente para a execução do script de geração de relatórios.
   correção : Aumente o limite de memória no Deployment para pelo menos 128Mi ou verifique se o script pode ser otimizado.

Acerto da categoria: agente 2/3 · regras 3/3
Namespace m06py-troubleshoot removido (use --manter para inspecionar).
11 chamadas ao LLM · 6844 tokens de prompt · 432 de resposta · 699.2s no modelo
```

Mesmo acerto medido do JS (**agente 2/3 · regras 3/3**) e o mesmo erro: no `checkout` o agente acertou causa e
correção (`DATABASE_URL`), mas classificou como `Outro`. A guarda anti-loop disparou em 2 dos 3 pods. Desta vez a
fila do Ollama estava mais livre: 699 s no modelo contra 9.456 s da execução JS.
