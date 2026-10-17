// Valida histórias STAR: estrutura, proporção, primeira pessoa, resultado medido e duração falada.
import { readFileSync } from 'node:fs';

const palavras = (t) => (t.trim().match(/\S+/g) ?? []).length;

export function validarStar(h) {
  const total = ['situacao', 'tarefa', 'acao', 'resultado'].reduce((s, k) => s + palavras(h[k] ?? ''), 0);
  const contexto = palavras(h.situacao ?? '') + palavras(h.tarefa ?? '');
  // Primeira pessoa do singular: "eu" ou verbo no pretérito terminado em -ei ("medi" fica de fora; tudo bem,
  // é uma heurística). Plural ("nós", "fizemos", "a gente") esconde o SEU papel.
  const singular = (h.acao.match(/\beu\b|\b\w{3,}ei\b/gi) ?? []).length;
  const plural = (h.acao.match(/\bn[óo]s\b|\ba gente\b|\b\w{3,}amos\b|\b\w{3,}emos\b/gi) ?? []).length;
  const checagens = {
    'quatro partes preenchidas': ['situacao', 'tarefa', 'acao', 'resultado'].every((k) => palavras(h[k] ?? '') > 3),
    'contexto (S+T) <= 30% do texto': contexto / total <= 0.3,
    'ação na 1ª pessoa do singular': singular >= 2 && singular > plural,
    'resultado com número': /\d/.test(h.resultado),
    'resultado com aprendizado': /aprendi|faria diferente|li[çc][ãa]o/i.test(h.resultado),
    'cabe em 1–3 min falando': total / 150 >= 0.5 && total / 150 <= 3,
  };
  return { total, minutos: total / 150, checagens, ok: Object.values(checagens).every(Boolean) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const historias = JSON.parse(readFileSync(new URL('./historias.json', import.meta.url), 'utf8'));
  for (const h of historias) {
    const r = validarStar(h);
    console.log(`\n${r.ok ? '✓' : '✗'} ${h.id} · ${r.total} palavras (~${r.minutos.toFixed(1)} min falando)`);
    for (const [nome, ok] of Object.entries(r.checagens)) console.log(`   ${ok ? '[x]' : '[ ]'} ${nome}`);
  }
}
