# Exemplo 05 · ChatOps com RBAC, aprovação humana, circuit breaker e auditoria

**Conceito novo**: um bot de ChatOps com núcleo independente de plataforma (`bot.js`) e comandos fechados
`/deploy`, `/scale`, `/rollback`, `/investigar`, `/aprovar`. Cada comando crítico passa por: RBAC por papel →
validação de argumentos → **dry-run no servidor + `kubectl diff`** (impacto) → pendente → **aprovação por outra
pessoa** (four-eyes) → circuit breaker / rate limit → execução com `argv` fixo → validação (rollout pronto, senão
desfaz). Tudo vai para uma **trilha de auditoria** append-only em `m06.chatops_auditoria` (Postgres). O LLM só
resume evidências em `/investigar`.

Teoria: [doc 04 · ChatOps](../../docs/04-chatops-runbooks-e-auto-remediacao.md#chatops-com-aprovação-humana).
Adaptadores Slack/Discord/Teams: trecho no doc 04 (**não executado localmente**: exigem workspace e token).

**Pré-requisito**: [exemplo 02](../02-agente-de-deploy-kind/), cluster kind e Postgres (`infra/subir-ia.sh`).

## Como rodar

```bash
cd modulos/06-ia-devops
npm run ex05                                                   # roteiro com 13 mensagens
node exemplos/05-chatops-com-aprovacao/main.js --interativo    # você digita: "bruno /scale web 3"
```

## Saída esperada

```
ana   › /scale web 3
  bot › ⛔ RBAC: papel "viewer" não pode usar /scale
bruno › /scale web 3
  bot › 📝 #1 aguardando aprovação de um SRE (outra pessoa). Impacto (dry-run): - replicas: 2 + replicas: 3
bruno › /aprovar 1
  bot › ⛔ papel "dev" não aprova
carla › /aprovar 1
  bot › ✅ #1 (scale web=3) aprovado por carla: deployment.apps/web scaled
carla › /rollback web
  bot › 📝 #2 aguardando aprovação de um SRE (outra pessoa). Impacto (dry-run): volta para a revisão anterior (1 revisões no histórico)
carla › /aprovar 2
  bot › ⛔ four-eyes: quem pede não aprova
bruno › /deploy web nginxinc/nginx-unprivileged:9.9.9-nao-existe
  bot › 📝 #3 aguardando aprovação de um SRE (outra pessoa). Impacto (dry-run): - - image: nginxinc/nginx-unprivileged:1.31.6-alpine + - image: nginxinc/nginx-unprivileged:9.9.9-nao-existe
carla › /aprovar 3
  bot › ❌ #3 (deploy web → nginxinc/nginx-unprivileged:9.9.9-nao-existe) aprovado por carla: rollout não ficou pronto em 40s → desfeito automaticamente
bruno › /deploy web nginxinc/nginx-unprivileged:9.9.8-nao-existe
  bot › 📝 #4 aguardando aprovação de um SRE (outra pessoa). Impacto (dry-run): - - image: nginxinc/nginx-unprivileged:1.31.6-alpine + - image: nginxinc/nginx-unprivileged:9.9.8-nao-existe
diego › /aprovar 4
  bot › ❌ #4 (deploy web → nginxinc/nginx-unprivileged:9.9.8-nao-existe) aprovado por diego: rollout não ficou pronto em 40s → desfeito automaticamente
bruno › /scale web 2
  bot › 📝 #5 aguardando aprovação de um SRE (outra pessoa). Impacto (dry-run): - replicas: 3 + replicas: 2
carla › /aprovar 5
  bot › 🔌 circuit breaker ABERTO após 2 falhas seguidas: mutações suspensas, investigue antes
ana   › /investigar web
  bot › 🔎 O serviço está instável devido a uma falha de imagem Docker, pois o registro não contém a tag solicitada "9.9.8-nao-existe", resultando no desligamento automático dos pods e redução da réplica para zero. A próxima ação é corrigir o nome da tag da imagem no arquivo de configuração do deployment ou no pipeline de CI/CD para apontar para uma versão válida existente.

Trilha de auditoria (m06.chatops_auditoria):
┌─────────┬────┬─────────┬─────────────┬──────────────────────────────────────────────────────────────────────────┐
│ (index) │ id │ usuario │ decisao     │ detalhe                                                                  │
├─────────┼────┼─────────┼─────────────┼──────────────────────────────────────────────────────────────────────────┤
│ 0       │ 12 │ 'ana'   │ 'negado'    │ 'papel viewer não pode /scale'                                           │
│ 1       │ 13 │ 'bruno' │ 'pendente'  │ '#1 - replicas: 2 + replicas: 3'                                         │
│ 2       │ 14 │ 'bruno' │ 'negado'    │ '#1: papel dev não aprova'                                               │
│ 3       │ 15 │ 'carla' │ 'executado' │ '#1 aprovado por carla: deployment.apps/web scaled'                      │
│ 4       │ 16 │ 'carla' │ 'pendente'  │ '#2 volta para a revisão anterior (1 revisões no histórico)'             │
│ 5       │ 17 │ 'carla' │ 'negado'    │ '#2: autoaprovação'                                                      │
│ 6       │ 18 │ 'bruno' │ 'pendente'  │ '#3 - - image: nginxinc/nginx-unprivileged:1.31.6-alpine + - image: ngi' │
│ 7       │ 19 │ 'carla' │ 'falhou'    │ '#3 aprovado por carla: rollout não ficou pronto em 40s → desfeito auto' │
│ 8       │ 20 │ 'bruno' │ 'pendente'  │ '#4 - - image: nginxinc/nginx-unprivileged:1.31.6-alpine + - image: ngi' │
│ 9       │ 21 │ 'diego' │ 'falhou'    │ '#4 aprovado por diego: rollout não ficou pronto em 40s → desfeito auto' │
│ 10      │ 22 │ 'bruno' │ 'pendente'  │ '#5 - replicas: 3 + replicas: 2'                                         │
│ 11      │ 23 │ 'carla' │ 'bloqueado' │ '#5: circuit breaker aberto'                                             │
│ 12      │ 24 │ 'ana'   │ 'executado' │ 'investigação (somente leitura)'                                         │
└─────────┴────┴─────────┴─────────────┴──────────────────────────────────────────────────────────────────────────┘
Estado final do web: 3 réplicas · nginxinc/nginx-unprivileged:1.31.6-alpine
1 chamadas ao LLM · 325 tokens de prompt · 86 de resposta · 292.7s no modelo
```

## Experimente

1. No modo interativo, faça 4 aprovações em menos de 1 minuto e veja o rate limit.
2. Tente `/scale web 50` ou `/deploy web nginx:latest`: a validação recusa antes do dry-run.
3. Rode `psql postgres://ia:ia@localhost:5433/ia -c "select * from m06.chatops_auditoria"` e responda: quem
   aprovou a release quebrada e quando o circuito abriu?
