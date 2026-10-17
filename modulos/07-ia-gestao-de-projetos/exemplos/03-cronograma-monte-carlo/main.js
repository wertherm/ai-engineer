// Cronograma dinâmico + previsão probabilística. Sem LLM: aqui a IA "de verdade" é estatística.
import { readFileSync } from 'node:fs';
import { cpm, emDiasCorridos, cargaPorPessoa, monteCarloDuracao, monteCarloThroughput, somarDiasUteis } from './cronograma.js';

const p = JSON.parse(readFileSync(new URL('./projeto.json', import.meta.url), 'utf8'));

// Converte esforço em dias de calendário pela capacidade de cada pessoa (carla = 0.5).
const tarefas = emDiasCorridos(p.tarefas, p.pessoas);
const base = cpm(tarefas);
console.log('== CPM com duração provável (dias úteis) ==');
console.table(Object.fromEntries(Object.entries(base.tarefas).map(([id, r]) => [id, { ES: r.es, EF: r.ef, folga: r.folga }])));
console.log(`Caminho crítico: ${base.critico.join(' → ')} | fim em ${base.fim} dias (${somarDiasUteis(p.inicio, base.fim)})`);

const carga = cargaPorPessoa(tarefas);
console.log('\nCarga em dias de calendário:', Object.entries(carga).map(([k, v]) => `${k}=${v}${v > base.fim ? ' (GARGALO)' : ''}`).join(' · '));

const mc = monteCarloDuracao(tarefas);
console.log('\n== Monte Carlo (10.000 cenários, durações triangulares) ==');
console.log(`P50=${mc.p50.toFixed(1)}d (${somarDiasUteis(p.inicio, mc.p50)}) · P85=${mc.p85.toFixed(1)}d (${somarDiasUteis(p.inicio, mc.p85)}) · P95=${mc.p95.toFixed(1)}d`);
console.log('% de cenários em que a tarefa foi crítica:', Object.entries(mc.vezesCritica).map(([k, v]) => `${k}=${Math.round(v / 100)}%`).join(' '));

// What-if 1: tirar a dependência T1→T4 (ex.: mockar a API de juros) encurta o projeto?
const semDep = tarefas.map((t) => (t.id === 'T4' ? { ...t, dependeDe: ['T2'] } : t));
const mc2 = monteCarloDuracao(semDep);
console.log(`\nWhat-if "T4 não depende de T1": P85 ${mc.p85.toFixed(1)}d → ${mc2.p85.toFixed(1)}d (T4 quase nunca é crítica: mexer nela não adianta)`);

// What-if 2 (balanceamento de capacidade): carla vai para tempo integral (0.5 → 1.0).
const mc3 = monteCarloDuracao(emDiasCorridos(p.tarefas, { ...p.pessoas, carla: 1.0 }));
console.log(`What-if "carla em tempo integral": P85 ${mc.p85.toFixed(1)}d → ${mc3.p85.toFixed(1)}d`);

const tp = monteCarloThroughput(p.throughputSemanalHistorico, p.itensRestantesNoBacklog);
console.log(`\n== Backlog de ${p.itensRestantesNoBacklog} itens pelo throughput histórico ==`);
console.log(`P50=${tp.p50} semanas · P85=${tp.p85} semanas · P95=${tp.p95} semanas`);
// Ajuste automático por previsão de carga: se a previsão estoura a data-alvo, o que cortar?
const semanasAlvo = 5;
const media = p.throughputSemanalHistorico.reduce((a, b) => a + b, 0) / p.throughputSemanalHistorico.length;
if (tp.p85 > semanasAlvo) {
  const cabe = Math.floor(media * semanasAlvo * 0.85); // margem de 15% por conservadorismo
  console.log(`Alvo ${semanasAlvo} semanas estoura no P85: sugerido cortar o escopo para ~${cabe} itens (média ${media.toFixed(1)}/semana).`);
}
