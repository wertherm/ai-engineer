# Exercício 02 · RAG de runbooks com dry-run, aprovação e post-mortem blameless

## Contexto

Às 3h da manhã chega o alerta `KubePodCrashLooping` do serviço `relatorios`. O time tem runbooks em
Markdown, mas ninguém lembra qual usar. Você vai montar o agente de plantão que: acha o runbook certo por
similaridade, **confirma** o sintoma, executa a mitigação **com guardrails** e escreve o post-mortem.

Unidades cobertas: X (RAG de runbooks e post-mortem) e XI (auto-remediação com guardrails).

## Requisitos

1. Indexe os runbooks de `solucao/runbooks/*.md` no pgvector (schema `m06`), embutindo título + seção
   "Sintoma" (é contra o sintoma que o alerta precisa casar).
2. Crie no kind (namespace `m06-runbook`) um Deployment que morre por OOM (limite 32Mi, processo de ~50 MB).
3. Dado o alerta, recupere o runbook (mostre os 3 candidatos e o score). Score abaixo de um mínimo → não
   executa nada, escala.
4. **Verifique** o sintoma de forma determinística (o `lastState.terminated.reason` é `OOMKilled`?).
5. Extraia os comandos dos blocos `bash` do runbook (sem pedir ao LLM), preencha `{{namespace}}`/`{{app}}`,
   valide contra uma **allowlist** de verbos (sem `delete`) e o namespace do alerta, rode `--dry-run=server`,
   peça **aprovação humana** e só então execute.
6. Valide (rollout pronto + container rodando 20 s depois) e registre tudo numa **timeline** com horário.
7. Gere um **post-mortem blameless** com o LLM a partir da timeline e guarde-o (com embedding) para que
   incidentes futuros o recuperem (lessons learned).

## Critério de pronto

- O runbook `01-pod-oomkilled.md` é o 1º candidato e a mitigação sobe o limite para 128Mi.
- Sem aprovação, nada muda no cluster. Comando fora da allowlist é bloqueado.
- O pod fica rodando após a mitigação e o post-mortem tem as seções pedidas, sem culpar pessoas.

## Dicas

- `1 - (embedding <=> $1::vector)` dá a similaridade de cosseno no pgvector.
- `kubectl set resources ... --dry-run=server` mostra o que mudaria sem gravar.
- Em modo roteiro, `--auto-aprovar` registra "aprovação simulada" (no terminal, sem a flag, ele pergunta `[s/N]`).
- Experimente trocar o alerta para "certificado expirando": o runbook 04 usa `delete` e deve ser bloqueado.

## Solução

[`solucao/`](solucao/) · rode a partir da pasta do módulo:

```bash
npm run exe02 -- --auto-aprovar      # roteiro completo (kind + pgvector + LLM)
node exercicios/02-runbook-rag-e-postmortem/solucao/main.js   # interativo: pergunta [s/N]
```

Saída real da solução:

```
Runbooks indexados: 4
[11:32:45] ALERTA KubePodCrashLooping em m06-runbook/relatorios: container relatorios reiniciando repetidamente; último término com exit code 137
   candidato 0.711 · 01-pod-oomkilled.md
   candidato 0.624 · 02-imagem-nao-encontrada.md
   candidato 0.478 · 03-latencia-alta.md
   post-mortem anterior relacionado: #1 KubePodCrashLooping (score 0.793)
[11:32:46] runbook escolhido: 01-pod-oomkilled.md (score 0.711)
   $ kubectl -n m06-runbook get pods -l app=relatorios --no-headers
     relatorios-5dbbc698d4-bvtcf   0/1   OOMKilled   1 (4s ago)   5s
   $ kubectl -n m06-runbook get deploy relatorios -o jsonpath={.spec.template.spec.containers[0].resources}
     {"limits":{"memory":"32Mi"},"requests":{"memory":"16Mi"}}
[11:32:47] verificação confirmou: lastState.terminated.reason=OOMKilled
[11:32:47] dry-run ok: deployment.apps/relatorios resource requirements updated (server dry run)
[11:32:47] aprovado por aprovação simulada (--auto-aprovar)
[11:32:48] MITIGAÇÃO executada: kubectl -n m06-runbook set resources deploy/relatorios --limits=memory=128Mi --requests=memory=64Mi → deployment.apps/relatorios resource requirements updated
[11:32:48] validação "rollout status": ok (deployment "relatorios" successfully rolled out)
[11:33:09] pós-mitigação (20 s depois): container rodando · log: "relatorio pronto"

--- post-mortem (409s) → solucao/saida/postmortem.md ---
# Post-Mortem BLAMELESS

## Resumo
O serviço de relatórios no namespace `m06-runbook` entrou em um ciclo de reinício contínuo (`CrashLoopBackOff`) devido a uma condição de morte por falta de memória (`OOMKilled`). O sistema automatizado detectou o erro, identificou o runbook correto e executou uma mitigação automática ajustando os limites de memória do deployment. A validação confirmou que o rollout foi bem-sucedido e o container retornou ao estado de execução normal após 20 segundos.

## Impacto
*   O serviço de relatórios permaneceu indisponível para consumo durante aproximadamente 17 segundos (do alerta inicial até a estabilização pós-mitigação).
*   Não houve registro de falha na detecção ou execução do runbook, garantindo que o incidente foi resolvido automaticamente sem intervenção manual.

## Causa raiz
A causa raiz é a configuração inadequada dos recursos de memória no deployment `relatorios`, especificamente um limite superior (`limits`) inferior à demanda real de memória necessária para processar os dados gerados pelo serviço, resultando em `OOMKilled`.

## O que funcionou
*   O sistema de orquestração detectou corretamente o código de saída 137 e classificou o evento como `OOMKilled`.
*   O mecanismo de automação selecionou com precisão o runbook apropriado (`01-pod-oomkilled.md`) baseado no tipo de erro.
*   A mitigação automática ajustou os recursos para `limits=memory=128Mi` e `requests=memory=64Mi`, resolvendo imediatamente o problema sem necessidade de intervenção humana.

## Ações de acompanhamento
| Ação | Dono sugerido | Status |
| :--- | :--- | :--- |
| Revisar a política de limites de memória para o serviço de relatórios e ajustar conforme a carga real. | Engenheiro de Plataforma | Pendente |
| Implementar alertas proativos baseados em métricas de uso de memória antes que o container seja `OOMKilled`. | Engenheiro de Observabilidade | Pendente |

## Lições aprendidas
*   A automação de resposta a incidentes funcionou conforme projetado, demonstrando a eficácia do processo de mitigação automática para falhas de recursos.
*   É necessário revisar os padrões de dimensionamento de recursos para garantir que os limites (`limits`) sejam sempre superiores à demanda estimada (`requests`).

## Timeline (gerada pelo agente)

- 11:32:45 ALERTA KubePodCrashLooping em m06-runbook/relatorios: container relatorios reiniciando repetidamente; último término com exit code 137
- 11:32:46 runbook escolhido: 01-pod-oomkilled.md (score 0.711)
- 11:32:47 verificação confirmou: lastState.terminated.reason=OOMKilled
- 11:32:47 dry-run ok: deployment.apps/relatorios resource requirements updated (server dry run)
- 11:32:47 aprovado por aprovação simulada (--auto-aprovar)
- 11:32:48 MITIGAÇÃO executada: kubectl -n m06-runbook set resources deploy/relatorios --limits=memory=128Mi --requests=memory=64Mi → deployment.apps/relatorios resource requirements updated
- 11:32:48 validação "rollout status": ok (deployment "relatorios" successfully rolled out)
- 11:33:09 pós-mitigação (20 s depois): container rodando · log: "relatorio pronto"
---
Post-mortem indexado em m06.postmortems.
1 chamadas ao LLM · 421 tokens de prompt · 541 de resposta · 409.4s no modelo
```

Repare no que ainda precisa de revisão humana mesmo com o prompt endurecido: o post-mortem fala em
"indisponível durante aproximadamente 17 segundos", número que **não** está medido na timeline (o alerta só
chegou depois de reinícios). Na 1ª versão da solução (`max_tokens` 420, timeline reescrita pelo LLM) o texto
saiu cortado no meio e afirmava "nenhum dado foi perdido" sem evidência. Por isso a timeline agora é anexada
pelo código, o prompt manda escrever "a confirmar" e o `finish_reason == "length"` é checado.
