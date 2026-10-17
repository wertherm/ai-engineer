# 03 · Reuniões turbinadas e status reports para cada público

## Objetivo

Ao terminar você sabe: (1) transformar a transcrição de uma reunião em ata estruturada (decisões,
pendências e ações com responsável e prazo); (2) impedir que o LLM invente responsável ou data,
montando o schema a partir dos dados da própria reunião; (3) exportar as ações para calendário
(`.ics`) e boards; (4) gerar status report de sprint/projeto em versões para time técnico, gestor e
diretoria, com as métricas e o semáforo calculados em código.

## Explicação

### U6 · Reunião → ata → calendário/board

```mermaid
flowchart LR
  AU[Áudio] -.Whisper opcional.-> TR[Transcrição com falantes]
  TR --> P[participantes() e calendário<br/>em código]
  P --> SC[schema zod com enums<br/>responsável ∈ participantes<br/>prazo ∈ datas válidas]
  TR --> LLM
  SC --> LLM[LLM extrai a ata]
  LLM --> V{validarAta}
  V -->|ok| ICS[.ics para o calendário]
  V -->|ok| BOARD[cards no board<br/>ver doc 04]
  V -->|falha| H[revisão humana]
```

1. **Transcrever**: em produção, Whisper (local via `@huggingface/transformers` ou um serviço) gera o
   texto; diarização (quem falou) vem da ferramenta de reunião ou de um modelo à parte. O exemplo
   parte de uma transcrição em texto com `[hh:mm] Nome (papel): fala`.
2. **Schema montado pelo código**: participantes vêm da transcrição por regex e as datas válidas são
   os próximos 14 dias com o dia da semana. Isso vira `z.enum(...)`. Com structured output, o servidor
   **só deixa** o modelo gerar um desses valores: "Ana (dev)" ou "quarta-feira, dia 4" deixam de ser
   possíveis.
3. **Validar mesmo assim** (segunda linha de defesa, para provedores sem decoding restrito) e **não
   publicar** nada no calendário se a validação falhar.
4. **Integrar**: `.ics` (RFC 5545) com um `VTODO` por ação é importável em Google Calendar, Outlook e
   Thunderbird sem nenhuma API. Para boards, as ações viram cards (ver
   [doc 04](04-automacao-governanca-e-integracoes.md)).

### U7 · Status reports e executive summaries

Um bom status report responde três perguntas: **onde estamos** (números), **o que pode dar errado**
(riscos/bloqueios) e **o que precisamos de você** (decisão/ação). O que muda por público é o recorte:

| Público | Foco | Tamanho |
|---|---|---|
| Técnico | bugs, bloqueios, dependências, jargão permitido | 3 frases |
| Gestor | prazo, riscos, próximos passos e quem faz o quê | 3 frases |
| Diretoria | impacto no negócio e se precisa de decisão; sem jargão | 2 frases |

Divisão de trabalho: **código** calcula % entregue × % do tempo, CPI (valor agregado / custo real) e o
semáforo por regra explícita; **LLM** recebe esses fatos em JSON e só redige. Para portfólio, rode o
mesmo cálculo por projeto e consolide (soma de orçamento, pior semáforo, KRs afetados) antes de pedir
o texto.

**Checagem barata de alucinação numérica**: extraia os números do texto gerado e confira se cada um
existe nos fatos. Não pega tudo (número por extenso, número certo em frase errada), mas pega o "atraso
de 5 dias" inventado.

## Código mínimo

```js
// O schema nasce dos dados da reunião: o LLM não consegue citar quem não estava lá.
const nomes = participantes(transcricao);            // ['Marina', 'Ana', 'Bruno', 'Carla']
const datas = calendario('2026-11-02').map((c) => c.iso);
const Ata = z.object({
  decisoes: z.array(z.string()),
  pendencias: z.array(z.string()),
  acoes: z.array(z.object({ responsavel: z.enum(nomes), tarefa: z.string(), prazo: z.enum([...datas, 'sem prazo']) })),
});
```

## Na prática

- [Exemplo 04 · Reunião → ata → .ics → status report](../exemplos/04-reuniao-ata-status-report/).

## Armadilhas

- **Schema com `z.string()` para responsável e prazo**: na primeira versão do exemplo o modelo
  devolveu `"Ana (dev)"` e `"Quarta-feira, dia 4."`, e o `.ics` saiu com `DUE;VALUE=DATE:Quartafeira`.
  Correção: enums gerados pelo código + data de referência no prompt.
- **Ação que já foi feita vira ação nova**: o modelo listou "corrigir a API de juros (já realizado
  ontem)" como ação com prazo. Ensine no prompt que ação é "o que alguém assumiu fazer" e revise.
- **Número certo, frase errada**: a versão para a diretoria disse "70% entregue em apenas 3 dos 10
  dias" (3 é o que *falta*). A checagem numérica não pega porque 3 e 10 existem nos fatos. Para
  público executivo, mande frases-modelo com os números já encaixados ou revise antes de enviar.
- **Mandar a transcrição inteira de 1 hora** para um modelo pequeno: divida por tópico/pauta e
  consolide as atas parciais.
- **Privacidade**: transcrição de reunião tem dado pessoal e estratégico. Prefira modelo local (como
  aqui) ou provedor com contrato de não retenção.

## Fontes

- iCalendar (RFC 5545, VTODO): https://datatracker.ietf.org/doc/html/rfc5545
- Transformers.js (pipeline de reconhecimento de fala com Whisper): https://huggingface.co/docs/transformers.js/index
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- Ollama structured outputs: https://docs.ollama.com/capabilities/structured-outputs
- Earned Value Management (CPI): https://en.wikipedia.org/wiki/Earned_value_management
