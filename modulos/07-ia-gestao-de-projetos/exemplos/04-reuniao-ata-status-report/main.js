// Reunião turbinada: transcrição -> ata (decisões, pendências, ações) -> .ics -> status report para 3 públicos.
import { readFileSync, writeFileSync } from 'node:fs';
import { extrairJson, gerarTexto } from '../../lib/llm.js';
import { criarSchemaAta, calendario, participantes, validarAta, gerarIcs } from './ata.js';
import { metricasSprint, PUBLICOS, numerosSemLastro } from './status.js';

const aqui = (f) => new URL(f, import.meta.url);
const transcricao = readFileSync(aqui('./transcricao.txt'), 'utf8');
const sprint = JSON.parse(readFileSync(aqui('./sprint.json'), 'utf8'));

// 1) Ata: o código descobre participantes e datas possíveis e monta o schema com enums.
const nomes = participantes(transcricao);
const cal = calendario('2026-11-02');
const ata = await extrairJson({
  schema: criarSchemaAta(nomes, cal.map((c) => c.iso)),
  nome: 'ata',
  system: `Extraia a ata da reunião em português. Só registre o que foi dito; ação é o que alguém assumiu fazer.
Calendário: ${cal.map((c) => `${c.iso}=${c.dia}`).join(', ')}.`,
  user: transcricao,
  maxTokens: 500,
});
console.log('Decisões:'); ata.decisoes.forEach((d) => console.log('  •', d));
console.log('Pendências:'); ata.pendencias.forEach((d) => console.log('  •', d));
console.log('Ações:'); ata.acoes.forEach((a) => console.log(`  • [${a.responsavel}] ${a.tarefa} — ${a.prazo}`));

const problemas = validarAta(ata, nomes);
console.log(`\nValidação (participantes: ${nomes.join(', ')}):`, problemas.length ? problemas : 'ok');
if (problemas.length) process.exit(1); // nada vai para o calendário com dado inválido

writeFileSync(aqui('./acoes.ics'), gerarIcs(ata.acoes));
console.log('Calendário: exemplos/04-reuniao-ata-status-report/acoes.ics');

// 2) Status report: números prontos, texto por público.
const m = metricasSprint(sprint);
console.log(`\nMétricas (código): entrega ${m.entregaPct}% com ${m.tempoPct}% do tempo · CPI ${m.cpi} · semáforo ${m.semaforo.toUpperCase()}`);
const fatos = JSON.stringify({ ...sprint, ...m, decisoes: ata.decisoes, acoes: ata.acoes });

for (const [publico, instrucao] of Object.entries(PUBLICOS)) {
  const texto = await gerarTexto({
    system: `Escreva um status report curto (máx. 3 frases) em português para o público: ${instrucao}. Use só os fatos do JSON.`,
    user: fatos,
    maxTokens: 140,
  });
  console.log(`\n--- ${publico.toUpperCase()} ---\n${texto}`);
  const suspeitos = numerosSemLastro(texto, fatos);
  if (suspeitos.length) console.log(`  ⚠ números sem lastro nos fatos: ${suspeitos.join(', ')}`);
}
