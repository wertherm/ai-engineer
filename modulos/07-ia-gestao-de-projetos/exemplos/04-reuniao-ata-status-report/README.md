# Exemplo 04 · Reunião → ata → calendário → status report para 3 públicos

**Conceito novo**: schema **montado pelo código a partir dos dados**. Participantes (extraídos da
transcrição) e datas válidas (próximos 14 dias) viram `z.enum`, então o structured output só deixa o
LLM escolher responsável real e data válida. A ata validada vira um `.ics` (um `VTODO` por ação).
Depois, as métricas da sprint (% entregue × % do tempo, CPI, semáforo) são calculadas em código e o
LLM escreve o status report em três versões (técnico, gestor, diretoria), com uma checagem de números
sem lastro.

**Pré-requisito**: [exemplo 01](../01-requirements-copilot/) (structured output com zod).

Arquivos: `transcricao.txt`, `sprint.json`, `ata.js` (schema dinâmico, validação, .ics),
`status.js` (métricas, públicos, checagem numérica), `main.js`, `ata.test.js`.

**Áudio → texto (Whisper)**: ⚠️ não executado localmente. O exemplo parte de uma transcrição em texto
porque não há gravação de reunião de exemplo nem TTS na máquina para gerar uma. Em produção, a
transcrição viria do Whisper (por exemplo `pipeline('automatic-speech-recognition', ...)` do
`@huggingface/transformers`) ou da própria ferramenta de reunião.

## Como rodar

```bash
cd modulos/07-ia-gestao-de-projetos
npm run ex04                                              # ~5 min em CPU (4 chamadas ao LLM)
node --test exemplos/04-reuniao-ata-status-report/ata.test.js
cat exemplos/04-reuniao-ata-status-report/acoes.ics
```

## Saída esperada

Saída real:

```text
Decisões:
  • Liberar a segunda via no portal apenas para boletos não vencidos.
  • O e-mail de aviso será enviado sem link de pagamento nesta versão.
Pendências:
  • Ajuste da regra dos 60 dias na tela de busca por CPF, dependente da correção da API de juros.
  • Definição do texto do e-mail de aviso para aprovação jurídica.
  • Rodar testes e2e no ambiente de homologação.
Ações:
  • [Ana] Corrigir o cálculo de multa pro rata na API de juros (já realizado ontem). — 2026-11-04
  • [Bruno] Subir o ambiente de homologação. — 2026-11-04
  • [Marina] Falar com o jurídico para definir o texto do e-mail de aviso. — 2026-11-06

Validação (participantes: Marina, Ana, Bruno, Carla): ok
Calendário: exemplos/04-reuniao-ata-status-report/acoes.ics

Métricas (código): entrega 70% com 70% do tempo · CPI 0.88 · semáforo AMARELO

--- TECNICO ---
Estamos com 70% do escopo concluído, mas o sprint está amarelo devido a um bug crítico e bloqueios técnicos como a regra dos 60 dias. O CPI de 0,88 indica que estamos atrasados em relação ao plano original de entrega.

--- GESTOR ---
O projeto Portal de Boletos está em Sprint 14 com 3 dias restantes, apresentando um status amarelo devido a 4 bugs abertos (incluindo 1 crítico) e um escopo concluído em apenas 70% do planejado. Os próximos passos críticos envolvem que Ana corrigirá o cálculo de multa pro rata até 04/11 e Bruno subirá o ambiente de homologação no mesmo prazo, enquanto Marina deve finalizar a definição do texto do e-mail com o jurídico até 06/11 para desbloquear itens pendentes.

--- DIRETORIA ---
O projeto está no semáforo amarelo, com 70% do escopo entregue em apenas 3 dos 10 dias planejados e um bug crítico aberto. Precisamos liberar a segunda via do portal para boletos não vencidos e ajustar o e-mail de aviso conforme decisões aprovadas.
```

Trecho do `acoes.ics` gerado:

```text
BEGIN:VTODO
UID:acao-2-20261016T191502Z@modulo07
DTSTAMP:20261016T191502Z
DUE;VALUE=DATE:20261104
SUMMARY:Subir o ambiente de homologação.
DESCRIPTION:Responsável: Bruno
END:VTODO
```

```text
✔ participantes saem da transcrição
✔ valida responsável inventado e prazo fora do formato
✔ ICS tem um VTODO por ação com prazo
✔ semáforo amarelo com bloqueio e entrega igual ao tempo
✔ calendário resolve dia da semana
✔ número inventado é sinalizado
ℹ pass 6
```

O que observar (erros reais do modelo que continuam lá):

- A ação da Ana **já estava feita** ("corrigi ontem") e mesmo assim virou ação com prazo inventado.
  O enum garante uma data *válida*, não uma data *dita*.
- O técnico diz que CPI 0,88 indica "atraso" (CPI mede custo, não prazo); a diretoria diz "70% em
  apenas 3 dos 10 dias" (3 são os dias que *faltam*). A checagem de números não pega porque 3, 10 e
  0,88 existem nos fatos. Texto para diretoria precisa de revisão humana.
- Na primeira versão (schema com `z.string()`), o modelo devolveu `"Ana (dev)"` e
  `"Quarta-feira, dia 4."`, e o `.ics` saiu inválido. Agora, se a validação falhar, o script sai com
  código 1 **antes** de gerar o calendário.

## Experimente

1. Acrescente na transcrição `[09:10] Pedro: eu faço o deploy` e veja Pedro entrar automaticamente no
   enum de responsáveis.
2. Mude `sprint.json` para `pontosEntregues: 12` e confira o semáforo virar vermelho (regra em
   `status.js`), e o texto de cada público mudar de tom.
3. Importe `acoes.ics` no seu calendário (Thunderbird/Outlook/Google Calendar → importar arquivo).
