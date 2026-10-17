# Exemplo 06 · Segurança: Trivy + "AI fix" + re-scan

**Conceito novo**: o scanner (determinístico, com IDs estáveis) **acha**; o LLM **explica** o risco em
linguagem de negócio e **propõe** o manifest corrigido; a validação (YAML + `kubectl apply --dry-run`) e o
**re-scan** provam que (a) os achados caíram e (b) o fix não introduziu nenhum achado novo. Também mostra o
scanner de segredos com um token **falso** gerado em tempo de execução (não fica no repo para não disparar o
push protection do GitHub).

Teoria: [doc 02 · segurança e compliance](../../docs/02-iac-cicd-seguranca-e-finops.md#segurança-e-compliance).

**Pré-requisito**: `trivy` em `~/.local/bin` (ver README do módulo) e o cluster kind (só para o dry-run).
A 1ª execução do Trivy baixa o bundle de checks para `~/.cache/trivy`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `alvos/main.tf` | S3 com bloqueio público desligado e SG com SSH aberto para o mundo (só escaneado, nunca aplicado) |
| `alvos/deployment.yaml` | container privilegiado, root, sem limites, `nginx:latest` |
| `alvos/Dockerfile` | `node:latest`, sem `USER`, `ADD` remoto |
| `main.js` | scan → segredos → explicação + fix (LLM) → validação → re-scan |

## Como rodar

```bash
cd modulos/06-ia-devops
npm run ex06
trivy config exemplos/06-seguranca-scan-e-ai-fix/alvos        # só o scanner, tabela legível
```

## Saída esperada

```
== 1. trivy config alvos/ ==
   Dockerfile       HIGH=1 MEDIUM=1 LOW=1
   deployment.yaml  HIGH=3 MEDIUM=5 LOW=12
   main.tf          HIGH=6 MEDIUM=1 LOW=1

== 2. trivy fs --scanners secret ==
   CRITICAL github-pat em app.env:2 → GITHUB_TOKEN=****************************************

== 3. LLM explica e corrige deployment.yaml ==
   explicação: O risco real é que um atacante pode se elevar a privilégios de root, executar comandos destrutivos e comprometer todo o sistema. A combinação de configurações inseguras permite que vulnerabilidades sejam exploradas para obter controle total sobre os dados e serviços. Sem correções imediatas, qualquer falha de segurança poderá resultar em perda de dados, interrupção do serviço ou violação da conformidade.
   fix proposto em 381s → exemplos/06-seguranca-scan-e-ai-fix/saida/deployment.corrigido.yaml
   dry-run client: ✓ · dry-run server: ✗ Error from server (BadRequest): error when creating "STDIN": Deployment in version "v1" cannot be handled as a Deployment: strict decoding error: unknown field "spec.template.spec.securityContext.readOnlyRootFilesystem"

== 4. re-scan ==
   antes : HIGH=3 MEDIUM=5 LOW=12
   depois: MEDIUM=1 LOW=3
   restantes: KSV-0020, KSV-0021, KSV-0110, KSV-0125 · novos introduzidos pelo fix: KSV-0125

Veredito: fix REJEITADO → não vai para o PR (devolver ao LLM ou corrigir à mão)
2 chamadas ao LLM · 562 tokens de prompt · 377 de resposta · 531.6s no modelo
```

O pipeline fez exatamente o seu trabalho, e a saída mostra por quê ele existe:

- O fix **reduziu** os achados (HIGH 3 → 0, MEDIUM 5 → 1), mas o modelo colocou `readOnlyRootFilesystem` no
  `securityContext` **do pod** (o campo só existe no do container). O `--dry-run=client --validate=strict` deixou
  passar; o **`--dry-run=server`** pegou (`strict decoding error: unknown field`).
- O re-scan achou um achado **novo** (`KSV-0125`, registry não confiável: a imagem trocada é de outro registry) e o
  modelo ignorou o `namespace: pagamentos` pedido (`KSV-0110` continua).
- Mesmo "verde" no scanner, `readOnlyRootFilesystem: true` no nginx quebra em runtime (ele escreve em `/tmp` e
  `/var/cache/nginx`): sem um `emptyDir` montado, o pod não sobe. Scanner feliz ≠ aplicação funcionando; o
  próximo portão seria subir o pod e esperar a readiness, como no exemplo 02.

## Experimente

1. `trivy config --compliance k8s-pss-restricted-0.1 --report summary exemplos/06-seguranca-scan-e-ai-fix/alvos/deployment.yaml`
   para ver o relatório por controle (base de relatório de compliance).
2. Peça ao LLM o fix do `main.tf` também e re-escaneie (dica: `aws_s3_bucket_versioning` e `aws_s3_bucket_server_side_encryption_configuration`).
3. Rode `trivy image nginx:1.31.6-alpine` (baixa o banco de CVEs) e peça ao LLM um resumo de remediação das CVEs com fix disponível.
