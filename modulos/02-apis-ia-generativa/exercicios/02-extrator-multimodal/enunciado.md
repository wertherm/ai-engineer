# Exercício 02 · Extrator multimodal de recibos com fallback

## Contexto

Um app de gestão de aluguéis recebe fotos de recibos. A maioria é nítida (um OCR local resolve, de graça,
em segundos); algumas chegam tortas e ruidosas. Mandar **tudo** para um modelo com visão funciona, mas é
lento e caro. Você vai montar um extrator que usa o caminho barato quando dá e o caro só quando precisa.

## Requisitos

1. Gere dois recibos de aluguel **fictícios** em PNG: um nítido e um "fotografado mal" (girado, pequeno,
   com ruído). Guarde o gabarito: pagador `Carlos Andrade`, recebedor `Imobiliaria Modelo`,
   valor `1850`, referência `2026-09`.
2. Caminho 1: **OCR local** (tesseract.js, português). Se a confiança for **≥ 70**, um LLM de **texto**
   estrutura o resultado em JSON validado por zod (`pagador`, `recebedor`, `valor`, `referencia` em `AAAA-MM`).
3. Caminho 2 (**fallback**): se a confiança do OCR for baixa **ou** a validação do caminho 1 falhar, envie a
   imagem em base64 para o LLM com **visão**, com o mesmo schema.
4. Informe por qual caminho cada recibo passou, o tempo e quantos campos bateram com o gabarito.

## Critério de pronto

- O recibo nítido sai pelo caminho `ocr` com 4/4 campos certos.
- O recibo ruim cai no `fallback` com o motivo logado e passa pelo caminho `visao`.

## Dicas

- Reaproveite `ocr()` do [exemplo 05](../../exemplos/05-documentos-ocr-e-visao/extrair.js) e
  `chamarEstruturado()` de [`comum/estruturado.js`](../../comum/estruturado.js).
- `@napi-rs/canvas`: `g.rotate()` para girar; pixels pretos aleatórios com semente fixa para o ruído
  (reprodutível).
- Olhe o texto que o OCR devolve no recibo ruim: ele "lê" `R$ 2:856,00`. É por isso que **confiança baixa
  não pode virar dado**.

## Solução

[`solucao/gerar-recibos.js`](solucao/gerar-recibos.js) e [`solucao/extrator.js`](solucao/extrator.js).

### Saída real da solução

```bash
cd modulos/02-apis-ia-generativa
npm run exe02:gerar      # gera recibo-nitido.png e recibo-ruim.png (já versionados)
npm run exe02            # ~3 min em CPU
```

```
[recibo-nitido.png]
  · {"passo":"ocr","confianca":95}
  · {"etapa":"recibo_ocr","tentativa":1,"ms":67087,"tokens":193}
  via=ocr · 69.9 s · 4/4 campos certos
   {"pagador":"Carlos Andrade","recebedor":"Imobiliaria Modelo","valor":1850,"referencia":"2026-09"}

[recibo-ruim.png]
  · {"passo":"ocr","confianca":29}
  · {"passo":"fallback","motivo":"confiança do OCR 29 < 70"}
  · {"etapa":"recibo_visao","tentativa":1,"ms":92506,"tokens":231}
  via=visao · 95.1 s · 3/4 campos certos
   {"pagador":"Carlos Andrade","recebedor":"Imobiliária Modelo","valor":1850,"referencia":"2026-09"}
```

O campo que "errou" no caminho de visão é o `recebedor`: o documento diz `Imobiliaria` (sem acento) e o
modelo **corrigiu** para `Imobiliária`. Modelos de visão tendem a normalizar o que leem; se você precisa da
cópia literal (auditoria, conciliação), compare sem acentos (`normalize("NFD")`) ou valide contra um cadastro.
Note também que o OCR do recibo ruim "lia" `R$ 2:856,00` — se a confiança baixa virasse dado, o valor sairia errado.
