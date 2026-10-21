---
etapa: 2
titulo: APIs, TypeScript, erros e integração com modelos
competencias: C04, C05
duracao_min: 240
revisado_em: 2026-10-20
---

# Lição 2 · APIs, TypeScript, erros e integração com modelos

> Antes de começar, tenha feito a [Lição 1](../01-tokens-contexto-inferencia/README.md) (você vai reaproveitar `usage` e `finish_reason`). Ao terminar, registre a sessão
> como descrito em [SINCRONIZACAO.md](../../SINCRONIZACAO.md#fim-da-sessão).

## 1. Identificação e pré-requisitos

| Item | Valor |
|---|---|
| Etapa / fase | 2 de 16 · Fase 1 — Fundamentos de LLMs |
| Competências | [C04, C05](../../competencias.md#catálogo) |
| Pré-requisitos de conhecimento | a [Lição 1](../01-tokens-contexto-inferencia/README.md) (chamada HTTP, `usage`, `finish_reason`); `async/await` (ou o equivalente em Python); ler e escrever JSON |
| Pré-requisitos de ambiente | Node 22.18 ou superior (para executar `.ts`; o repositório usa o 24) **ou** Python 3.10 ou superior. **Não precisa de LLM**: o laboratório usa um servidor falso que falha de propósito |
| Já existe no repositório | [M01 · `lib/llm.js`](../../../modulos/01-fundamentos-ia-llms/lib/llm.js) · [M01 · `comum_py/llm.py`](../../../modulos/01-fundamentos-ia-llms/comum_py/llm.py) · [M01 · exemplo 06 (Ollama e OpenRouter)](../../../modulos/01-fundamentos-ia-llms/exemplos/06-openrouter-e-ollama/) · [M02 · exemplo 04 (API back-end com LLM)](../../../modulos/02-apis-ia-generativa/exemplos/04-api-backend-com-llm/) · [M02 · exercício 01 (validação e retry)](../../../modulos/02-apis-ia-generativa/exercicios/01-chain-com-validacao-e-retry/enunciado.md) |
| Entrega no [projeto evolutivo](../../projeto/README.md) | o cliente de LLM do marco 2 (`src/llm/cliente.ts`): timeout, retry com backoff, erros tipados e configuração por ambiente |

Esta lição **não repete** o material acima: ele mostra como chamar o modelo; aqui você aprende o que fazer quando a chamada **falha**, e prova isso contra um provedor que falha de propósito.

## 2. Objetivos de aprendizagem

Ao terminar, você consegue:

1. **Classificar** as falhas de uma chamada a um LLM em nove tipos e **decidir**, para cada um, se vale tentar de novo (e por quê).
2. **Implementar** timeout por tentativa e retry com backoff exponencial, *jitter* e limites, **respeitando o `Retry-After`** sem se deixar travar por ele.
3. **Modelar** requisição, resposta e erros em TypeScript e **explicar** o que o Node faz (e o que *não* faz) com os tipos.
4. **Separar** o que é fundamento do que é detalhe de fornecedor e **trocar de provedor só por configuração**.
5. **Testar** um cliente contra falhas simuladas, medindo quantas tentativas fez e quanto esperou, e **reconhecer os limites** dessas garantias.

Mapa: objetivo 1 → Q1, Q2, V2, V4, CA3, CA4 · 2 → Q3, Q4, Q5, Q6, V1, V3, V5, CA4, CA5, CA6 · 3 → Q7, Q8 (sobre TypeScript no Node; quem faz o laboratório em Python também as responde) · 4 → Q9, Q10, CA2, CA8 · 5 → CA1–CA9 e rubrica.

## 3. Duração estimada

| Parte | Tempo |
|---|---|
| Microlição (seção 4), exemplos (seção 6) e leitura de parte do material da seção 5 | 65 min |
| Quiz (seção 7) e correção comentada | 25 min |
| Desafio hands-on (seção 8) | 105 min |
| Explicação sem consulta e relatório (seção 12) | 35 min |
| Registro da sessão | 10 min |
| **Total** | **4 h** (referência; faça no seu ritmo e em duas sessões se preferir: é mais longa que a Lição 1) |

## 4. Microlição

### 4.1 O que pode dar errado numa chamada

Uma chamada a um LLM atravessa a sua rede, a do provedor e um servidor que está dividindo a máquina com muita gente. Ela pode falhar **antes** de chegar (rede), **no meio** (timeout), ou **depois** de responder (um status de erro, ou um `200` que não vale nada). Esta lição usa nove tipos, que cobrem o essencial do que os provedores devolvem (ficam de fora, por exemplo, redirecionamentos, o 409 e erros no meio de uma resposta em *streaming*). Os nomes são **desta lição** (cada provedor tem os seus códigos), mas as perguntas que eles respondem são universais: *de quem é o erro?* e *tentar de novo ajuda?*

| Tipo | O que aconteceu | Tentar de novo? |
|---|---|---|
| `rede` | conexão recusada, derrubada ou sem rota: nenhuma resposta HTTP chegou | sim |
| `timeout` | estourou o tempo máximo sem resposta completa | sim (com limite) |
| `limite_de_taxa` | HTTP 429 porque você pediu rápido demais | sim, **esperando** |
| `servidor` | HTTP 5xx (e 408): falha ou sobrecarga do provedor | sim |
| `cota_esgotada` | HTTP 429 de **cota, crédito ou limite de gasto** | **não**: esperar não resolve |
| `autenticacao` | HTTP 401 ou 403: chave errada, revogada ou sem permissão | **não** |
| `requisicao_invalida` | qualquer outro 4xx (400, 404, 413, 422...): o pedido está errado | **não**: o mesmo pedido falha igual |
| `truncado` | HTTP 200 com `finish_reason: "length"`: a resposta foi cortada | **não** sem mudar o pedido (veja a Lição 1) |
| `resposta_invalida` | HTTP 200 cujo corpo não é o JSON de chat esperado (uma página de proxy, por exemplo) | **não**, nesta lição (decisão de projeto: repetir pode pagar de novo pela mesma falha) |

Duas coisas para guardar:

1. **O 429 tem duas caras.** A documentação da OpenAI separa o 429 de ritmo ("*Rate limit reached for requests*", "*Slow down*": siga o `Retry-After`) dos de **cobrança** (`credit_balance_exhausted`, limites de gasto da organização e do projeto, de uso...), e diz que repetir erros de cobrança, gasto ou cota não adianta. A da Anthropic descreve um 429 de teto de gasto cujo `error.type` é o **mesmo** de um limite de taxa (`rate_limit_error`), que **não traz `retry-after`** e que continua falhando, inclusive com as retentativas automáticas do SDK, até o acesso voltar; o que o distingue é o campo `error.details.error_code` (`enforced_spend_limit_reached`) e a falta do cabeçalho. (Um limite de gasto que **você** configurou volta como 400, não como 429.) Um cliente que trata todo 429 como "espere e repita" gira em falso quando o problema é a conta. Por isso a lição separa `limite_de_taxa` de `cota_esgotada`, mas **o critério muda por provedor**: na OpenAI, o `code` e o `type` do corpo do erro; na Anthropic, o `error.details.error_code`. Esse mapeamento é o "trecho pequeno e isolado" da seção 4.6: confira o do seu provedor.
2. **Um `200` também pode ser falha.** Texto cortado (`truncado`) e corpo que não é o JSON esperado (`resposta_invalida`) chegam com status de sucesso. Quem só olha o status acredita nelas.

### 4.2 Quando tentar de novo (e quando isso piora tudo)

Repetir é a resposta certa para falhas **transitórias** (rede, sobrecarga, ritmo). Mas retry é carga extra, e carga extra num servidor que já está sobrecarregado é o jeito clássico de transformar um problema pequeno num grande. O capítulo sobre falhas em cascata do livro de SRE do Google mostra um frontend que tenta de novo, sem critério, contra um backend sobrecarregado: as retentativas somam-se ao tráfego normal e podem derrubar o backend. As recomendações dele, que viram regras do nosso cliente:

- **limite as tentativas por pedido** (nunca "até dar certo");
- **use backoff exponencial *randomizado*** (com sorteio), para que as tentativas não voltem todas juntas;
- considere um **orçamento de retentativas** no processo inteiro (o livro dá como exemplo 60 por minuto: estourou, falha direto, em vez de empilhar carga).

Mais três cuidados que não são de nenhum provedor em particular:

- **Retry custa dinheiro e tempo.** Quando um `timeout` estoura, você **não sabe** se o servidor terminou o trabalho depois que você desistiu: a tentativa seguinte pode pagar duas vezes pela mesma resposta. Por isso o número de tentativas é pequeno e o resultado informa quantas foram feitas.
- **Retry em cima de retry multiplica.** Os SDKs oficiais costumam repetir sozinhos (a documentação da Anthropic diz que o SDK repete falhas transitórias com backoff, duas vezes por padrão, respeitando o `retry-after`). Se o seu código faz até 3 tentativas e o SDK por baixo também faz até 3 tentativas por chamada (a primeira e duas repetições), uma chamada lógica vira até **9** requisições. Saiba o que o seu SDK faz antes de acrescentar o seu (o [`comum_py/llm.py`](../../../modulos/01-fundamentos-ia-llms/comum_py/llm.py) do módulo 1 desliga o retry do SDK de propósito: o Ollama local é uma fila compartilhada e "um retry só dobraria a fila").
- **Nem toda espera é sua para escolher.** O `Retry-After` do servidor manda; veja a seção 4.3.

### 4.3 Esperar e desistir: Retry-After, backoff, jitter e timeouts

**`Retry-After`.** É um cabeçalho de resposta que diz quanto esperar. Segundo a especificação (RFC 9110), vale um **número de segundos** ou uma **data HTTP**; a MDN lembra que aparece em `429`, em `503` e em redirecionamentos. Regras do nosso cliente:

- se vier, **espere pelo menos isso** (a documentação da OpenAI diz exatamente isto);
- se **não** vier, use backoff exponencial com *jitter* e limite as tentativas (idem);
- **não confie cegamente nele**: um `Retry-After: 3600` não pode pendurar o seu processo por uma hora. O cliente tem um teto (`ESPERA_MAX_MS`): acima dele, **desiste** e devolve o erro original (num 429 de ritmo, `limite_de_taxa`), para quem chamou decidir (agendar, enfileirar, avisar);
- e lembre que, se muitos clientes receberem o **mesmo** `Retry-After`, todos voltam juntos: somar a ele um pequeno sorteio espalha as voltas (a referência espera exatamente o pedido; o verificador aceita as duas formas, porque o texto da lição diz "pelo menos").

**Backoff exponencial com jitter.** Sem `Retry-After`, a espera antes da tentativa seguinte cresce a cada falha. Com `n` = o número da tentativa que acabou de falhar:

```
limite = min(teto, base × 2^(n − 1))
espera = sorteio entre 0 e limite        ← "full jitter"
```

Sem o sorteio, todos os clientes que falharam juntos voltam juntos, em rajadas idênticas (o livro de SRE chama isso de ondas de retentativa que se amplificam). O blog de arquitetura da AWS, que deu o nome *Full Jitter* a este esquema, simulou clientes disputando um recurso: com 100 clientes, o jitter reduziu o número de chamadas em mais da metade e melhorou o tempo até todos terminarem, comparado ao backoff exponencial sem jitter; e o *Equal Jitter* fez um pouco mais de trabalho e levou bem mais tempo que o *Full*. O [exemplo 3](#6-exemplos-práticos) simula isso (um brinquedo: mostra a forma do problema, não números de produção).

**Timeout: por tentativa e para a tentativa inteira.** Sem timeout, uma chamada pode pendurar o seu programa. Dois detalhes que pegam gente experiente:

- O `fetch` do Node não tem um timeout total por padrão. O cliente HTTP por baixo dele (o undici) documenta `headersTimeout` e `bodyTimeout` de 300 segundos por padrão, e o `bodyTimeout` mede o tempo **entre pedaços consecutivos** do corpo: um servidor que manda um byte a cada segundo nunca o estoura. Para um prazo **total** use `AbortSignal.timeout(ms)`, que aborta com um `TimeoutError` e cobre conexão, cabeçalhos **e** corpo ([exemplo 2](#6-exemplos-práticos)).
- Em Python, o `timeout` de `http.client` e `urllib` vale **por operação de rede bloqueante** (conectar, cada leitura), não para a tentativa. Para um prazo total sobre o **corpo**, confira um prazo a cada leitura (é o que faz [`referencia/chamar.py`](referencia/chamar.py)). Limite dessa referência: cabeçalhos que chegam em conta-gotas não são cobertos (a leitura do status e dos cabeçalhos usa um único `timeout` por operação); cobri-los pediria um cronômetro à parte que fechasse o socket no prazo.

O tempo máximo de uma chamada, no pior caso, é a soma das tentativas e das esperas: com `TIMEOUT_MS` de 10 s, 3 tentativas e esperas de 1 s e 2 s, o usuário pode esperar `10 + 1 + 10 + 2 + 10 = 33 s` antes de ver um erro. Se o provedor mandar `Retry-After`, cada espera pode chegar a `ESPERA_MAX_MS`: com os valores padrão do laboratório (30 s de timeout, 3 tentativas, até 60 s de espera) o pior caso sem `Retry-After` é de 91,5 s (`3 × 30 + 0,5 + 1`) e, com ele, chega a 210 s (`3 × 30 + 2 × 60`: três tentativas que demoram quase o timeout e duas esperas no teto). Faça essa conta **antes** de escolher os números.

### 4.4 O contrato do laboratório

Para que o verificador teste o seu cliente **em qualquer linguagem**, o laboratório define um contrato de linha de comando (detalhes na seção 8 e em [`kit/contrato.mjs`](kit/contrato.mjs)): o programa recebe o prompt, lê a configuração de variáveis de ambiente, faz a chamada com tudo o que esta seção ensinou e imprime **uma linha JSON**:

```json
{"ok": true, "texto": "Olá", "finish_reason": "stop", "usage": {"prompt_tokens": 14, "completion_tokens": 2, "total_tokens": 16}, "tentativas": 3}
{"ok": false, "erro": {"tipo": "limite_de_taxa", "repetivel": true, "status": 429, "mensagem": "HTTP 429: ..."}, "tentativas": 3}
```

O contrato força as boas práticas: `tentativas` tem de bater com o que o servidor viu; `tipo` e `repetivel` têm de ser coerentes; a chave nunca aparece na saída (alguns provedores repetem **trechos da chave recebida** na mensagem de um 401; o servidor falso do kit repete a chave **inteira**, para o teste ser mais exigente).

Detalhes do formato que o verificador confere: `status` é o número HTTP **ou `null`** quando não houve resposta HTTP (`rede` e `timeout`); em `truncado` e `resposta_invalida` o status é 200 (ou `null`); `tentativas` conta as requisições feitas (a primeira inclusive). Em TypeScript, cuidado com `status?: number`: um campo `undefined` some do JSON, e o verificador exige o campo.

### 4.5 TypeScript no Node: o que ele faz e o que não faz

O TypeScript acrescenta **tipos** ao JavaScript, que o compilador confere antes de o código rodar. O Node passou a **executar `.ts` diretamente**, mas de um jeito específico (a página *Modules: TypeScript* da documentação do Node, aberta em 2026-10-20, descreve):

- o suporte é de ***type stripping***: o Node **apaga** a sintaxe de tipos (trocando-a por espaços) e executa o JavaScript que sobra. **Ele não confere os tipos.** Um erro de tipo só aparece se você rodar o compilador (`tsc`);
- só funciona com **sintaxe "apagável"**. Recursos que exigem gerar código novo dão erro: `enum`, `namespace` com código, *parameter properties* (`constructor(public x: number)`) e alias de importação. Experimente: `enum Cor { A }` num `.ts` dá `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`;
- importar um **tipo** exige a palavra `type` (`import type { Resposta } from './x.ts'`), senão o Node tenta importá-lo como valor e dá erro em tempo de execução;
- o `tsconfig.json` **não** muda o que o Node executa; o Node recusa `.ts` dentro de `node_modules`;
- versões: habilitado por padrão desde o Node 22.18 (e 23.6) e sem aviso de "experimental" desde o 22.18 e 24.3; marcado como **estável** na documentação desde o 24.12 (e 25.2). Na máquina de quem escreveu esta lição, o Node era o 22.22.0.

Para **conferir** os tipos, use o `tsc` com uma configuração que combine com o Node. O [`kit/tsconfig.json`](kit/tsconfig.json) segue a recomendação da documentação (sem a opção `rewriteRelativeImportExtensions`, que só importa se você importar `.ts` de outros arquivos; `erasableSyntaxOnly` exige TypeScript 5.8 ou superior, e é ele que acusa `enum` e *parameter properties* antes de o Node acusar). Ele usa `module: nodenext`, que só trata o seu `.ts` como módulo ES se houver um `package.json` com `"type": "module"` na pasta: é por isso que o laboratório pede esse arquivo (o Node 22.22 executa o `.ts` mesmo sem ele; o `tsc` é que precisa):

```bash
npm install --save-dev typescript @types/node      # na sua pasta de entrega (opcional; o verificador não precisa)
npx tsc -p tsconfig.json                           # copie o kit/tsconfig.json para a pasta; sem saída = tipos conferem
```

Dois padrões que você vai usar no laboratório (o [exemplo 1](#6-exemplos-práticos) roda os dois):

- **União discriminada.** Em vez de "um objeto com `erro?` opcional", declare formas fechadas: `{ ok: true; texto: string } | { ok: false; erro: {...} }`. O compilador estreita o tipo depois de você testar `ok`. A seção *Narrowing* do handbook do TypeScript explica o mecanismo.
- **Verificação de exaustividade.** Num `switch` sobre o `tipo` do erro, o `default` recebe um valor do tipo `never`. Se alguém acrescentar um tipo novo e esquecer de tratá-lo, o `tsc` acusa aquela linha (o handbook chama de *exhaustiveness checking*).

E o limite que mais engana: **os tipos não validam dados de fora.** `JSON.parse(texto) as Resultado` é uma *promessa sua* ao compilador; se o JSON que veio da rede tiver outra forma, o programa roda do mesmo jeito (o exemplo 1 mostra `usar o texto: undefined`). Dados de fora precisam de **verificação em tempo de execução** (a etapa 3 volta nisso com schemas).

**Se você faz o laboratório em Python ou em JavaScript.** O TypeScript é ensinado a todos, mas o laboratório aceita qualquer linguagem. Em Python, o equivalente é modelar o tipo do erro com `Literal[...]` ou `Enum` e tratar cada caso com `typing.assert_never` (Python 3.11 ou superior), conferido por um verificador de tipos como o mypy ou o pyright; o interpretador, como o Node, **não** confere as anotações. Em JavaScript puro, uma classe de erro com uma lista fixa de tipos e comentários JSDoc fazem o papel (e a rubrica R2 aceita qualquer um dos três).

### 4.6 O que é durável e o que é específico de fornecedor

| Durável (vale para qualquer provedor) | Específico de fornecedor ou ferramenta (verificado em 2026-10-20) |
|---|---|
| Semântica dos status: 4xx = o pedido (ou a conta) está errado; 5xx = o servidor; 429 = você, mas pode ser ritmo **ou** cota | **quais** códigos e tipos existem: a OpenAI distingue vários 429 (`credit_balance_exhausted`, limites de gasto...) e tem o 503 `server_is_overloaded`; a Anthropic usa `rate_limit_error`, `overloaded_error` (529), `timeout_error` (504), `api_error` (500) e devolve um `request_id` para suporte |
| Retry só do que é transitório, com limite, backoff **randomizado**, e espera que respeita o servidor | o nome do cabeçalho e se ele vem sempre (a Anthropic avisa que um 429 de teto de gasto não traz `retry-after`); os padrões de retry de cada SDK |
| Timeout por tentativa, total; erro tipado em vez de texto solto; erro que **não** carrega segredo | se o corpo do erro repete trechos da chave (alguns provedores o fazem) |
| Configuração por ambiente: URL, chave, modelo, teto de saída, temperatura | o **nome** do campo do teto de saída (`max_tokens` × `max_completion_tokens`, Lição 1) e quais modelos recusam `temperature` |

A regra prática: o que está na coluna da esquerda vira **código**; o que está na da direita vira **configuração** (variável de ambiente) ou um **mapeamento pequeno e isolado** que você troca quando o provedor muda. O CA8 do laboratório testa exatamente isso: o mesmo programa, dois provedores, só variáveis diferentes.

## 5. Material complementar

Leia na ordem; o que está marcado como *opcional* pode esperar. Todos os links foram abertos em 2026-10-20.

| Material | Por que ler |
|---|---|
| [Google · *Site Reliability Engineering* · Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/) | a seção de retentativas: por que retry ingênuo derruba servidores e as regras (limitar por pedido, backoff randomizado, orçamento). Leia só a parte de *Retries* |
| [AWS Architecture Blog · *Exponential Backoff And Jitter*](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) | de onde vêm os nomes *Full*, *Equal* e *Decorrelated Jitter* e a comparação entre eles |
| [MDN · cabeçalho `Retry-After`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After) e [RFC 9110 (HTTP Semantics)](https://www.rfc-editor.org/rfc/rfc9110.html) | os dois formatos (segundos ou data) e em que respostas aparece. Na RFC, procure `Retry-After` |
| [Node.js · *Modules: TypeScript*](https://nodejs.org/api/typescript.html) | o que o *type stripping* aceita e recusa, as versões e o `tsconfig` recomendado |
| [TypeScript Handbook · *Narrowing*](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) | uniões discriminadas e verificação de exaustividade com `never` |
| [MDN · `AbortSignal.timeout()`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) | o timeout total do `fetch` e o `TimeoutError` |
| [OpenAI · *Error codes*](https://platform.openai.com/docs/guides/error-codes) e [Anthropic · *Errors*](https://platform.claude.com/docs/en/api/errors) | os códigos de dois provedores lado a lado: veja o quanto mudam os nomes e o quanto se repete a lógica. São de fornecedores: use para entender, não como regra geral |
| [undici · opções do `Client`](https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md) | *opcional*: `headersTimeout`, `bodyTimeout` e `connectTimeout`, os padrões por baixo do `fetch` |
| [Python · `http.client`](https://docs.python.org/3/library/http.client.html) | *opcional*: o que o parâmetro `timeout` realmente cobre |
| [M02 · exercício 01 (validação e retry)](../../../modulos/02-apis-ia-generativa/exercicios/01-chain-com-validacao-e-retry/enunciado.md) | o mesmo assunto, com o SDK e o LLM local do repositório |

## 6. Exemplos práticos

### Exemplo 1 · Tipos de erro que o compilador confere

[`exemplos/erro-tipado.ts`](exemplos/erro-tipado.ts) modela o resultado de uma chamada como união discriminada, trata cada tipo de erro num `switch` com verificação de exaustividade e termina com a armadilha do `as`. Rode (Node 22.18+):

```bash
node academia/licoes/02-apis-erros-e-integracao/exemplos/erro-tipado.ts
```

Saída real:

```text
usar o texto: Olá
esperar o Retry-After e tentar de novo
parar e avisar: acabou o crédito (esperar não resolve)
usar o texto: undefined
```

A última linha é o ponto: o `JSON.parse(...) as Resultado` enganou o compilador (e a lição). Depois faça os experimentos listados no fim do arquivo: acrescentar `'truncado'` ao tipo **não muda nada para o `node`** e faz o `tsc` acusar o `switch` (confirmei com o TypeScript 5.9.3: `Argument of type '"truncado"' is not assignable to parameter of type 'never'`). Com um erro de digitação num dos objetos, o `tsc` reclama na hora e o `node` só quebra quando chega nesse objeto (experimento b do arquivo).

### Exemplo 2 · Um timeout que vale para a tentativa inteira

[`exemplos/timeout-do-fetch.mjs`](exemplos/timeout-do-fetch.mjs) liga o servidor falso do kit (em `127.0.0.1`, nenhum LLM) e mede três chamadas. Saída real (os milissegundos mudam um pouco a cada execução):

```text
servidor lento (3 s), SEM timeout próprio                  →  3096 ms · HTTP 200, corpo de 225 caracteres
servidor lento (3 s), AbortSignal.timeout(400)             →   404 ms · TimeoutError: The operation was aborted due to timeout
corpo em conta-gotas (4 s), AbortSignal.timeout(400)       →   410 ms · TimeoutError: The operation was aborted due to timeout
```

Sem o sinal, o `fetch` esperaria o quanto o servidor quisesse. Na terceira linha o cabeçalho chegou na hora e o corpo vinha em conta-gotas: o `AbortSignal.timeout` corta mesmo assim, porque cobre a tentativa inteira.

### Exemplo 3 · Por que o backoff precisa de sorteio

[`exemplos/backoff-simulado.mjs`](exemplos/backoff-simulado.mjs) simula, offline e com semente fixa, 200 clientes que falham ao mesmo tempo contra um servidor que atende 20 pedidos por janela de 100 ms. Saída real:

```text
estratégia   | pedidos enviados | maior rajada de retentativas | janelas com servidor ocioso | tempo até todos terminarem
-------------|------------------|------------------------------|-----------------------------|---------------------------
sem-espera   |             1100 |                          180 |                           0 |                    1000 ms
exponencial  |             1100 |                          180 |                         371 |                   38100 ms
full-jitter  |              498 |                           54 |                          15 |                    2100 ms
```

Leia com cuidado (o arquivo avisa): no brinquedo, **sem espera** termina primeiro porque o servidor nunca fica ocioso e a recusa é de graça. Na vida real cada recusa é um pedido que o servidor teve de receber, e retentativas sem espera são o que derruba um servidor sobrecarregado (seção 4.2). O que o exemplo mostra é o outro par: o backoff **sem sorteio** deixa o servidor ocioso (371 janelas) e demora 38 s, porque quem falhou junto volta junto; com o sorteio, as voltas se espalham: menos pedidos desperdiçados que sem espera e muito menos tempo ocioso. Rode `... backoff-simulado.mjs 1000 50` e compare.

### Exemplo 4 · O provedor que falha, ligado à mão

[`kit/servidor-falso.mjs`](kit/servidor-falso.mjs) é o mesmo servidor que o verificador usa. Ligue-o num terminal e chame o seu programa em outro, para ver o que ele faz **antes** de rodar o verificador:

```bash
node academia/licoes/02-apis-erros-e-integracao/kit/servidor-falso.mjs --listar          # os 19 cenários
node academia/licoes/02-apis-erros-e-integracao/kit/servidor-falso.mjs --cenario limite-de-taxa --porta 8089
# em outro terminal (bash; no PowerShell use $env:NOME="valor"):
OPENAI_BASE_URL=http://127.0.0.1:8089/v1 OPENAI_API_KEY=abc MODELO_CHAT=teste node chamar.ts "Diga olá"
```

O servidor imprime cada pedido que recebe (com a chave mascarada). No cenário `limite-de-taxa` ele responde `429` com `Retry-After: 1` na primeira vez e `200` na segunda: o seu cliente precisa esperar cerca de 1 s entre os dois.

## 7. Quiz de fixação

Responda **de memória, antes de abrir o [gabarito](gabarito.md)**. Registre as respostas (e quão confiante você
estava: baixa, média ou alta) em `academia/alunos/<aluno>/entregas/etapa-02/quiz.md`. O gabarito traz a correção
comentada de cada alternativa.

**Q1.** Qual destas falhas **vale a pena repetir** automaticamente?
A) `503` com "modelo sobrecarregado". B) `401` com "chave inválida". C) `429` com o código `insufficient_quota`. D) `400` dizendo que o campo `messages` é inválido.

**Q2.** Seu cliente recebe `429`, sem `Retry-After`, e o corpo diz `{"error": {"code": "insufficient_quota"}}`. O melhor comportamento é:
A) Aplicar backoff exponencial, com sorteio, até a chamada dar certo. B) Esperar 60 s e repetir uma vez, para dar tempo de o limite se renovar. C) Repetir na hora, mais rápido, antes que o limite seja reavaliado. D) Não repetir: devolver um erro claro, porque é a conta ou a cota que precisa de atenção.

**Q3.** `MAX_TENTATIVAS = 4`, backoff exponencial com base de 500 ms, **sem** jitter e **sem** teto. Quanto tempo o cliente passa **esperando** entre as tentativas, no total (sem contar o tempo das chamadas)?
A) 1,5 s. B) 4 s. C) 3,5 s. D) 7,5 s.

**Q4.** `TIMEOUT_MS = 10000`, 3 tentativas, esperas de 1 s e depois 2 s entre elas, e o servidor **nunca** responde. Em quanto tempo o usuário vê o erro final? Mostre a conta.

**Q5.** O servidor responde `429` com `Retry-After: 120`, e o seu cliente tem backoff de 500 ms. O que está errado, e qual é o comportamento certo?
A) Nada: o backoff do cliente já é mais esperto que o servidor e a chamada termina antes. B) O cliente deve esperar **pelo menos** 120 s (se esse tempo for aceitável para a aplicação) e, se não for, desistir em vez de insistir. C) O cliente deve ignorar o cabeçalho e repetir em 5 s, para não deixar o usuário esperando tanto. D) O cliente deve repetir 120 vezes por segundo até o servidor responder.

**Q6.** Por que usar o `fetch` do Node **sem** `signal` é arriscado, e o que o `AbortSignal.timeout(ms)` cobre?
A) Sem sinal, o `fetch` pode esperar minutos (os padrões do undici são de 300 s e o do corpo mede só a inatividade); o `AbortSignal.timeout` cobre conexão, cabeçalhos **e** corpo. B) O `fetch` já tem um timeout de 30 s, que cobre a tentativa inteira; o `AbortSignal.timeout` serve só para mudar esse valor. C) O `AbortSignal.timeout` só vale para a conexão: depois que os cabeçalhos chegam, o corpo pode demorar à vontade. D) Timeouts não existem em HTTP, e por isso nenhum cliente consegue limitar o tempo de uma chamada.

**Q7.** Você roda `node exemplo.ts` com a linha `enum Cor { Vermelho, Azul }` no Node 22.22. O que acontece?
A) Roda normalmente: o Node compila o TypeScript antes de executar. B) Roda, mas imprime um aviso de que `enum` é um recurso experimental. C) Dá erro (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`): o Node só **apaga** os tipos, e `enum` exige gerar código novo. D) O Node confere os tipos e só então roda, recusando o arquivo se houver um erro de tipo.

**Q8.** Verdadeiro ou falso, com uma frase de justificativa: "Se o meu tipo `Resultado` diz que existe o campo `texto`, então o JSON que chegou do servidor tem o campo `texto`."

**Q9.** Seu cliente faz até 3 tentativas por chamada, e o SDK que você usa por baixo também faz até 3 tentativas por chamada (a primeira e duas repetições). No pior caso, quantas requisições o provedor recebe por chamada lógica sua, e por que isso importa?

**Q10.** Você vai trocar o provedor da sua aplicação por outro que exige `max_completion_tokens` e recusa `temperature`. Qual é a abordagem certa?
A) Espalhar `if (provedor === ...)` pelo código, um para cada diferença que aparecer. B) Manter um repositório por provedor, copiando a política de retry e de timeout para cada um. C) Usar sempre o SDK do provedor e não se preocupar mais com isso, porque ele já cuida de tudo. D) Tirar do código a URL, a chave, o modelo, o nome do campo do teto de saída e a temperatura (que pode ser "omitir"), lendo tudo do ambiente, e isolar num lugar só o mapeamento dos erros daquele provedor.

> Q7 e Q8 são sobre TypeScript no Node; quem faz o laboratório em Python ou em JavaScript também as responde (a lição ensina o TypeScript a todos).

## 8. Desafio hands-on

### Cliente de LLM robusto

Escreva **você mesmo** um programa `chamar.*` (a referência é [`chamar.ts`](referencia/chamar.ts), em TypeScript; [`chamar.py`](referencia/chamar.py) mostra o mesmo em Python; `chamar.mjs` e `chamar.js` também valem) que faz **uma** chamada a um endpoint de chat e é **robusto contra falhas**. O verificador executa o seu programa contra um [servidor falso](kit/servidor-falso.mjs) que falha de propósito e confere o que o servidor viu e o que o programa disse.

**Como o programa é chamado:** `<executor> chamar.<ext> "<prompt>"`, com estas variáveis de ambiente (contrato completo em [`kit/contrato.mjs`](kit/contrato.mjs)):

| Variável | Significado | Padrão |
|---|---|---|
| `OPENAI_BASE_URL` | termina em `/v1`; o programa acrescenta `/chat/completions` | (obrigatória) |
| `OPENAI_API_KEY` | vai em `Authorization: Bearer <chave>` e **nunca** na saída | (obrigatória) |
| `MODELO_CHAT` | nome do modelo | (obrigatória) |
| `PARAM_MAX_TOKENS` | nome do campo do teto de saída no corpo | `max_tokens` |
| `MAX_TOKENS` | valor do teto de saída | `64` |
| `TEMPERATURA` | número, ou `omitir` para **não enviar** o campo | `0` |
| `TIMEOUT_MS` | tempo máximo de **cada tentativa** (conexão até o fim do corpo) | `30000` |
| `MAX_TENTATIVAS` | total de tentativas, **contando a primeira** | `3` |
| `BACKOFF_BASE_MS` / `BACKOFF_TETO_MS` | base e teto da espera exponencial (com sorteio) | `500` / `8000` |
| `ESPERA_MAX_MS` | se o `Retry-After` pedir mais que isto, **desista** | `60000` |

**O que ele imprime:** exatamente **uma linha JSON** no stdout (logs vão para o stderr) com o formato da seção 4.4, e termina com código `0` (sucesso), `1` (falha da chamada) ou `2` (uso ou configuração inválida, sem JSON). Os nove valores de `erro.tipo` são os da seção 4.1.

**O que o verificador faz** (cenários do servidor falso; rode `kit/servidor-falso.mjs --listar` para ver todos):

| Cenário | O servidor... | O que o seu programa deve fazer |
|---|---|---|
| `sucesso` | responde 200 | pedido certo (rota, chave, modelo, mensagem, teto, temperatura) e resultado com `usage` (CA2) |
| `chave-invalida`, `requisicao-invalida`, `cota-esgotada`, `truncado`, `html-no-lugar-de-json`, `json-sem-choices` | falha **sem** chance de dar certo | o tipo certo e **uma só** requisição (CA3, CA4); no 401 a chave **não** pode aparecer na saída (CA7) |
| `servidor-instavel` (500, 503, depois 200) | falha duas vezes e responde | sucesso na 3ª tentativa, com esperas dentro do backoff (CA4, CA5) |
| `sempre-503`, `sempre-429`, `derruba-conexao`, porta fechada | falha para sempre | para **exatamente** em `MAX_TENTATIVAS`, com o tipo certo (CA3, CA4) |
| `limite-de-taxa` | `429` com `Retry-After: 1`, depois 200 | esperar ao menos ~1 s (CA5) |
| `retry-after-gigante` | `429` com `Retry-After: 3600` | **desistir na hora** como `limite_de_taxa` (CA5) |
| `lento`, `devagar` | demora 3 s / 150 ms | `timeout` por tentativa; **não** matar o que é só devagar (CA6) |
| `provedor-b` | recusa `max_tokens` e `temperature` | funcionar só trocando variáveis (CA8) |

**Onde guardar.** Tudo em `academia/alunos/<aluno>/entregas/etapa-02/` (crie a pasta). Para TypeScript, crie nela também um `package.json` com `{ "type": "module" }`:

```bash
node academia/licoes/02-apis-erros-e-integracao/verificar.mjs academia/alunos/<aluno>/entregas/etapa-02
node academia/licoes/02-apis-erros-e-integracao/verificar.mjs academia/alunos/<aluno>/entregas/etapa-02 --so CA5,CA6   # só estes critérios (rápido para iterar)
# escreva o relatorio.md na mesma pasta (modelo na seção 12)
```

Uma verificação completa leva de 15 a 25 segundos (são cerca de 28 execuções do seu programa). O verificador procura `chamar.ts`, `chamar.mjs`, `chamar.js` ou `chamar.py` (nesta ordem), usa o Node (ou o Python 3 que achar: `python3`, `python` ou `py -3`) e roda o seu programa com um ambiente **mínimo** (sem as suas chaves de verdade) falando só com servidores em `127.0.0.1`. Outro executor: `--comando "uv run python"` (caminho com espaço vai entre aspas duplas); com dois programas na pasta (por exemplo `chamar.ts` e `chamar.py`), diga qual verificar com `--arquivo chamar.py`. Para o Python, o verificador força o stdout em UTF-8 (`PYTHONUTF8=1`); prefira o JSON com escapes ASCII (o padrão do `json.dumps`).

**Cuidado: o verificador EXECUTA o programa.** "Ambiente mínimo" não é um *sandbox*: o programa roda com os seus privilégios, lê os seus arquivos e pode acessar a internet. Rode-o só em código que você escreveu ou revisou, inclusive quando for revisar a entrega de outra pessoa. Numa verificação completa o verificador também imprime **avisos** (não reprovam): por exemplo, se o seu programa só entende `Retry-After` em segundos e não em data, ou se o seu timeout parece valer só por inatividade (veja a Dica 4 e a seção 4.3).

**O que o verificador é (e o que não é).** Ele prova **comportamento diante de falhas simuladas**. Não prova que o código é bom, que os tipos de TypeScript estão certos (o Node os apaga sem conferir: use o `tsc`, seção 4.5), nem que há *jitter* no backoff (o sorteio não é verificável com segurança numa execução curta: ele confere que as esperas respeitam o teto e que existe espera). Essas partes são da rubrica (R2 e R3). E ele não substitui um provedor de verdade: um provedor real tem mais códigos, mais cabeçalhos e comportamentos que o servidor falso não imita.

**Extensões opcionais** (`opcional`, 20 XP cada, não bloqueiam a etapa; ids `E02-opcional-1` a `E02-opcional-3`): (a) rodar o **mesmo** programa contra o endpoint de verdade (Ollama do repositório ou um provedor) e registrar `usage`, `tentativas` e a latência, comparando com o servidor falso; (b) acrescentar um **orçamento de retentativas** para o processo inteiro (por exemplo, no máximo 10 retentativas por minuto somando todas as chamadas), com teste; (c) escrever o cliente numa **segunda linguagem** que passe no mesmo verificador. Ideia extra (sem XP): fazer o programa devolver também o `request_id` do erro, quando o provedor mandar um.

## 9. Critérios de aceitação

O comando `verificar.mjs` confere os critérios CA1 a CA9. Todos precisam passar para o laboratório valer `E02-lab`.

| ID | Critério (objetivo) |
|---|---|
| CA1 | **Protocolo.** Em todas as execuções: uma única linha JSON no stdout, com o formato da seção 4.4 (`ok`, `tentativas` ≥ 1, `texto`/`finish_reason`/`usage` ou `erro` com `tipo` válido, `repetivel` booleano, `status` e `mensagem`) e código de saída 0 (ok) ou 1 (falha) |
| CA2 | **Requisição e sucesso.** `POST` em `<OPENAI_BASE_URL>/chat/completions`, com `Authorization: Bearer <chave>`, `Content-Type` JSON, `model`, `messages` = só o prompt do usuário, `max_tokens` = 64 e `temperature` = 0 quando nada foi configurado, sem streaming; devolve `texto`, `finish_reason` e `usage` do servidor, com `tentativas` = 1 |
| CA3 | **Taxonomia.** 401 → `autenticacao`; 400 → `requisicao_invalida`; 429 de cota → `cota_esgotada`; 200 com `length` → `truncado`; 200 com HTML ou sem `choices` → `resposta_invalida`; 503 e 429 de taxa persistentes → `servidor` e `limite_de_taxa`; resposta atrasada → `timeout`; conexão derrubada ou recusada → `rede`. `repetivel` coerente com o tipo e `status` HTTP correto |
| CA4 | **Tentativas seletivas.** Nos seis casos que não se resolvem sozinhos, o servidor vê **1** pedido; nos persistentes, **exatamente** `MAX_TENTATIVAS` (3, 2 e 1); em 500 → 503 → 200 termina com sucesso na 3ª; `tentativas` informado = pedidos vistos pelo servidor |
| CA5 | **Esperas.** Com `Retry-After: 1` espera pelo menos ~0,9 s; com `Retry-After: 3600` e `ESPERA_MAX_MS` pequeno desiste na hora (1 pedido, `limite_de_taxa`); as esperas do backoff não passam de `BACKOFF_BASE_MS × 2^(n−1)` (nem do teto) e existem de fato |
| CA6 | **Timeout.** Servidor que demora 3 s com `TIMEOUT_MS` de 1000: erro `timeout` por tentativa, repetido até o limite, sem esperar os 3 s (o tempo é medido a partir do 1º pedido que o servidor viu, não da partida do seu programa); servidor que demora 150 ms com `TIMEOUT_MS` de 4000 dá sucesso |
| CA7 | **Segredos.** A chave **nunca** aparece no stdout nem no stderr (nem na mensagem de um 401 que a repete) e não há segredo no código-fonte |
| CA8 | **Provedor por configuração.** O mesmo programa funciona num provedor que exige `max_completion_tokens` e recusa `max_tokens` e `temperature`, só com variáveis de ambiente; `MODELO_CHAT`, `MAX_TOKENS`, `TEMPERATURA` e a chave vêm do ambiente |
| CA9 | `relatorio.md` com as seções Resultados (≥ 120 letras ou números), Explicação (≥ 320) e Surpresas e limites (≥ 120), escritas por você (os comentários do modelo não contam), sem segredos |

**XP desta lição.**
- `E02-quiz` mede **participação comprovada**, não nota: respostas registradas **antes** do gabarito, com a confiança de cada uma, e a correção comentada revisada (anote, para cada erro, o que você pensou e por que estava errado). O acerto aparece na **competência**, não no XP.
- `E02-lab`: CA1 a CA9 passando.
- `E02-explicacao`: a seção Explicação do relatório, escrita sem consulta e aprovada pela rubrica (R1 ≥ 2).

## 10. Rubrica de avaliação

A rubrica é aplicada pelo assistente (ou pelo outro aluno, como revisor) sobre `relatorio.md`, o código e o quiz. Escala 0 a 3
(veja [níveis](../../competencias.md#níveis-de-domínio)). **O XP de quiz e de laboratório não depende da rubrica; o de
explicação exige R1 ≥ 2; a competência depende sempre dela.**

| Critério | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| **R1 · Precisão conceitual** (C04) | ausente, ou sem relação com falhas e retry | tenta explicar, mas com um erro central ("todo erro se repete"; "todo 429 é só esperar"; "timeout é só do fetch") | corretos, com palavras próprias: separa o que se resolve sozinho do que não; distingue 429 de ritmo e de cota; explica que retry custa e pode multiplicar, e que o timeout vale por tentativa **e** para a tentativa inteira | corretos e antecipa um caso novo (um SDK que também repete, um job em lote, um provedor com outros códigos) |
| **R2 · Modelagem do erro e dos tipos** (C04) | erros como texto solto | classe ou tipo de erro, mas com `string` livre ou campos opcionais soltos | tipo **fechado** para o erro e o resultado (em TypeScript, uma união discriminada; em Python, `Literal` ou `Enum`; em JavaScript, classe com lista fixa de tipos) e tratamento que cobre cada caso | verificação de exaustividade que o compilador (ou um teste) faz valer, e distingue o que o tipo garante do que só a verificação em tempo de execução garante |
| **R3 · Política de espera justificada** (C04) | espera fixa ou nenhuma, sem justificar | backoff exponencial sem sorteio, ou sem teto, ou sem respeitar o `Retry-After` | backoff com **jitter**, teto, `Retry-After` respeitado e **limite** em `ESPERA_MAX_MS`, cada escolha explicada | calcula o pior caso de latência e de requisições da sua configuração e discute um orçamento de retentativas e o efeito de rajadas sincronizadas (a simulação do exemplo 3) |
| **R4 · Fronteira fornecedor × fundamentos e honestidade** (C05) | tudo misturado no código | separa a configuração, mas deixa nomes de provedor no código | explica o que é configuração e o que é código, mostra a evidência do CA8 e aponta os limites do servidor falso | propõe como validar com um provedor de verdade e o que mudaria num segundo provedor real; outra pessoa reproduz sem perguntar e a entrega não contém segredos |

## 11. Dicas graduais

Use uma dica por vez, **só depois de uma tentativa registrada** (anote na seção Tentativas do relatório). A
[solução de referência](referencia/chamar.ts) é o último recurso.

<details>
<summary>Dica 1 · Comece pelo caminho feliz e pelo protocolo</summary>

Faça primeiro só isto: ler as três variáveis obrigatórias, montar o corpo, fazer o POST com o `fetch` (ou `http.client`), ler o JSON e imprimir **uma** linha com `ok: true`. Rode `verificar.mjs --so CA1,CA2` até passar. Só depois pense em falhas. Logs de depuração vão para o `stderr` (`console.error` / `print(..., file=sys.stderr)`): uma linha a mais no stdout reprova o CA1 em todos os cenários.
</details>

<details>
<summary>Dica 2 · Uma função que traduz "o que aconteceu" em um tipo</summary>

Escreva `classificar(status, corpo)` (ou algo equivalente) que recebe o status HTTP e o texto do corpo e devolve um dos nove tipos. Os casos que mais enganam: o `429` precisa olhar o `code` e o `type` do corpo do erro (cota × ritmo); um `200` precisa conferir `finish_reason` e a forma do JSON; falha **sem** resposta HTTP é `rede` (conexão) ou `timeout` (o seu prazo estourou). Crie uma constante com os tipos repetíveis e derive o campo `repetivel` dela, em vez de escrever `true`/`false` à mão em cada lugar.
</details>

<details>
<summary>Dica 3 · O laço de tentativas</summary>

Um `for` de `1` até `MAX_TENTATIVAS`. Dentro: uma função que faz **uma** tentativa e lança o erro tipado; no `catch`, três perguntas **nesta ordem**: o erro é repetível? Ainda há tentativas? A espera pedida é aceitável? Se alguma resposta for "não", relance o erro com `tentativas` preenchido. Cuidado com o limite: `MAX_TENTATIVAS = 3` significa **3 requisições no total**, não 3 repetições.
</details>

<details>
<summary>Dica 4 · Quanto esperar</summary>

Se o erro trouxe `Retry-After`, a espera é **essa** (converta segundos para milissegundos; aceite também uma data HTTP se quiser tirar o aviso do verificador); se pedir mais que `ESPERA_MAX_MS`, não espere: relance o erro. Sem `Retry-After`: `limite = min(teto, base × 2^(n−1))` e a espera é um sorteio entre 0 e `limite` (use `Math.random()` / `random.random()`). Teste a conta no papel com `BACKOFF_BASE_MS = 150`: antes da 2ª tentativa o limite é 150 ms; antes da 3ª, 300 ms.
</details>

<details>
<summary>Dica 5 · O timeout</summary>

No Node, `signal: AbortSignal.timeout(TIMEOUT_MS)` no `fetch` **e** ler o corpo (`await resposta.text()`) dentro do mesmo `try`: o sinal cobre os dois. Quando ele dispara, o erro tem `name === 'TimeoutError'`. Em Python, o `timeout` do `http.client` não basta (é por operação): guarde um prazo (`time.monotonic()`) e confira-o antes de **cada** leitura, usando `read1` para não esperar o buffer encher. Rode o [exemplo 2](exemplos/timeout-do-fetch.mjs) para ver a diferença.
</details>

<details>
<summary>Dica 6 · O verificador reprovou</summary>

Leia a mensagem: ela diz o cenário, o que esperava e o que viu. Causas comuns: CA4 com **uma tentativa a mais** (o laço começa em 0 e vai até `<=`); `tentativas` que não bate com o servidor; CA3 tratando todo `429` como `limite_de_taxa`; CA5 com o teto aplicado também ao `Retry-After` (o teto vale só para o backoff); CA6 com timeout só na conexão; CA7 repassando a mensagem do provedor sem mascarar a chave (uma boa prática é mascarar **duas vezes**: ao montar o erro e de novo na hora de imprimir o JSON final); CA8 com `max_tokens` escrito no código. Use `--so` para repetir só o critério que falhou.
</details>

## 12. Modelo de relatório do aluno

Use [`templates/entrega-laboratorio.md`](../../templates/entrega-laboratorio.md) como base. O `relatorio.md` desta
lição precisa conter, nesta ordem:

- **Resultados**: ambiente (sistema, versão do Node ou do Python), comando, a saída do `verificar.mjs` (cole), **uma tabela de decisões** (cada tipo de erro: repete? por quê?), os números da sua configuração (pior caso de latência e de requisições para os valores padrão) e **uma execução à mão** do seu programa contra o `servidor-falso.mjs` com um cenário à sua escolha (cole o comando e a saída, sem a chave).
- **Critérios de aceitação**: a tabela `CA1`–`CA9` do [modelo](../../templates/entrega-laboratorio.md).
- **Explicação**, escrita **sem consultar o material**, respondendo: (1) por que nem todo `429` se resolve esperando e o que o seu código olha para distinguir? (2) por que o backoff precisa de sorteio e o que a simulação do exemplo 3 mostrou? (3) por que o timeout tem de valer para a tentativa inteira e o que muda de Node para Python? (4) o que, no seu código, faz com que trocar de provedor seja só configuração? (5) o que o TypeScript (ou o tipo que você usou) garantiu e o que ele **não** garantiu? Depois de escrever, confira e anote o que errou.
- **Surpresas e limites**: o que o servidor falso **não** imita de um provedor real; o que você repetiria com um endpoint de verdade; e a sua **calibragem** (seção 15.5): previsões antes, confronto depois.
- **Dúvidas e pendências** e **Tentativas**.

## 13. Competências registradas

Registre os níveis na tabela Competências do [relatório de sessão](../../templates/relatorio-sessao.md).

| Competência | Nível 1 | Nível 2 | Nível 3 |
|---|---|---|---|
| **C04** · integrar um LLM por API com timeout, retry e tratamento de erros | acertou Q1 ou Q5; CA2 aprovado | acertou pelo menos 7 das Q1 a Q9 (incluindo Q1, Q2 e Q5), CA1 e CA3 a CA7 aprovados, explica a política de retry com as suas escolhas (R1, R2 e R3 ≥ 2) | aplica a política a uma API nova (o desafio de transferência da seção 15.3 ou o cliente do time de agentes) e calcula o pior caso e o orçamento de retentativas em contexto novo (revisão ou checkpoint) |
| **C05** · separar fundamentos de fornecedor e trocar de provedor só por configuração | acertou Q10; CA8 aprovado | acertou Q9 e Q10, CA2 e CA8 aprovados com evidência, explica o que é configuração e o que é código (R4 ≥ 2) | troca para um provedor **real** diferente (extensão `opcional` a) registrando só as mudanças de configuração e o que ainda precisou de código |

IDs de atividade desta lição: `E02-quiz` (10 XP), `E02-lab` (30 XP), `E02-explicacao` (15 XP),
`E02-opcional-1..3` (20 XP). Revisões espaçadas: `R02-1`, `R02-2`...

## 14. Referências e última revisão

**Última revisão:** 2026-10-20. Links da seção 5 abertos nessa data (a página de erros da OpenAI respondeu a um navegador comum; a de referência da API da
OpenAI, citada na Lição 1, bloqueia clientes automatizados).

**Fundamentos duráveis:** semântica dos status HTTP e do `Retry-After` (RFC 9110), retry com backoff e jitter e seus riscos (livro de SRE do Google; blog de arquitetura da AWS), timeouts
(MDN, undici, Python), uniões discriminadas e exaustividade (handbook do TypeScript).

**Dependem de ferramenta ou fornecedor (reverificar primeiro):**

1. o suporte a `.ts` do Node (versões em que o *type stripping* ficou padrão, sem aviso e estável) e a recomendação de `tsconfig`;
2. os códigos e tipos de erro de cada provedor (OpenAI, Anthropic) e o que cada um diz sobre repetir ou não;
3. os padrões de retry e timeout dos SDKs oficiais e do undici (300 s);
4. o nome do campo do teto de saída e os modelos que recusam `temperature` (Lição 1);
5. a versão do TypeScript que entende `erasableSyntaxOnly` (5.8 ou superior).

**Limitação desta versão:** o laboratório e o verificador foram testados **só contra o servidor falso** (`licao.lento.mjs`, o teste lento: `node academia/ferramentas/testar.mjs --lentos`; com teste de mutação do verificador: 20 defeitos
injetados na referência, cada um reprovando o critério esperado) e contra as duas referências (TypeScript, no Node 22.22.0 do Windows 11, e Python, na versão 3.12 só com a biblioteca padrão, que o código exige em 3.10 ou superior; o
repositório mira o Python 3.14). A referência em TypeScript também foi conferida à mão com o `tsc` 5.9.3 em modo `strict` e `erasableSyntaxOnly` (isso não faz parte dos testes do repositório,
que não têm dependências). **Nada foi executado contra um LLM ou um provedor real**: a extensão `opcional` (a) é a primeira chance de fazer isso, e deve registrar o modelo e o que o servidor
falso não previu.

## 15. Aplicação, reforço e desafios

### 15.1 Onde isso aparece no trabalho

- **Trabalho em lote durante a noite.** Um job que classifica ou embute dezenas de milhares de documentos bate no limite de taxa. Sem backoff, ele morre na primeira recusa ou martela o provedor
  e piora a situação (seção 4.2); com backoff, jitter e `Retry-After`, ele desacelera e as falhas passageiras se resolvem sozinhas. O que **não** se resolve sozinho (as falhas definitivas depois de `MAX_TENTATIVAS`, um limite global de ritmo) precisa de uma fila de reprocessamento e de um orçamento de retentativas
  (extensão `opcional` b). *Sinal de alerta:* a taxa de erro dispara no mesmo minuto em vários jobs, ou o job "termina" com milhares de falhas silenciosas.
- **Chatbot durante uma instabilidade do provedor.** Três tentativas de 30 s esperando a resposta deixam o usuário olhando para uma tela parada por mais de um minuto. O timeout por tentativa e a conta do pior caso (seção 4.3) decidem se o usuário vê
  um erro útil em segundos. *Sinal de alerta:* a latência do percentil alto salta junto com os chamados de suporte, sem aumento de tráfego.
- **Resposta cortada e tentativa que estourou o tempo custam duas vezes.** O `truncado` (um `200` com `finish_reason: "length"`) é uma resposta que **foi gerada** (e o provedor costuma cobrar os tokens dela); e uma tentativa que estourou o timeout pode ter sido concluída no servidor depois que você desistiu (seção 4.2). Repetir sem ajustar nada paga outra vez pelo mesmo resultado.
  *Sinal de alerta:* os tokens de saída cobrados sobem sem que o número de respostas úteis suba. (Já repetir um `400` ou um `cota_esgotada` não costuma cobrar: o que se perde é tempo, carga e limite de taxa.)
- **Trocar de modelo ou de provedor.** O pedido que funcionava passa a dar `400` porque o novo modelo recusa `max_tokens` ou `temperature` (Lição 1, seção 4.6). Com a configuração separada do código, a correção é uma variável; sem ela, é uma
  alteração no código e um novo deploy. *Sinal de alerta:* um `400` logo depois de uma mudança "só de configuração".
- **Erros comuns:** repetir **tudo**; repetir **sem limite**; esperar um tempo **fixo**; ignorar o `Retry-After` **ou** obedecê-lo cegamente (e pendurar o processo por uma hora); transformar todo erro num texto e perder o status e o tipo; tratar todo `429` igual; escrever
  a chave (ou a mensagem de um 401 que a repete) no log; esquecer o timeout; repetir em cima de um SDK que já repete sozinho; achar que `as Tipo` valida o JSON que chegou.

### 15.2 Reforço (revisão espaçada)

Responda de memória, sem consultar a lição, **nas revisões espaçadas** (`R02-1`, `R02-2`...): fazê-las logo depois de estudar não conta como revisão. A correção comentada está no [gabarito](gabarito.md) (seções "V1" a "V5"); abra-a só depois de responder.

**V1.** Com *full jitter*, base de 200 ms e teto de 1.000 ms: (a) qual é o **maior** valor possível da espera antes da 3ª tentativa? (b) qual é a espera **média** nesse ponto? (c) por que a média não basta para decidir se o tempo total é aceitável?

**V2.** O laço abaixo "funciona" nos testes felizes. Aponte **quatro** defeitos e diga o que você mudaria em cada um.

```js
for (let i = 0; i < 5; i++) {
  try { return await chamarLLM(prompt); }
  catch (e) { await dormir(1000); }
}
```

**V3.** O servidor responde `503` com `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT` e o relógio do seu cliente marca 07:27:40 GMT desse dia. Quanto o cliente deve esperar? E se a data já tiver passado, ou se o valor não for um número nem uma data válida?

**V4.** O provedor responde `200`, mas o corpo é `{"id": "x", "object": "chat.completion"}` (sem `choices`). O que o cliente da lição faz? Qual `tipo` devolve, quantas requisições faz e por quê?

**V5.** Um job noturno faz 50.000 chamadas ao LLM e cerca de 3% falham com `503`. Descreva a política de retentativas que você adotaria e **quatro números** que mediria para saber se ela funciona.

### 15.3 Desafio de transferência

Adapte o cliente para **outra** API HTTP que você use ou conheça (por exemplo, o `POST /embeddings` do mesmo provedor, ou uma API pública de CEP ou de clima), mantendo o contrato de erros desta lição. Copie um cenário do `kit/servidor-falso.mjs` para simular
as falhas da nova rota e prove, com testes seus, os mesmos comportamentos (tipo certo, número de tentativas, `Retry-After`, timeout). É **sem XP**. Critérios: (1) a nova rota e o novo corpo vêm da configuração; (2) pelo menos 5 dos 9 tipos de erro testados contra o servidor falso adaptado; (3) uma frase dizendo
o que **não** mudou entre as duas APIs (a política) e o que mudou (o mapeamento dos erros); (4) comandos para reproduzir. Depois, **ensine a um colega**, em 5 minutos, como funciona o laço de retentativas (quem decide repetir, quanto esperar, quando desistir), e anote onde a pessoa se perdeu.

### 15.4 Ponte com o projeto e com a prática

- **Projeto evolutivo:** esta lição entrega o marco 2. Se você escreveu em TypeScript, copie o seu `chamar.ts` para `academia/alunos/<aluno>/projeto/src/llm/cliente.ts` (a função `chamar` e os tipos já são exportados; a linha de comando fica no fim do arquivo) e ele passa a ser o cliente de todas as etapas seguintes;
  se escreveu em Python ou JavaScript, copie para `projeto/src/llm/cliente.py` ou `cliente.mjs` (o projeto aceita outra linguagem: veja a stack de referência). O critério do marco ("testes com servidor falso cobrem timeout, 429 e 500") é o que o verificador já exercita.
- **Lição 1:** o `truncado` é o `finish_reason: "length"` da Lição 1 visto pelo cliente, e a reserva de saída (somar a entrada estimada com o `MAX_TOKENS` e comparar com a janela **configurada no servidor**) continua sendo sua: use o medidor da Lição 1 para escolher o `MAX_TOKENS` antes de rodar o cliente.
- **Time de agentes** ([projeto P1, Guardião de mudanças](../../extensoes/time-de-agentes/projetos-praticos.md), ou qualquer outro): o cliente HTTP da [extensão](../../extensoes/time-de-agentes/README.md) (`criarClienteHttp`, em `agente-llm.mjs`) tem timeout e não segue redirecionamentos, mas **não** faz retry nem separa `429` de ritmo e de cota: o erro passa para o orquestrador, que o conta como uma tentativa **da tarefa**, sem espera e sem olhar o tipo. Levar a política desta lição para lá é o passo natural (e um bom desafio de transferência).
- **Aprofundar:** o [M02 · exercício 01](../../../modulos/02-apis-ia-generativa/exercicios/01-chain-com-validacao-e-retry/enunciado.md) (validação e retry com o SDK e o LLM local), o [`lib/llm.js`](../../../modulos/01-fundamentos-ia-llms/lib/llm.js) e o [`comum_py/llm.py`](../../../modulos/01-fundamentos-ia-llms/comum_py/llm.py) do módulo 1:
  compare as escolhas de timeout e de retry deles com as suas e diga em que ambiente cada uma faz sentido.

### 15.5 Calibragem

Antes de rodar o verificador pela primeira vez, anote três previsões: (1) em que faixa (mínimo e máximo, em ms) deve ficar o tempo total **esperando** no cenário `servidor-instavel` (500, 503, 200) com `BACKOFF_BASE_MS` de 150 e jitter; (2) quanto tempo o cenário `lento` deve levar com `TIMEOUT_MS` de 1000 e 2 tentativas; (3) se o seu cliente passará no CA5 de primeira, e qual critério você acha mais provável de reprovar.
Depois, confronte com o que aconteceu e escreva uma frase por previsão ("previ X, aconteceu Y, errei porque..."). Registre na seção **Surpresas e limites** do `relatorio.md`, junto com a confiança que você marcou em cada questão do quiz. Se a confiança alta tiver acertos baixos, refaça o quiz antes de abrir a lição 3.

### 15.6 Hack de produtividade

**Sabia que você pode** mandar um aviso do seu script para o seu celular com uma chamada HTTP ao Telegram **para melhorar** a visibilidade do que roda sozinho (backup, testes, o laboratório desta lição)?

- **Dica do catálogo:** [PH-TEL-01 · Aviso de qualquer script em uma linha](../../extensoes/productivity-hacks/trilhas/telegram.md) · 10 a 15 min · R$ 0.
- **Faça agora:** com o seu cliente robusto da Lição 2, envie "terminei" ao seu bot e confira dois casos: o token errado vira erro de **autenticação** (não se repete) e o 429 com `retry_after` espera o tempo pedido. Sem token real, treine contra o [Telegram falso](../../extensoes/productivity-hacks/referencia/telegram-falso.mjs).
- **Cuidado:** o token vai na URL (nunca em log, histórico do shell ou repositório) e o chat com um bot não tem criptografia de ponta a ponta: não mande segredos. Na primeira execução real, use um bot de teste e um chat só seu. Opcional e sem XP.
