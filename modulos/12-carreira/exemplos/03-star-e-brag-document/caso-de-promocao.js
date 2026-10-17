// Transforma o brag document (brag.json) num caso de promoção: agrupa por eixo do nível-alvo, calcula a
// variação de cada métrica e aponta eixo sem evidência (o buraco que o comitê vai achar antes de você).
import { readFileSync } from 'node:fs';

// Eixos que quase toda matriz de carreira usa (ver docs/02). O texto descreve o que o nível SÊNIOR exige.
export const EIXOS = {
  impacto: 'resultados mensuráveis para o negócio, não só tarefas entregues',
  escopo: 'resolve problemas ambíguos que atravessam mais de um time/sistema',
  lideranca: 'eleva o time: decisões técnicas, incidentes, mentoria',
  execucao: 'entrega previsível, com qualidade e operação (testes, observabilidade)',
};

export function variacao({ antes, depois }) {
  if (antes === 0) return `0 → ${depois}`;
  const pct = ((depois - antes) / antes) * 100;
  return `${antes} → ${depois} (${pct > 0 ? '+' : ''}${pct.toFixed(0)}%)`;
}

export function montarCaso(brag) {
  const linhas = [`# Caso de promoção · ${brag.pessoa} → ${brag.nivelAlvo}`, ''];
  const lacunas = [];
  for (const [eixo, expectativa] of Object.entries(EIXOS)) {
    const itens = brag.entradas.filter((e) => e.eixo === eixo);
    linhas.push(`## ${eixo} — ${expectativa}`);
    if (!itens.length) {
      linhas.push('- (sem evidência registrada)');
      lacunas.push(eixo);
    }
    for (const e of itens) linhas.push(`- ${e.data} · ${e.titulo}: ${variacao(e)} ${e.unidade} · evidência: ${e.evidencia}`);
    linhas.push('');
  }
  return { markdown: linhas.join('\n'), lacunas };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const brag = JSON.parse(readFileSync(new URL('./brag.json', import.meta.url), 'utf8'));
  const { markdown, lacunas } = montarCaso(brag);
  console.log(markdown);
  console.log(lacunas.length ? `Lacunas para resolver ANTES da conversa: ${lacunas.join(', ')}` : 'Todos os eixos têm evidência.');
}
