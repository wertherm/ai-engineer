// Orçamento de IA com alerta e corte (OWASP LLM10 "Unbounded Consumption" + FinOps).
// Cada chamada ao LLM vira uma linha em m10.uso_llm; antes de chamar, consultamos o gasto do dia.
// Uso: node exemplos/05-custos-e-orcamento/orcamento.js
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? 'postgres://ia:ia@localhost:5433/ia' });
await db.connect();

// Preço por milhão de tokens (hipotético, mesmo do premissas.json) e orçamento diário por feature.
const PRECO = { entrada: 1.0, saida: 4.0 };
const ORCAMENTO_DIA_USD = { suporte: 5.0, resumo: 2.0 };
const ALERTA = 0.8; // avisa em 80%, corta em 100%
const COTA_USUARIO_DIA_USD = 0.25; // sem cota por usuário, UM abusador derruba a feature para todos

await db.query(`
  CREATE SCHEMA IF NOT EXISTS m10;
  DROP TABLE IF EXISTS m10.uso_llm;
  CREATE TABLE m10.uso_llm (
    id bigserial PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(),
    feature text NOT NULL,
    usuario text NOT NULL,
    tokens_entrada int NOT NULL,
    tokens_saida int NOT NULL,
    custo_usd numeric(12,6) NOT NULL
  );
  CREATE INDEX ON m10.uso_llm (feature, ts);`);

/** Consulta o gasto do dia e decide: liberar, liberar com alerta, ou bloquear. */
async function verificarOrcamento(feature) {
  const { rows } = await db.query(
    `SELECT coalesce(sum(custo_usd), 0)::float AS gasto FROM m10.uso_llm
     WHERE feature = $1 AND ts >= date_trunc('day', now())`,
    [feature],
  );
  const fracao = rows[0].gasto / ORCAMENTO_DIA_USD[feature];
  return { gasto: rows[0].gasto, fracao, estado: fracao >= 1 ? 'BLOQUEADO' : fracao >= ALERTA ? 'ALERTA' : 'ok' };
}

async function gastoDoUsuario(usuario) {
  const { rows } = await db.query(
    `SELECT coalesce(sum(custo_usd), 0)::float AS gasto FROM m10.uso_llm
     WHERE usuario = $1 AND ts >= date_trunc('day', now())`,
    [usuario],
  );
  return rows[0].gasto;
}

async function registrar(feature, usuario, tokensEntrada, tokensSaida) {
  const custo = (tokensEntrada * PRECO.entrada + tokensSaida * PRECO.saida) / 1e6;
  await db.query(
    'INSERT INTO m10.uso_llm (feature, usuario, tokens_entrada, tokens_saida, custo_usd) VALUES ($1,$2,$3,$4,$5)',
    [feature, usuario, tokensEntrada, tokensSaida, custo],
  );
}

// Simulação determinística: o "suporte" recebe tráfego normal e, a partir da chamada 1200,
// um usuário entra em loop (agente mal configurado ou abuso) mandando prompts enormes, misturado
// ao tráfego legítimo (1 em cada 3 chamadas continua sendo de clientes normais).
const comCota = process.argv.includes('--com-cota');
console.log(`Cenário: orçamento por feature${comCota ? ' + cota por usuário' : ' (sem cota por usuário)'}`);
let estadoAnterior = 'ok';
let bloqueadas = 0;
let legitimasBloqueadas = 0;
let barradasPorCota = 0;
for (let i = 1; i <= 2000; i++) {
  const emLoop = i >= 1200 && i % 3 !== 0;
  const usuario = emLoop ? 'u-loop' : `u-${i % 50}`;
  const v = await verificarOrcamento('suporte');
  if (v.estado !== estadoAnterior) {
    console.log(`chamada ${String(i).padStart(4)}: ${v.estado.padEnd(9)} gasto US$ ${v.gasto.toFixed(4)} (${(100 * v.fracao).toFixed(0)}% do orçamento)`);
    estadoAnterior = v.estado;
  }
  if (v.estado === 'BLOQUEADO') {
    bloqueadas++;
    if (!emLoop) legitimasBloqueadas++; // resposta degradada: "tente mais tarde" ou fila para humano; nada é cobrado
    continue;
  }
  if (comCota && (await gastoDoUsuario(usuario)) >= COTA_USUARIO_DIA_USD) {
    barradasPorCota++; // só este usuário é barrado; os outros seguem atendidos
    continue;
  }
  await registrar('suporte', usuario, emLoop ? 8000 : 1500, emLoop ? 600 : 250);
}
await registrar('resumo', 'u-1', 3000, 400);

console.log(`\nChamadas bloqueadas pelo orçamento da feature: ${bloqueadas} (${legitimasBloqueadas} de clientes legítimos) · barradas pela cota do usuário: ${barradasPorCota}`);
const { rows } = await db.query(`
  SELECT feature, usuario, count(*)::int AS chamadas, sum(custo_usd)::float AS usd
  FROM m10.uso_llm WHERE ts >= date_trunc('day', now())
  GROUP BY feature, usuario ORDER BY usd DESC LIMIT 3`);
console.log('Quem mais gastou hoje (por feature e usuário):');
for (const r of rows) console.log(`  ${r.feature.padEnd(8)} ${r.usuario.padEnd(7)} ${String(r.chamadas).padStart(5)} chamadas  US$ ${r.usd.toFixed(4)}`);
for (const f of Object.keys(ORCAMENTO_DIA_USD)) {
  const v = await verificarOrcamento(f);
  console.log(`Orçamento ${f.padEnd(8)}: US$ ${v.gasto.toFixed(4)} de ${ORCAMENTO_DIA_USD[f].toFixed(2)} -> ${v.estado}`);
}
await db.end();
