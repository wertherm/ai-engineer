// Analisa um perfil de LinkedIn contra uma vaga: cobertura de palavras-chave, headline e "Sobre".
// Não acessa o LinkedIn: trabalha com o texto que você cola em perfil.json (nada de scraping nem login).
import { readFileSync } from 'node:fs';

const ler = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const perfil = JSON.parse(ler('./perfil.json'));
const vaga = ler('./vaga.txt');

// Limites de 220 (headline) e 2.600 (Sobre) caracteres e ~60 visíveis da headline em listas: dados de guias
// de terceiros (ver docs/01), não da documentação do LinkedIn. Confira no contador do próprio formulário.
const LIMITE = { headline: 220, headlineVisivel: 60, sobre: 2600, ganchoSobre: 300 };

// Termo canônico -> padrão que o reconhece (sinônimos e grafias). É o que um recrutador digita na busca.
export const TERMOS = {
  RAG: /\brag\b|retrieval[- ]augmented/i,
  'Agentes de IA': /\bagent(e|es|s)?\b/i,
  MCP: /\bmcp\b|model context protocol/i,
  'LangChain/LangGraph': /langchain|langgraph/i,
  'Avaliação de LLMs': /avalia[çc][ãa]o|\bevals?\b/i,
  Observabilidade: /observabilidade|\bslo\b|lat[êe]ncia|ttft/i,
  'Banco vetorial': /pgvector|vetoria|vector/i,
  PostgreSQL: /postgres/i,
  'Python/TypeScript': /python|typescript|node\.?js/i,
  Kubernetes: /kubernetes|\bk8s\b/i,
  Docker: /docker/i,
  'Prompt engineering': /prompt/i,
  'Fine-tuning': /fine-?tuning/i,
  vLLM: /\bvllm\b/i,
  'LLMOps/MLOps': /llmops|mlops/i,
};

export function cobertura(textoPerfil, textoVaga) {
  const pedidos = Object.entries(TERMOS).filter(([, re]) => re.test(textoVaga));
  const presentes = pedidos.filter(([, re]) => re.test(textoPerfil)).map(([t]) => t);
  const ausentes = pedidos.filter(([, re]) => !re.test(textoPerfil)).map(([t]) => t);
  return { pct: Math.round((presentes.length / pedidos.length) * 100), presentes, ausentes };
}

export function avaliarHeadline(h) {
  const visivel = h.slice(0, LIMITE.headlineVisivel);
  return {
    tamanho: h.length,
    cabe: h.length <= LIMITE.headline,
    // O cargo-alvo precisa aparecer no trecho que a busca e os convites mostram.
    cargoVisivel: /engenheir[oa] de (ia|ai)|ai engineer|machine learning|ml engineer/i.test(visivel),
    cliches: (h.match(/apaixonad|buscando (novos )?desafios|inova[çc][ãa]o|entusiasta/gi) ?? []).length,
  };
}

export function avaliarSobre(s) {
  const gancho = s.slice(0, LIMITE.ganchoSobre);
  return {
    tamanho: s.length,
    cabe: s.length <= LIMITE.sobre,
    ganchoComNumero: /\d/.test(gancho),
    projetos: (s.match(/^- /gm) ?? []).length,
    chamadaParaAcao: /mensagem|contato|fale comigo|aberto a/i.test(s),
  };
}

function relatorio(rotulo, headline, sobre, skills) {
  const c = cobertura([headline, sobre, ...skills].join('\n'), vaga);
  const h = avaliarHeadline(headline);
  const s = avaliarSobre(sobre);
  console.log(`\n== ${rotulo} ==`);
  console.log(`headline: ${h.tamanho}/${LIMITE.headline} car. · cargo nos ${LIMITE.headlineVisivel} visíveis: ${h.cargoVisivel ? 'sim' : 'NÃO'} · clichês: ${h.cliches}`);
  console.log(`sobre: ${s.tamanho}/${LIMITE.sobre} car. · número no gancho: ${s.ganchoComNumero ? 'sim' : 'NÃO'} · projetos listados: ${s.projetos} · chamada para ação: ${s.chamadaParaAcao ? 'sim' : 'NÃO'}`);
  console.log(`palavras-chave da vaga: ${c.pct}% (${c.presentes.length}/${c.presentes.length + c.ausentes.length})`);
  if (c.ausentes.length) console.log(`  faltando: ${c.ausentes.join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  relatorio('ANTES', perfil.headline, perfil.sobre, perfil.skills);
  relatorio('DEPOIS', perfil.headlineNova, perfil.sobreNovo, perfil.skillsNovas);

  // Marca pessoal = constância. Um calendário simples de 4 semanas a partir do que você aprendeu de verdade,
  // alternando formatos (aprendizado curto, case com números, artigo, demo).
  const formatos = ['post curto: 1 aprendizado + 1 trecho de código', 'case: problema -> decisão -> número', 'artigo técnico (blog/dev.to) linkado no post', 'demo: GIF de 20 s + link do repo'];
  console.log('\nCalendário de conteúdo (1 publicação/semana + 3 comentários técnicos em posts de outras pessoas):');
  perfil.aprendizados.forEach((a, i) => console.log(`  semana ${i + 1} · ${formatos[i % formatos.length]} · "${a}"`));
}
