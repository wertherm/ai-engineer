// Status report: métricas e semáforo calculados em código; o LLM só adapta o texto ao público.
export function metricasSprint(s) {
  const tempoDecorrido = (s.diasTotais - s.diasRestantes) / s.diasTotais; // 0.7
  const entrega = s.pontosEntregues / s.pontosPlanejados;
  const cpi = (s.orcamentoPrevisto * (s.percentualEscopoConcluido / 100)) / s.orcamentoGasto; // valor agregado / custo real
  // Semáforo por regra explícita: entrega atrás do tempo, bug crítico ou item bloqueado puxam para amarelo/vermelho.
  let semaforo = 'verde';
  if (entrega < tempoDecorrido - 0.05 || s.bugsCriticos > 0 || s.itensBloqueados.length) semaforo = 'amarelo';
  if (entrega < tempoDecorrido - 0.25 || cpi < 0.8) semaforo = 'vermelho';
  return {
    entregaPct: Math.round(entrega * 100),
    tempoPct: Math.round(tempoDecorrido * 100),
    cpi: +cpi.toFixed(2),
    semaforo,
  };
}

export const PUBLICOS = {
  tecnico: 'time de desenvolvimento: cite bugs, bloqueios e dependências técnicas; pode usar jargão',
  gestor: 'gerente de projeto: foque em prazo, riscos, próximos passos e quem faz o quê',
  diretoria: 'diretoria: 2 frases, impacto no negócio e se precisa de decisão; sem jargão técnico',
};

// Checagem barata de alucinação numérica: todo número do texto precisa existir nos fatos.
// Não pega número por extenso ("três dias"), mas pega "atraso de 5 dias" inventado.
export function numerosSemLastro(texto, fatosJson) {
  const fatos = new Set((fatosJson.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
  const doTexto = (texto.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')));
  return [...new Set(doTexto.filter((n) => !fatos.has(n)))];
}
