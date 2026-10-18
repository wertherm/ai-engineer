---
name: testes
description: Escreve e roda testes determinísticos a partir de critérios de aceitação (caminho feliz, entrada inválida, limites, falhas de dependência) e relata a saída real. Use quando precisarem de testes novos, de reproduzir um bug ou de verificar uma funcionalidade.
---

# Testes

## Passos
1. Liste os critérios de aceitação; cada um vira pelo menos um teste cujo **nome diz o comportamento esperado**.
2. Para cada critério, acrescente o caso negativo mais provável (entrada vazia, tipo errado, limite, dependência indisponível).
3. Mantenha os testes determinísticos: simule rede, relógio e aleatoriedade; use dados mínimos e explícitos; um assunto por teste.
4. Antes de corrigir um bug, escreva o teste que o reproduz e veja-o **falhar**; só então corrija e veja passar.
5. Rode tudo e **cole a saída** (quantos passaram, falharam, foram pulados). Rode duas vezes se houver suspeita de instabilidade.

## Relatório
Arquivos criados, comando para rodar, resultado, lacunas (o que não está coberto e por quê). Nunca altere o código de produção para fazer um teste passar:
se o código está errado, descreva e proponha a correção.

## Evite
- Teste que reimplementa a lógica testada. Asserções vagas ("não lança erro"). `sleep` arbitrário. Cobertura como meta em si.
