# Módulo 12 · Carreira e Entrevistas para Engenheiros de AI Aplicada

Como ser encontrado, avaliado e bem pago como engenheiro de IA aplicada: LinkedIn, networking, marca pessoal e
portfólio; níveis de carreira, salário, negociação e promoção; entrevistas de RH, live coding, system design de IA
e as perguntas técnicas clássicas. Cada tópico vira um artefato executável: checklists, templates e calculadoras.

Estudado em 2026-10-16 com Node 24 (`node:test` embutido), `openai` **7.34.0** e o modelo local `qwen3.5:4b`
(Ollama) — o LLM só aparece no feedback opcional do simulador de entrevista. O próprio repositório `ai-engineer`
é usado como portfólio-exemplo.

## Mapa da ementa

| Tópico da ementa | Onde está |
|---|---|
| Otimização de LinkedIn para recrutadores (palavras-chave de IA, SSI, headline, "Sobre" com projetos) | [doc 01](docs/01-presenca-profissional-e-portfolio.md#linkedin-para-recrutadores) · [exemplo 02](exemplos/02-perfil-linkedin/) (análise do texto; nada é publicado nem lido do LinkedIn) |
| Networking estratégico (recrutadores e tech leads, comunidades de IA, engajamento consistente) | [doc 01](docs/01-presenca-profissional-e-portfolio.md#networking-estratégico) · [exemplo 02](exemplos/02-perfil-linkedin/) (calendário de engajamento) |
| Marca pessoal e posicionamento | [doc 01](docs/01-presenca-profissional-e-portfolio.md#marca-pessoal-e-posicionamento) · [exemplo 02](exemplos/02-perfil-linkedin/) (calendário de conteúdo) |
| Portfólio GitHub profissional (deploy, READMEs detalhados, código limpo, demos) | [doc 01](docs/01-presenca-profissional-e-portfolio.md#portfólio-github-profissional) · [exemplo 01](exemplos/01-auditoria-de-readme/) · [exercício 01](exercicios/01-readme-que-passa/) |
| Expectativas por nível (Júnior → Principal) | [doc 02](docs/02-niveis-salario-e-promocao.md#expectativas-por-nível) · [exemplo 03](exemplos/03-star-e-brag-document/) (eixos do caso de promoção) |
| Entrevistas de RH (STAR, storytelling, alinhamento cultural, pontos fracos) | [doc 03](docs/03-entrevistas-comportamentais.md) · [exemplo 03](exemplos/03-star-e-brag-document/) |
| Expectativas salariais e proposta de valor | [doc 02](docs/02-niveis-salario-e-promocao.md#expectativas-salariais-e-proposta-de-valor) (conceitual; sem valores de mercado, só fontes) |
| Live coding e problem solving | [doc 04](docs/04-entrevistas-tecnicas-de-ia.md#live-coding-e-problem-solving) · [exemplo 04](exemplos/04-simulador-de-entrevista/) (pergunta `live-coding-retry`) |
| System design para sistemas de IA (trade-offs, escala, custo, resiliência) | [doc 04](docs/04-entrevistas-tecnicas-de-ia.md#system-design-para-sistemas-de-ia) · [exemplo 05](exemplos/05-system-design-rag/) · [exercício 02](exercicios/02-system-design-com-custo/) |
| Explicar decisões técnicas | [doc 04](docs/04-entrevistas-tecnicas-de-ia.md#explicar-decisões-técnicas) · [exemplo 05](exemplos/05-system-design-rag/) (tabela de trade-offs) · [exemplo 04](exemplos/04-simulador-de-entrevista/) (`explicar-decisao`) |
| Perguntas técnicas de IA (RAG × fine-tuning, agentes, custo, falhas) | [doc 04](docs/04-entrevistas-tecnicas-de-ia.md#perguntas-técnicas-específicas-de-ia) · [exemplo 04](exemplos/04-simulador-de-entrevista/) |
| Negociação salarial (timing, âncoras, múltiplas ofertas, pacote completo) | [doc 02](docs/02-niveis-salario-e-promocao.md#negociação-salarial) (conceitual) |
| Pedido de aumento/promoção (documentar impacto, timing, caso com métricas) | [doc 02](docs/02-niveis-salario-e-promocao.md#pedido-de-aumento-ou-promoção) · [exemplo 03](exemplos/03-star-e-brag-document/) (`brag.json` → caso de promoção) |
| Técnicas de diferenciação (demos ao vivo, case studies, open source, presença técnica) | [doc 01](docs/01-presenca-profissional-e-portfolio.md#técnicas-de-diferenciação) · [exercício 01](exercicios/01-readme-que-passa/) (case com números reais) |

## Pré-requisitos

- Node 24 e npm 11. Na pasta do módulo: `npm install` (só o pacote `openai`).
- Só para o feedback com LLM (`npm run ex04:llm`): a infra no ar, a partir da **raiz** do repo:
  `bash infra/subir-ia.sh` (Ollama com `qwen3.5:4b`). Variáveis opcionais `OPENAI_BASE_URL`, `OPENAI_API_KEY`,
  `MODELO_CHAT` (veja [`infra/.env.example`](../../infra/.env.example)). Não usa Postgres.

## Como rodar

```bash
cd modulos/12-carreira
npm install

npm run ex01        # auditoria de README em pastas reais do repo
npm run ex02        # perfil do LinkedIn contra uma vaga + calendário de conteúdo
npm run ex03        # histórias STAR + caso de promoção a partir do brag document
npm run ex04        # sorteia perguntas técnicas de IA (seed 12)
npm run ex04:llm    # avalia uma resposta com checklist + feedback do LLM local (~1 min; mais se o Ollama estiver ocupado)
npm run ex05        # system design RAG: capacidade, custo, sensibilidade

npm run exe01       # exercício 01: README reescrito passa no checklist
npm run exe02       # exercício 02: estimativa por etapa da triagem de tickets

npm test            # 14 testes (node:test), nenhum depende do LLM
```

## Status de verificação

| Item | Status |
|---|---|
| Exemplo 01 · auditoria de README | ✅ executado contra 3 pastas reais do repo + 1 README fraco (3 testes) |
| Exemplo 02 · perfil do LinkedIn | ✅ executado (2 testes) · ⚠️ o LinkedIn em si não é acessado (sem login nem scraping): o texto é colado em `perfil.json` |
| Exemplo 03 · STAR + brag document | ✅ executado (2 testes) |
| Exemplo 04 · simulador (sorteio e checklist) | ✅ executado (3 testes) |
| Exemplo 04 · feedback com LLM | ✅ executado uma vez com `qwen3.5:4b` (66 s, 44 tokens) |
| Exemplo 05 · system design RAG | ✅ executado (3 testes) · custos com preços **ilustrativos** |
| Exercício 01 · README que passa | ✅ executado (0% → 93%, PASSA) |
| Exercício 02 · system design com custo | ✅ executado (1 teste) |
| Networking, negociação, entrevista de RH ao vivo | ⚠️ conceitual (docs 01–03): dependem de pessoas reais; os artefatos (templates, checklists) estão nos exemplos |

## Fontes

- LinkedIn · Social Selling Index: https://business.linkedin.com/sales-solutions/social-selling/the-social-selling-index-ssi
- GitHub Docs · About READMEs: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes
- Dropbox Engineering Career Framework: https://dropbox.github.io/dbx-career-framework/ · StaffEng: https://staffeng.com/guides/staff-archetypes/
- Julia Evans · brag documents: https://jvns.ca/blog/brag-documents/
- Patrick McKenzie · Salary Negotiation: https://www.kalzumeus.com/2012/01/23/salary-negotiation/
- Tech Interview Handbook: https://www.techinterviewhandbook.org/behavioral-interview/
- System Design Primer: https://github.com/donnemartin/system-design-primer
- Anthropic · Building effective agents: https://www.anthropic.com/engineering/building-effective-agents
- OWASP Top 10 for LLM Applications: https://owasp.org/www-project-top-10-for-large-language-model-applications/
