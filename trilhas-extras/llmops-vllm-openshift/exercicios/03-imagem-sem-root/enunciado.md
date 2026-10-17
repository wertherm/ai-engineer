# Exercício 03 · Fazer uma imagem rodar sem root (OpenShift)

**Tópicos praticados:** exemplo 07 · [docs/06](../../docs/06-kubernetes-e-openshift.md)

## Contexto

O manifest [`quebrado.yaml`](quebrado.yaml) sobe um nginx que funciona no Docker e no Kubernetes padrão.
No OpenShift ele quebra. Sob as regras da SCC `restricted-v2`, simuladas no kind, o erro real é:

```
nginx: [emerg] mkdir() "/var/cache/nginx/client_temp" failed (13: Permission denied)
```

## Requisitos

1. Escreva `site.yaml` com Deployment + Service + Route que funcione sob `restricted-v2`.
2. **Não** use `anyuid`, `privileged` nem `runAsUser` fixo.
3. Explique, em comentários, por que cada mudança foi necessária.

## Critério de pronto

O teste da solução cria um namespace em modo `restricted`, força um UID aleatório com grupo 0 (como o
OpenShift faz) e chama o site. Ele tem de responder `HTTP 200`:

```bash
bash exercicios/03-imagem-sem-root/solucao/testar-no-kind.sh
```

## Dicas

- Usuário sem root não escreve em `/var/cache/nginx` e (tradicionalmente) não abre porta < 1024.
- Procure uma variante *unprivileged* da imagem antes de pensar em reconstruir.
- O Service pode continuar na porta 80; quem muda é a porta do container.

A solução está em [`solucao/`](solucao/). Saída real do teste: `uid=1000870000 gid=0(root)` e `HTTP 200`.
