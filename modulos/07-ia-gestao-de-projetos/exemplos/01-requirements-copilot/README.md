# Exemplo 01 · Requirements Copilot

**Conceito novo**: texto livre de stakeholder → épicos, histórias de usuário, critérios de aceite
(Dado/Quando/Então), decomposição em tarefas, requisitos de mudança e dúvidas para o PO, num JSON
validado por schema zod (structured output). Depois, uma auditoria **determinística** acusa o que o
schema não consegue garantir.

**Pré-requisito**: infra no ar (`bash infra/subir-ia.sh` na raiz) e `npm install` na pasta do módulo.

Arquivos: `pedido.txt` (entrada), `schema.js` (contrato zod), `validar.js` (regras de qualidade),
`main.js`, `validar.test.js` (teste sem LLM).

## Como rodar

```bash
cd modulos/07-ia-gestao-de-projetos
npm run ex01                                            # ~3–7 min em CPU (gera ~1000 tokens; mais lento se o Ollama estiver ocupado)
node --test exemplos/01-requirements-copilot/validar.test.js
```

## Saída esperada

Saída real (qwen3.5:4b, CPU):

```text
LLM: 3:35.717 (m:ss.mmm)

EP-01 · Geração e download de segunda via de boleto no portal
  HU-01 Como Cliente que já possui uma segunda via gerada pelo atendente, quero Baixar a segunda via do boleto diretamente pelo portal, para Evitar filas e agilizar o recebimento do documento
     ✔ Dado que o usuário está logado no portal, quando ele buscar por 'Segunda Via' usando seu CPF, então o sistema exibe a lista de boletos disponíveis para download com opção de PDF.
     ✔ Dado que o usuário seleciona um boleto específico, quando clica em 'Baixar', então o sistema gera e oferece o arquivo PDF contendo os juros e multa recalculados até a data atual.
     tarefas: Integrar API de geração de boletos para recálculo automático de juros/multa. | Criar tela de busca por CPF com filtro de status 'Gerado' (não vencido ainda).
  HU-02 Como Cliente que deseja reemitir um boleto já vencido, quero Reemitir boletos vencidos há menos de 60 dias pelo portal, para Evitar contato com o atendimento humano para casos não críticos
     ✔ Dado que o usuário seleciona um boleto vencido, quando ele tenta reemitir se a data de vencimento for anterior a 60 dias, então o sistema permite a geração e download.
     ✔ Dado que o usuário seleciona um boleto vencido, quando ele tenta reemitir se a data de vencimento for anterior a 60 dias, então o sistema exibe uma mensagem de erro informando que apenas o atendimento pode realizar essa ação.
     ...
EP-02 · Notificações proativas por e-mail sobre vencimento
  HU-03 Como Cliente cadastrado no sistema, quero Receber um aviso por e-mail 3 dias antes do vencimento do boleto, para Evitar o atraso no pagamento e gerar multas
     ...

Mudanças: [
  'Adição da regra de negócio que impede a reemissão de boletos vencidos há mais de 60 dias pelo portal, permitindo apenas via atendimento. -> EP-01,HU-02'
]
Dúvidas para o PO: [
  'Qual o comportamento do sistema se o cliente tentar baixar uma segunda via de um boleto que já foi pago ou cancelado?',
  'O e-mail de aviso deve conter links diretos para pagamento ou apenas informativo?'
]

Auditoria determinística: 3 histórias, 1 problema(s)
  ⚠ mudança "Adição da regra de negócio que impede a ..." aponta para ids inexistentes: EP-01

Salvo em exemplos/01-requirements-copilot/backlog.gerado.json
```

```text
✔ backlog bem formado não tem problemas
✔ acusa critério fora do Dado/Quando/Então e mudança órfã
ℹ pass 2
```

**Leia com atenção**: o schema aceitou tudo, a auditoria pegou a mudança apontando para um épico em
vez de histórias, e **nenhuma das duas camadas** pegou que os dois critérios da HU-02 têm a mesma
condição ("anterior a 60 dias") com resultados opostos. Revisão humana continua obrigatória.

## Experimente

1. Troque `pedido.txt` por uma demanda sua (ex.: um pedido de task do Monday) e veja quantos problemas
   a auditoria acusa.
2. Adicione em `validar.js` uma regra que detecte critérios **idênticos até o "então"** (pegaria o erro
   da HU-02) e um teste para ela.
3. Rode com um modelo maior apontando `OPENAI_BASE_URL`/`MODELO_CHAT` para outro provedor e compare a
   qualidade dos critérios com o mesmo schema.
