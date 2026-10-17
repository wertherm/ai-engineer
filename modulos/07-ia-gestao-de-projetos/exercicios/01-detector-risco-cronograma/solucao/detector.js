// Detector de risco de cronograma: anomalia estatística + tendência + regras -> riscos com mitigação.
// Tudo determinístico. Um LLM poderia, no máximo, redigir o e-mail com os riscos que este código achou.

const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// z-score ROBUSTO (mediana e MAD): um sprint ruim no passado não "contamina" a régua como faria a média/desvio.
export function zRobusto(valor, base) {
  const med = mediana(base);
  const mad = mediana(base.map((x) => Math.abs(x - med))) || 1; // MAD 0 (série constante) vira 1 para não dividir por zero
  return (0.6745 * (valor - med)) / mad;
}

// Inclinação da reta (mínimos quadrados): tendência das últimas N sprints.
export function inclinacao(ys) {
  const n = ys.length, xm = (n - 1) / 2, ym = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  ys.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; });
  return num / den;
}

// Base de conhecimento de mitigação (heurísticas do PMO). Em produção: histórico de lições aprendidas.
export const MITIGACOES = {
  escopo: 'Congelar escopo da sprint; mudanças entram só pelo PO via change request priorizado.',
  cronograma: 'Replanejar com previsão Monte Carlo (P85) e negociar corte de escopo ou nova data.',
  recursos: 'Limitar horas extras, redistribuir carga e checar dependência de uma única pessoa.',
  qualidade: 'Reservar capacidade para bugs (ex.: 20%) e reforçar testes automatizados no caminho crítico.',
  bloqueio: 'Escalar impedimentos diários e mapear dependências externas com dono e data.',
};

export function detectarRiscos(historico, { janela = 4, limiarZ = 3.5 } = {}) {
  const atual = historico.at(-1);
  const passado = historico.slice(0, -1);
  const riscos = [];
  const add = (tipo, severidade, evidencia) => riscos.push({ tipo, severidade, evidencia, mitigacao: MITIGACOES[tipo] });

  // 1) Anomalias da última sprint contra o histórico (z robusto > 3.5 é o corte clássico de Iglewicz-Hoaglin).
  const metricas = { entregue: 'cronograma', escopoAdicionado: 'escopo', horasExtras: 'recursos', bugsNovos: 'qualidade', diasBloqueados: 'bloqueio' };
  for (const [campo, tipo] of Object.entries(metricas)) {
    const z = zRobusto(atual[campo], passado.map((s) => s[campo]));
    if (Math.abs(z) >= limiarZ) add(tipo, 'alta', `${campo}=${atual[campo]} é anômalo (z robusto ${z.toFixed(1)})`);
  }

  // 2) Tendência: queda contínua de entrega nas últimas sprints mesmo sem anomalia pontual.
  const ult = historico.slice(-janela);
  const tendEntrega = inclinacao(ult.map((s) => s.entregue / s.planejado));
  if (tendEntrega < -0.03) add('cronograma', 'media', `taxa de entrega caindo ${(tendEntrega * 100).toFixed(1)} p.p./sprint nas últimas ${janela}`);

  // 3) Regra de negócio: escopo adicionado > 20% do planejado = scope creep.
  const creep = atual.escopoAdicionado / atual.planejado;
  if (creep > 0.2) add('escopo', 'media', `escopo adicionado = ${Math.round(creep * 100)}% do planejado (limite 20%)`);

  // Deduplica por tipo, mantendo a maior severidade e juntando as evidências.
  const porTipo = new Map();
  for (const r of riscos) {
    const ja = porTipo.get(r.tipo);
    if (!ja) porTipo.set(r.tipo, { ...r, evidencia: [r.evidencia] });
    else { ja.evidencia.push(r.evidencia); if (r.severidade === 'alta') ja.severidade = 'alta'; }
  }
  return [...porTipo.values()].sort((a, b) => (a.severidade === 'alta' ? -1 : 1) - (b.severidade === 'alta' ? -1 : 1));
}
