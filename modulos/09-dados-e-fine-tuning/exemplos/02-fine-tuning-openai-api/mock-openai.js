// Mock MÍNIMO dos endpoints de files + fine_tuning.jobs da OpenAI, só para exercitar o fluxo do
// fine-tune-openai.js localmente (upload -> job -> polling -> eventos -> checkpoints) sem conta e sem custo.
// Não treina nada: o job "avança" um estado a cada consulta. Porta 30901.
import http from 'node:http';

const PORTA = Number(process.env.PORTA ?? 30901);
const ESTADOS = ['validating_files', 'queued', 'running', 'running', 'succeeded'];
let arquivos = 0;
const jobs = new Map();

const json = (res, status, corpo) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(corpo)); };
const lerCorpo = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); });

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const corpo = await lerCorpo(req);
  if (req.method === 'POST' && url.pathname === '/v1/files') {
    // multipart/form-data: confere só que veio o purpose certo
    if (!corpo.includes('fine-tune')) return json(res, 400, { error: { message: 'purpose inválido' } });
    return json(res, 200, { id: `file-mock${++arquivos}`, object: 'file', purpose: 'fine-tune', bytes: corpo.length, status: 'processed' });
  }
  if (req.method === 'POST' && url.pathname === '/v1/fine_tuning/jobs') {
    const p = JSON.parse(corpo);
    const job = { id: `ftjob-mock${jobs.size + 1}`, object: 'fine_tuning.job', model: p.model, method: p.method, passo: 0, fine_tuned_model: null, trained_tokens: null };
    jobs.set(job.id, job);
    return json(res, 200, { ...job, status: ESTADOS[0] });
  }
  const m = url.pathname.match(/^\/v1\/fine_tuning\/jobs\/([^/]+)(\/events|\/checkpoints)?$/);
  const job = m && jobs.get(m[1]);
  if (!job) return json(res, 404, { error: { message: 'não encontrado' } });
  const status = ESTADOS[Math.min(job.passo, ESTADOS.length - 1)];
  if (!m[2]) {
    job.passo++;
    const fim = status === 'succeeded';
    return json(res, 200, { ...job, status, fine_tuned_model: fim ? `ft:${job.model}:mock:suporte:abc123` : null, trained_tokens: fim ? 35529 : null });
  }
  if (m[2] === '/events') {
    const data = [{ id: `ev-${job.passo}`, object: 'fine_tuning.job.event', created_at: Math.floor(Date.now() / 1000), level: 'info', message: `Etapa: ${status}`, type: 'message' }];
    if (status === 'running') data.unshift({ id: `ev-m${job.passo}`, object: 'fine_tuning.job.event', created_at: Math.floor(Date.now() / 1000), level: 'info', message: `Step ${job.passo * 10}/66`, type: 'metrics', data: { step: job.passo * 10, train_loss: +(2 / job.passo).toFixed(3) } });
    return json(res, 200, { object: 'list', data, has_more: false });
  }
  return json(res, 200, { object: 'list', has_more: false, data: [1, 2, 3].map((e) => ({ id: `ckpt-${e}`, object: 'fine_tuning.job.checkpoint', step_number: e * 22, fine_tuned_model_checkpoint: `ft:${job.model}:mock:suporte:abc123:ckpt-step-${e * 22}`, metrics: { full_valid_loss: +(0.5 / e).toFixed(3) } })) });
});

servidor.listen(PORTA, () => console.log(`mock da API de fine-tuning em http://localhost:${PORTA}/v1`));
