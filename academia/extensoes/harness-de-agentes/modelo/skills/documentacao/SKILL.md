---
name: documentacao
description: Escreve README, guias de execução e ADRs verificando cada comando e afirmação contra o código, para que um leitor novo consiga seguir sem ajuda. Use quando pedirem para documentar, atualizar um README ou registrar uma decisão técnica.
---

# Documentação

## Passos
1. Defina o leitor e o que ele deve conseguir fazer depois de ler (rodar, integrar, decidir, operar).
2. Estruture: objetivo, pré-requisitos, passos numerados com comandos copiáveis, resultado esperado, problemas comuns, onde pedir ajuda.
3. **Execute** cada comando em ambiente limpo (ou diga que não executou). Confira versões, caminhos e nomes no código.
4. Fontes e datas: link para a documentação oficial e a data em que você a conferiu quando o assunto muda rápido. Nenhum número sem origem.
5. ADR (decisão): contexto, decisão, alternativas consideradas, consequências e como reverter.

## Formato da entrega
O texto final (ou o diff) e o relatório do que foi verificado e do que não foi.

## Evite
- Descrever o que o código deveria fazer em vez do que faz. Passos que dependem de conhecimento tácito. Credenciais, IPs ou nomes de hosts internos nos exemplos.
