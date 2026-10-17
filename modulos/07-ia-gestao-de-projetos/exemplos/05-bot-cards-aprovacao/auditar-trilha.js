// Auditoria da trilha de decisões do bot: lista as linhas e recalcula a cadeia de hashes.
import { pool, verificarTrilha } from './trilha.js';

const { rows } = await pool.query("SELECT id, to_char(criado_em, 'HH24:MI:SS') hora, operacao->>'acao' acao, operacao->>'card' card, status, motivo, left(hash, 10) hash FROM m07.trilha_bot ORDER BY id");
console.table(rows);
const r = await verificarTrilha();
console.log(r.ok ? `✅ cadeia íntegra (${r.total} linhas)` : `❌ cadeia quebrada na linha ${r.linha}: alguém editou a trilha`);
await pool.end();
process.exit(r.ok ? 0 : 1);
