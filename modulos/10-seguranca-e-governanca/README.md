# Módulo 10 · Segurança e Governança em IA

Como governar um sistema de IA (frameworks, leis e matriz de risco), explicar e auditar vieses de modelos, e
proteger aplicações com LLM contra prompt injection, vazamento de dados pessoais e consumo descontrolado.

Estudado em 2026-10-16 com scikit-learn 1.9.1, pandas 3.0.6, Python 3.14.7, Node 24.11, `openai` 7.34.0,
`pg` 8.23.1 e o modelo local `qwen3.5:4b` (Ollama). Status regulatório conferido em fontes oficiais em 2026-10-16.

## Mapa da ementa

| Tópico da ementa | Onde está |
|---|---|
| O que é governança em IA (NIST AI RMF, ISO/IEC 42001, EU AI Act, LGPD/ANPD, PL 2338/2023) | [doc 01](docs/01-governanca-e-regulacao.md) (status com data e fonte) · checklist e matriz de risco no mesmo doc |
| Interpretabilidade e explicabilidade em modelos de IA | [doc 02](docs/02-explicabilidade-e-vieses.md) · [exemplo 01](exemplos/01-explicabilidade/) |
| Vieses e responsabilidade em modelos de IA | [doc 02](docs/02-explicabilidade-e-vieses.md#vieses-e-responsabilidade) · [exemplo 02](exemplos/02-vieses-e-equidade/) |
| Gerenciamento de riscos: aspectos humanos e éticos | [doc 03](docs/03-riscos-humanos-eticos-e-de-seguranca.md#riscos-humanos-e-éticos) · [exercício 01](exercicios/01-model-card-e-matriz-de-risco/) |
| Gerenciamento de riscos: segurança e dados (OWASP Top 10 LLM, prompt injection, vazamento, saída insegura, excesso de autonomia, PII) | [doc 03](docs/03-riscos-humanos-eticos-e-de-seguranca.md#owasp-top-10-para-llm-2025) · [exemplo 03](exemplos/03-prompt-injection/) · [exemplo 04](exemplos/04-pii-e-mascaramento/) · [exercício 02](exercicios/02-endurecer-o-prompt/) |
| Gerenciamento de riscos: aspectos legais e regulatórios | [doc 01](docs/01-governanca-e-regulacao.md#aspectos-legais-e-regulatórios-o-que-muda-no-dia-a-dia) (conceitual; certificação ISO e conformidade legal não são executáveis localmente) |
| Custos financeiros em IA | [doc 04](docs/04-custos-financeiros.md) · [exemplo 05](exemplos/05-custos-e-orcamento/) |

Ligações: modelo e drift na [trilha MLOps](../../trilhas-extras/mlops/) · auth, rate limit e auditoria de
MCP no [módulo 03](../03-mcp/docs/04-seguranca-e-governanca.md) · system design com custo no [módulo 12](../12-carreira/).

## Pré-requisitos

- Infra do repositório no ar (Postgres na 5433 e Ollama com `qwen3.5:4b`). A partir da raiz: `bash infra/subir-ia.sh`.
- Python via `uv` (o `pyproject.toml` da raiz já tem scikit-learn, pandas e scipy; nenhuma dependência Python extra).
- `cd modulos/10-seguranca-e-governanca && npm install` (só `openai` e `pg`).
- Internet na 1ª execução do exemplo 02 (baixa o dataset Adult do OpenML, ~2 MB).
- Variáveis opcionais com defaults locais: `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODELO_CHAT`, `DATABASE_URL`
  (veja `infra/.env.example`). Dados no schema `m10`. Nenhuma porta de rede é aberta pelo módulo.

## Como rodar

```bash
cd modulos/10-seguranca-e-governanca
npm install

npm run ex01          # explicabilidade (Python)
npm run ex02          # vieses e equidade no Adult (Python)
npm run ex03:test     # guardas contra prompt injection (sem LLM)
npm run ex03          # bateria de prompt injection: 10 chamadas ao LLM (lento em CPU disputada)
npm run ex04:test     # testes de PII (sem LLM)
npm run ex04          # mascaramento + 1 chamada ao LLM
npm run ex05          # calculadora de custo
npm run ex05:orcamento   # orçamento no Postgres (sem e com cota por usuário)

npm run exe01         # exercício 01: gera o model card
npm run exe02:vulneravel # exercício 02: bateria contra o prompt vulnerável (5 chamadas)
npm run exe02         # exercício 02: bateria contra a solução (5 chamadas)

npm test              # tudo que não depende do LLM
```

## Status de verificação

| Item | Status |
|---|---|
| Exemplo 01 · permutação + explicação local (breast cancer) | ✅ executado |
| Exemplo 02 · métricas de equidade + 3 mitigações (Adult/OpenML) | ✅ executado |
| Exemplo 03 · guardas (4 testes) e bateria de 4 ataques + 1 benigno com `qwen3.5:4b` | ✅ executado (ingênuo 4/4, defendido 0/4) |
| Exemplo 04 · PII (7 testes) + ida e volta pelo LLM | ✅ executado |
| Exemplo 05 · calculadora + orçamento no Postgres `m10` | ✅ executado |
| Exercício 01 · model card + matriz de risco | ✅ executado |
| Exercício 02 · endurecer o prompt | ✅ executado (vulnerável 3/4 ataques, solução 0/4) |
| Preços reais de provedores de LLM e de GPU | ⚠️ não executado localmente: valores hipotéticos (exigiria conta/API paga); links das páginas oficiais no doc 04 |
| Certificação ISO/IEC 42001, avaliação de conformidade do EU AI Act | ⚠️ não executado localmente: processo organizacional/auditoria externa, coberto conceitualmente no doc 01 |

## Fontes

- NIST AI RMF: https://www.nist.gov/itl/ai-risk-management-framework
- ISO/IEC 42001:2023: https://www.iso.org/standard/42001
- EU AI Act e prazos: https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai · https://eur-lex.europa.eu/eli/reg/2024/1689/oj
- LGPD: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm · ANPD: https://www.gov.br/anpd/pt-br
- PL 2338/2023: https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2487262
- OWASP Top 10 for LLM Applications 2025: https://genai.owasp.org/llm-top-10/
- scikit-learn, permutation importance: https://scikit-learn.org/stable/modules/permutation_importance.html
- Fairlearn: https://fairlearn.org/ · Model Cards (Mitchell et al.): https://arxiv.org/abs/1810.03993
