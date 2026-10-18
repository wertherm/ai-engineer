# 04 · PII brasileira: detectar, mascarar e desmascarar

**Conceito novo:** pseudonimizar dados pessoais **antes** de mandar texto ao LLM e antes de gravar logs:
CPF (com dígito verificador), e-mail, telefone (com/sem +55) e cartão (com Luhn) viram marcadores
`[CPF_1]`; o backend guarda o "cofre" e desmascara a resposta, com cartão e CPF mostrando só os 4 últimos
dígitos. Teoria em [docs/03](../../docs/03-riscos-humanos-eticos-e-de-seguranca.md#privacidade-e-pii).
**Pré-requisito:** `npm install` no módulo; o LLM só é usado no fim do `demo.js` (pule com `--sem-llm`).

Todos os CPFs e cartões dos testes são **números de teste** gerados para passar nas validações.

## Como rodar

```bash
cd modulos/10-seguranca-e-governanca
npm run ex04:test                                        # 7 testes, sem LLM
node exemplos/04-pii-e-mascaramento/demo.js --sem-llm   # só o mascaramento
node exemplos/04-pii-e-mascaramento/demo.js             # + 1 chamada ao LLM (npm run ex04)
```

## Saída esperada

Testes (real): `ℹ tests 7 · ℹ pass 7 · ℹ fail 0`.

Demo (real, 2026-10-17, `qwen3.5:4b`):

```
Original (fica só no backend):
  Oi, sou a Ana (CPF 529.982.247-25). Meu cartão 4111 1111 1111 1111 foi cobrado 2x. Me responda em ana.souza@exemplo.com.br ou (11) 98765-4321. Protocolo 2024-000123.

O que vai para o LLM:
  Oi, sou a Ana (CPF [CPF_1]). Meu cartão [CARTAO_1] foi cobrado 2x. Me responda em [EMAIL_1] ou [TELEFONE_1]. Protocolo 2024-000123.

PII encontrada: { EMAIL: 1, CARTAO: 1, CPF: 1, TELEFONE: 1 }

Log seguro:
{"ts":"2026-10-17T10:24:09.640Z","evento":"mensagem_recebida","canal":"chat","texto":"Oi, sou a Ana (CPF [CPF_1]). Meu cartão [CARTAO_1] ..."}

Chamando qwen3.5:4b (pode levar alguns minutos)...

Resposta do LLM (11 s), ainda mascarada:
  Olá Ana, registrei seu protocolo 2024-000123 referente ao duplo cobrança do cartão [CARTAO_1] e já estou verificando o motivo. Entrarei em contato com você no [EMAIL_1] ou no [TELEFONE_1] para resolver essa questão.

Resposta desmascarada (o que o cliente recebe):
  Olá Ana, registrei seu protocolo 2024-000123 referente ao duplo cobrança do cartão ****1111 e já estou verificando o motivo. Entrarei em contato com você no ana.souza@exemplo.com.br ou no (11) 98765-4321 para resolver essa questão.
```

O que observar:
- O protocolo `2024-000123` **não** foi mascarado (não é PII) e um número com cara de CPF mas DV errado
  também não (teste "não mascara número que só PARECE CPF").
- O modelo copiou os marcadores certinho: ele nunca viu o cartão nem o e-mail.
- **O nome "Ana" passou.** Regex não pega nome: para isso é preciso NER (modelo de entidades) ou não
  enviar o campo nome. É a limitação mais importante deste exemplo.

## Experimente

1. Adicione CNPJ (14 dígitos, também com dígito verificador) e um teste.
2. Mande o mesmo CPF duas vezes na mensagem e confira que vira `[CPF_1]` nas duas.
3. Troque `logSeguro` por um logger real (pino) com um *redact hook* que chama `mascarar`.

## Versão Python

Arquivos em `python/`: `pii.py` (mesmos detectores, CPF por dígito verificador, cartão por Luhn, cofre e
desmascaramento parcial) · `test_pii.py` (os 7 casos do JS com o MESMO resultado + 1 teste de Unicode) · `demo.py`.

### Como rodar

```bash
cd modulos/10-seguranca-e-governanca
uv sync
uv run pytest exemplos/04-pii-e-mascaramento                        # 8 testes, sem LLM
uv run python exemplos/04-pii-e-mascaramento/python/demo.py --sem-llm
uv run python exemplos/04-pii-e-mascaramento/python/demo.py         # + 1 chamada ao LLM
```

### Saída esperada (Python)

Testes (real): `8 passed in 0.07s`.

Demo (real, 2026-10-17, `qwen3.5:4b`):

```
O que vai para o LLM:
  Oi, sou a Ana (CPF [CPF_1]). Meu cartão [CARTAO_1] foi cobrado 2x. Me responda em [EMAIL_1] ou [TELEFONE_1]. Protocolo 2024-000123.

PII encontrada: {'EMAIL': 1, 'CARTAO': 1, 'CPF': 1, 'TELEFONE': 1}

Log seguro:
{"ts":"2026-10-17T23:07:46.017Z","evento":"mensagem_recebida","canal":"chat","texto":"Oi, sou a Ana (CPF [CPF_1]). Meu cartão [CARTAO_1] ..."}

Chamando qwen3.5:4b (pode levar alguns minutos)...

Resposta do LLM (51 s), ainda mascarada:
  Olá Ana, registrei seu protocolo 2024-000123 referente ao duplo cobrança do cartão [CARTAO_1] e já estou verificando o motivo. Entrarei em contato com você no [EMAIL_1] ou no [TELEFONE_1] para resolver essa questão.

Resposta desmascarada (o que o cliente recebe):
  Olá Ana, registrei seu protocolo 2024-000123 referente ao duplo cobrança do cartão ****1111 e já estou verificando o motivo. Entrarei em contato com você no ana.souza@exemplo.com.br ou no (11) 98765-4321 para resolver essa questão.
```

Armadilha do porte: os padrões usam `re.ASCII`. Sem essa flag, `\d` do Python casa dígitos Unicode (ex.:
`٥٢٩٩٨٢٢٤٧٢٥`, que ainda passa no dígito verificador porque `int('٥') == 5`) e `\w` casa `é`; o JS (sem flag `u`)
não casa nenhum dos dois. O teste `test_digitos_unicode_nao_viram_pii` trava esse comportamento igual ao do JS.
O log usa `json.dumps(..., ensure_ascii=False, separators=(",", ":"))` para sair idêntico ao `JSON.stringify`.
