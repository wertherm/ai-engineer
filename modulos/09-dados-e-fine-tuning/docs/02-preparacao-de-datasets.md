# 02 · Preparação de datasets para fine-tuning

## Objetivo

Transformar dados brutos e sujos de um domínio num JSONL de treino/validação no formato das APIs de
fine-tuning, com um pipeline em JavaScript reprodutível, validado e com relatório de qualidade.

## Explicação

No fine-tuning, **o dataset é o programa**: o modelo vai imitar exatamente o que estiver nele, inclusive os
erros. Um rótulo errado em 30% dos exemplos não é "ruído que some na média": é uma instrução para errar.

```mermaid
flowchart LR
  A[Coleta<br/>helpdesk, logs, e-mails] --> B[Limpeza<br/>HTML, espaços, caixa]
  B --> C[Privacidade<br/>mascarar PII]
  C --> D[Padronizar rótulos<br/>sinônimos, acentos]
  D --> E[Deduplicar<br/>exata + quase]
  E --> F[Balancear<br/>undersampling]
  F --> G[Split estratificado<br/>treino/validação]
  G --> H[JSONL chat<br/>messages]
  H --> I[Validador + relatório]
```

1. **Identificar e coletar**: comece pela pergunta "qual saída eu quero?". Para triagem de tickets, o par é
   (texto do ticket → categoria). Fontes reais: exportação do helpdesk, histórico de chats, planilhas de QA.
   Aqui os dados são **sintéticos** (gerados por `gerar-brutos.js`), imitando a sujeira de uma exportação real.
2. **Limpeza e padronização**: remover HTML/entidades, normalizar espaços e Unicode (NFC), tirar a caixa alta.
   **Mascarar PII** (e-mail, CPF, telefone) antes de qualquer upload — LGPD e risco de o modelo memorizar.
3. **Rótulos**: unificar variantes (`Cobrança`, `COBRANCA`, `financeiro` → `cobranca`) e descartar o que está
   fora do domínio (`elogio`, vazio). Conflitos (mesmo texto com rótulos diferentes) indicam ruído de anotação.
4. **Deduplicação**: exata (após normalizar) e quase-duplicata (Jaccard de palavras ≥ 0,9). Duplicatas pesam
   mais no treino e, se caírem em treino *e* validação, **vazam** e inflam a métrica.
5. **Balanceamento**: com 178 "entrega" e 34 "cancelamento", o modelo aprende a chutar "entrega".
   Undersampling (teto por classe) é o mais simples; oversampling duplica e favorece overfitting.
6. **Split estratificado**: mesma proporção de classes no treino e na validação; semente fixa.
7. **Formato**: uma conversa por linha, `{"messages":[system, user, assistant]}`. A última mensagem
   (`assistant`) é o alvo. É o formato de Chat Completions aceito pela OpenAI (e convertível para o do Gemini,
   que usa `contents`/`parts`).
8. **Qualidade e diversidade**: o relatório mede descartes por motivo, distribuição antes/depois, vazamento e
   diversidade lexical (type-token ratio, distinct-2). TTR baixo (0,13 aqui) = textos repetitivos: dados
   sintéticos de template generalizam mal para frases novas (o projeto final mostra isso).

## Código mínimo

```js
// uma linha do JSONL de treino (formato chat)
const paraChatJsonl = (r) => ({ messages: [
  { role: 'system', content: SYSTEM_PROMPT },
  { role: 'user', content: r.texto },
  { role: 'assistant', content: r.categoria },
] });
fs.writeFileSync('dados/treino.jsonl', treino.map((r) => JSON.stringify(paraChatJsonl(r))).join('\n') + '\n');
```

## Na prática

- [Exemplo 01](../exemplos/01-preparacao-de-dataset/) — pipeline completo, validador e testes (`npm test`).
- [Exercício 01](../exercicios/01-melhorar-dataset/) — medir quanto ruído e desbalanceamento custam em acurácia.
- Versionar o dataset junto do modelo (hash, MLflow): [trilha MLOps](../../../trilhas-extras/mlops/).

## Armadilhas

- **System prompt diferente entre treino e uso**: o modelo aprendeu com um texto; mudar a instrução em
  produção é mudar a distribuição. Aqui ele mora num lugar só: [`comum/dominio.json`](../comum/dominio.json).
- **Vazamento treino→validação**: deduplicar *antes* do split e checar a interseção depois.
- **Rótulo com variações** (`Entrega ` com espaço): sem padronizar, vira uma 6ª "categoria".
- **PII no dataset**: uma vez enviado a um provedor, não dá para "desenviar".
- **Achar que mais dados sempre ajuda**: 200 exemplos limpos vencem 2.000 ruidosos (exercício 01).

## Fontes

- OpenAI · Supervised fine-tuning (formato JSONL, mínimo de 10 exemplos, 50 recomendados): https://developers.openai.com/api/docs/guides/supervised-fine-tuning
- OpenAI Cookbook · Data preparation and analysis for chat model fine-tuning: https://cookbook.openai.com/examples/chat_finetuning_data_prep
- Google Cloud · Prepare supervised fine-tuning data for Gemini: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-supervised-tuning-prepare
- js-tiktoken: https://www.npmjs.com/package/js-tiktoken
