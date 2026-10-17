import { readFileSync } from 'node:fs';
import { detectarRiscos } from './detector.js';

const historico = JSON.parse(readFileSync(new URL('./historico-sprints.json', import.meta.url), 'utf8'));

console.log(`Analisando sprint ${historico.at(-1).sprint} contra ${historico.length - 1} sprints anteriores\n`);
for (const r of detectarRiscos(historico)) {
  console.log(`[${r.severidade.toUpperCase()}] risco de ${r.tipo}`);
  r.evidencia.forEach((e) => console.log(`   evidência: ${e}`));
  console.log(`   mitigação: ${r.mitigacao}`);
}

// Comparação: a sprint 6 (saudável) não deve gerar alerta nenhum.
console.log('\nSprint 6 (controle):', detectarRiscos(historico.slice(0, 6)).length, 'risco(s)');
