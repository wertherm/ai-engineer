// Checklist de README de projeto de IA: o que um recrutador ou tech lead procura nos 30 segundos
// em que abre o seu repositório. Cada critério é uma função pura sobre o texto (e a lista de
// arquivos da pasta), para poder testar e reaproveitar no exercício 01.

const temSecao = (texto, re) => texto.split('\n').some((l) => /^#{1,4}\s/.test(l) && re.test(l));

// Número seguido de unidade: a diferença entre "ficou rápido" e "p95 de 1,8 s".
const METRICA = /\b\d+(?:[.,]\d+)?\s?(?:ms|s\b|min|%|tokens?|req\/s|tokens\/s|GB|MB|US\$|R\$|x\b)|(?:US\$|R\$)\s?\d/gi;

export const CRITERIOS = [
  {
    id: 'proposito',
    peso: 1,
    obrigatorio: true,
    descricao: 'Título + 1–2 frases dizendo que problema o projeto resolve',
    // Primeiro título seguido (antes do próximo título) de um parágrafo de texto corrido.
    testar: (t) => /^#\s.+\n+(?!#)[^\n`|>-][^\n]{40,}/m.test(t),
  },
  {
    id: 'como-rodar',
    peso: 2,
    obrigatorio: true,
    descricao: 'Seção "Como rodar" com comando copiável em bloco de código',
    testar: (t) => temSecao(t, /como rodar|quickstart|getting started|instala|uso\b|usage/i) && /```(bash|sh|shell|zsh)?\n/.test(t),
  },
  {
    id: 'pre-requisitos',
    peso: 1,
    obrigatorio: false,
    descricao: 'Pré-requisitos explícitos (runtime, serviços, variáveis)',
    testar: (t) => /pr[ée]-requisito|requirements|prerequisite|depend[eê]ncias/i.test(t),
  },
  {
    id: 'saida-real',
    peso: 2,
    obrigatorio: true,
    descricao: 'Saída/resultado real colado (não só "funciona")',
    testar: (t) => temSecao(t, /sa[ií]da|resultado|output|exemplo de uso|demo/i) && (t.match(/```/g) ?? []).length >= 4,
  },
  {
    id: 'metricas',
    peso: 2,
    obrigatorio: true,
    descricao: 'Resultados medidos: pelo menos 3 números com unidade (latência, custo, acurácia, tokens)',
    testar: (t) => (t.match(METRICA) ?? []).length >= 3,
  },
  {
    id: 'diagrama',
    peso: 1,
    obrigatorio: false,
    descricao: 'Diagrama de arquitetura (Mermaid ou imagem)',
    testar: (t) => /```mermaid|!\[[^\]]*\]\([^)]+\.(png|svg|gif|jpg)\)/i.test(t),
  },
  {
    id: 'demo',
    peso: 1,
    obrigatorio: false,
    descricao: 'Demo acessível: URL, GIF/vídeo ou UI local com porta',
    testar: (t) => /\bdemo\b|https?:\/\/(localhost|127\.0\.0\.1):\d+|!\[[^\]]*\]\([^)]+\.gif\)/i.test(t),
  },
  {
    id: 'limitacoes',
    peso: 2,
    obrigatorio: true,
    descricao: 'Limitações, trade-offs ou o que NÃO foi executado (honestidade técnica)',
    testar: (t) => /limita[çc][õo]es|trade-?offs?|armadilha|n[ãa]o executado|known issues|riscos/i.test(t),
  },
  {
    id: 'testes',
    peso: 1,
    obrigatorio: false,
    descricao: 'Testes ou avaliação automatizada (arquivos de teste ou comando de teste no README)',
    testar: (t, arquivos = []) =>
      arquivos.some((a) => /(\.test\.[jt]s|_test\.py|test_.*\.py|portao\.py|casos\.ya?ml)$/.test(a)) ||
      /npm (run )?test|pytest|node --test|vitest/i.test(t),
  },
  {
    id: 'versoes',
    peso: 1,
    obrigatorio: false,
    descricao: 'Versões fixadas das peças principais (ex.: vLLM 0.31.0)',
    testar: (t) => /\b\d+\.\d+\.\d+\b/.test(t),
  },
];

const PESO_TOTAL = CRITERIOS.reduce((s, c) => s + c.peso, 0);

/** Audita o texto de um README. Passa com nota >= 80% E todos os critérios obrigatórios atendidos. */
export function auditarTexto(texto, arquivos = []) {
  const resultados = CRITERIOS.map((c) => ({ ...c, ok: Boolean(c.testar(texto, arquivos)) }));
  const pontos = resultados.filter((r) => r.ok).reduce((s, r) => s + r.peso, 0);
  const nota = Math.round((pontos / PESO_TOTAL) * 100);
  const faltandoObrigatorio = resultados.filter((r) => r.obrigatorio && !r.ok).map((r) => r.id);
  return { nota, passou: nota >= 80 && faltandoObrigatorio.length === 0, resultados, faltandoObrigatorio };
}
