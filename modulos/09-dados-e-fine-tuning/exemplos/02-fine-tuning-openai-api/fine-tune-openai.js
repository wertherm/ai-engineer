// Automação de fine-tuning supervisionado na OpenAI com o SDK `openai` (Node):
// valida -> sobe os arquivos (files, purpose "fine-tune") -> cria o job (fine_tuning.jobs, method supervised)
// -> acompanha status + eventos de métricas -> lista checkpoints -> registra a versão do modelo.
//
// Modos:
//   --dry-run  (padrão, roda local SEM chave) valida o JSONL, calcula hashes e mostra o payload que seria enviado.
//   --executar (NÃO executado localmente: exige OPENAI_API_KEY de conta com acesso ao fine-tuning, que a OpenAI
//              está encerrando para novos usuários; ver docs/03) faz upload, cria o job e acompanha até o fim.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import OpenAI from 'openai';
import { DADOS, RAIZ } from '../../comum/config.js';
import { validarArquivo } from '../01-preparacao-de-dataset/validar-jsonl.js';

const executar = process.argv.includes('--executar');
const MODELO_BASE = process.env.MODELO_BASE_FT ?? 'gpt-4.1-nano-2025-04-14';
const ARQ_TREINO = path.join(DADOS, 'treino.jsonl');
const ARQ_VALID = path.join(DADOS, 'validacao.jsonl');

// Hiperparâmetros básicos. "auto" deixa a OpenAI escolher pelo tamanho do dataset; fixe para reprodutibilidade.
const HIPERPARAMETROS = { n_epochs: 3, batch_size: 'auto', learning_rate_multiplier: 'auto' };

const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const POLL_MS = Number(process.env.POLL_MS ?? 30_000); // 30 s é educado com a API; o mock usa menos

// 1. Validação local: barato e evita job "failed" depois do upload.
const validacoes = [validarArquivo(ARQ_TREINO), validarArquivo(ARQ_VALID)];
for (const v of validacoes) {
  console.log(`validação ${path.basename(v.caminho)}: ${v.exemplos} exemplos, ~${v.tokens} tokens, ${v.erros.length} erro(s)`);
  if (v.erros.length) { console.error(v.erros.slice(0, 5).join('\n')); process.exit(1); }
}

const versaoDataset = sha256(ARQ_TREINO).slice(0, 12); // o hash do dataset identifica a versão dos dados
const payloadJob = {
  model: MODELO_BASE,
  training_file: '<file-id do upload de treino>',
  validation_file: '<file-id do upload de validação>',
  suffix: `suporte-${versaoDataset.slice(0, 6)}`, // aparece no nome: ft:gpt-4.1-nano...:suporte-xxxxxx:<id>
  seed: 42,
  method: { type: 'supervised', supervised: { hyperparameters: HIPERPARAMETROS } },
  metadata: { dataset_sha256: versaoDataset, projeto: 'triagem-tickets' },
};

if (!executar) {
  console.log('\n[dry-run] nada foi enviado. Payload que seria usado em client.fineTuning.jobs.create():');
  console.log(JSON.stringify(payloadJob, null, 2));
  console.log('\nPara executar de verdade: OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_API_KEY=sk-... npm run ex02:openai -- --executar');
  process.exit(0);
}

// ---------------- daqui para baixo: NÃO executado localmente (exige conta OpenAI) ----------------
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'ollama') {
  console.error('Defina OPENAI_API_KEY de uma conta OpenAI com acesso ao fine-tuning.');
  process.exit(1);
}
const client = new OpenAI({ baseURL: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1' });
// Registro de modelos ("model card" mínimo, versionado em git). Rodando contra o mock local, vai para outro arquivo.
const REGISTRO = path.join(DADOS, client.baseURL.includes('localhost') ? 'registro-modelos.mock.jsonl' : 'registro-modelos.jsonl');

// 2. Upload: cada arquivo vira um File com purpose "fine-tune". A OpenAI valida o formato em background.
const subir = (f) => client.files.create({ file: fs.createReadStream(f), purpose: 'fine-tune' });
const [fTreino, fValid] = await Promise.all([subir(ARQ_TREINO), subir(ARQ_VALID)]);
console.log(`upload ok: treino=${fTreino.id} validação=${fValid.id}`);

// 3. Cria o job.
let job = await client.fineTuning.jobs.create({ ...payloadJob, training_file: fTreino.id, validation_file: fValid.id });
console.log(`job criado: ${job.id} (status ${job.status})`);

// 4. Polling: status + eventos novos (inclui eventos "metrics" com train_loss/valid_loss por passo).
const vistos = new Set();
const FINAIS = new Set(['succeeded', 'failed', 'cancelled']);
while (!FINAIS.has(job.status)) {
  await esperar(POLL_MS);
  job = await client.fineTuning.jobs.retrieve(job.id);
  const pagina = await client.fineTuning.jobs.listEvents(job.id, { limit: 50 });
  for (const ev of [...pagina.data].reverse()) { // a API devolve do mais novo para o mais antigo
    if (vistos.has(ev.id)) continue;
    vistos.add(ev.id);
    const extra = ev.type === 'metrics' ? ` ${JSON.stringify(ev.data)}` : '';
    console.log(`[${new Date(ev.created_at * 1000).toISOString()}] ${ev.level} ${ev.message}${extra}`);
  }
  console.log(`status=${job.status} trained_tokens=${job.trained_tokens ?? '-'}`);
}

if (job.status !== 'succeeded') {
  console.error(`job terminou em ${job.status}:`, job.error);
  process.exit(1);
}

// 5. Checkpoints (a OpenAI guarda os das 3 últimas épocas): escolha pelo menor valid_loss, não pelo último.
const checkpoints = [];
for await (const c of client.fineTuning.jobs.checkpoints.list(job.id)) checkpoints.push(c);
for (const c of checkpoints) console.log(`checkpoint passo ${c.step_number}: ${c.fine_tuned_model_checkpoint} ${JSON.stringify(c.metrics)}`);

// 6. Versionamento/documentação: uma linha por modelo treinado, com tudo para reproduzir e auditar.
const registro = {
  data: new Date().toISOString(), modelo: job.fine_tuned_model, base: MODELO_BASE, job: job.id,
  dataset_sha256: versaoDataset, arquivos: { treino: fTreino.id, validacao: fValid.id },
  hiperparametros: job.method?.supervised?.hyperparameters ?? HIPERPARAMETROS, trained_tokens: job.trained_tokens,
  checkpoints: checkpoints.map((c) => ({ passo: c.step_number, modelo: c.fine_tuned_model_checkpoint, metricas: c.metrics })),
};
fs.appendFileSync(REGISTRO, JSON.stringify(registro) + '\n');
console.log(`\nmodelo pronto: ${job.fine_tuned_model} (registrado em ${path.relative(RAIZ, REGISTRO)})`);
