---
name: diagramas-mermaid
description: Cria diagramas Mermaid (fluxo, sequência, estados, entidades) derivados do código e da documentação, com fontes e legenda, marcando o que é inferido. Use quando pedirem um diagrama de arquitetura, fluxo ou modelo de dados.
---

# Diagramas Mermaid

## Passos
1. Escreva a pergunta que o diagrama responde (uma por diagrama). Sem pergunta, não desenhe.
2. Levante os fatos no código/documentação e anote `arquivo:linha` de cada elemento. O que não foi confirmado fica marcado como **inferido**.
3. Escolha o tipo: `flowchart` (arquitetura/fluxo), `sequenceDiagram` (interação no tempo), `stateDiagram-v2` (estados), `erDiagram` (dados).
4. Use os nomes do código, poucos elementos, direção que leia bem (LR para fluxos longos). Agrupe com `subgraph` quando ajudar.
5. Valide a sintaxe (renderize ou use um validador de Mermaid) e escreva a legenda: o que é fato, o que é suposição, de qual commit.

## Formato da entrega
O bloco `mermaid`, a legenda curta e a lista de fontes. O diagrama mora junto do documento que o usa e é revisado no PR como código.

## Evite
- Diagrama "bonito" que mistura níveis (contexto, contêineres e classes juntos). Setas sem significado. Nomes inventados. Segredos, IPs ou hosts internos.
