// Cronograma determinístico: ordenação topológica, CPM (caminho crítico), carga por pessoa e Monte Carlo.

// Ordem topológica (Kahn). Ciclo de dependência = erro de planejamento, não deixa passar.
export function ordemTopologica(tarefas) {
  const grau = new Map(tarefas.map((t) => [t.id, t.dependeDe.length]));
  const fila = tarefas.filter((t) => t.dependeDe.length === 0).map((t) => t.id);
  const ordem = [];
  while (fila.length) {
    const id = fila.shift();
    ordem.push(id);
    for (const t of tarefas) if (t.dependeDe.includes(id)) {
      grau.set(t.id, grau.get(t.id) - 1);
      if (grau.get(t.id) === 0) fila.push(t.id);
    }
  }
  if (ordem.length !== tarefas.length) throw new Error('Ciclo de dependências detectado');
  return ordem;
}

// CPM: ES/EF na ida, LS/LF na volta; folga = LS - ES; folga zero = caminho crítico.
// `duracao` é uma função para reaproveitar o mesmo CPM com durações sorteadas no Monte Carlo.
export function cpm(tarefas, duracao = (t) => t.provavel) {
  const porId = Object.fromEntries(tarefas.map((t) => [t.id, t]));
  const ordem = ordemTopologica(tarefas);
  const r = {};
  for (const id of ordem) {
    const t = porId[id];
    const es = Math.max(0, ...t.dependeDe.map((d) => r[d].ef));
    r[id] = { es, ef: es + duracao(t) };
  }
  const fim = Math.max(...Object.values(r).map((x) => x.ef));
  for (const id of [...ordem].reverse()) {
    const sucessores = tarefas.filter((t) => t.dependeDe.includes(id));
    const lf = Math.min(fim, ...sucessores.map((s) => r[s.id].ls));
    r[id].lf = lf;
    r[id].ls = lf - (r[id].ef - r[id].es);
    r[id].folga = r[id].ls - r[id].es;
  }
  return { fim, tarefas: r, critico: ordem.filter((id) => r[id].folga === 0) };
}

// As estimativas são em dias de ESFORÇO. Quem trabalha meio período leva o dobro em dias de CALENDÁRIO.
export function emDiasCorridos(tarefas, pessoas) {
  return tarefas.map((t) => {
    const cap = pessoas[t.dono];
    return { ...t, otimista: t.otimista / cap, provavel: t.provavel / cap, pessimista: t.pessimista / cap };
  });
}

// Carga por pessoa em dias de calendário. Se passa do fim do projeto, a pessoa é gargalo (balancear).
export function cargaPorPessoa(tarefasCorridas) {
  const carga = {};
  for (const t of tarefasCorridas) carga[t.dono] = (carga[t.dono] ?? 0) + t.provavel;
  return carga;
}

// Gerador pseudoaleatório com semente: o Monte Carlo fica reprodutível (mesma saída a cada execução).
export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Amostra de uma distribuição triangular (otimista, provável, pessimista) por inversão da CDF.
export function triangular(rand, a, m, b) {
  const u = rand();
  const c = (m - a) / (b - a);
  return u < c ? a + Math.sqrt(u * (b - a) * (m - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - m));
}

export const percentil = (ordenado, p) => ordenado[Math.min(ordenado.length - 1, Math.ceil((p / 100) * ordenado.length) - 1)];

// Monte Carlo de DURAÇÃO: sorteia cada tarefa e roda o CPM N vezes.
export function monteCarloDuracao(tarefas, n = 10_000, seed = 42) {
  const rand = mulberry32(seed);
  const fins = [];
  const vezesCritica = Object.fromEntries(tarefas.map((t) => [t.id, 0]));
  for (let i = 0; i < n; i++) {
    const r = cpm(tarefas, (t) => triangular(rand, t.otimista, t.provavel, t.pessimista));
    fins.push(r.fim);
    r.critico.forEach((id) => vezesCritica[id]++);
  }
  fins.sort((a, b) => a - b);
  return { p50: percentil(fins, 50), p85: percentil(fins, 85), p95: percentil(fins, 95), vezesCritica };
}

// Monte Carlo de THROUGHPUT (#NoEstimates): sorteia semanas do histórico até zerar o backlog.
export function monteCarloThroughput(historico, restantes, n = 10_000, seed = 7) {
  const rand = mulberry32(seed);
  const semanas = [];
  for (let i = 0; i < n; i++) {
    let falta = restantes, s = 0;
    while (falta > 0) { falta -= historico[Math.floor(rand() * historico.length)]; s++; }
    semanas.push(s);
  }
  semanas.sort((a, b) => a - b);
  return { p50: percentil(semanas, 50), p85: percentil(semanas, 85), p95: percentil(semanas, 95) };
}

// Converte dias úteis a partir da data de início (pula sábado e domingo).
export function somarDiasUteis(inicioIso, dias) {
  const d = new Date(`${inicioIso}T12:00:00Z`);
  let falta = Math.ceil(dias);
  while (falta > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) falta--;
  }
  return d.toISOString().slice(0, 10);
}
