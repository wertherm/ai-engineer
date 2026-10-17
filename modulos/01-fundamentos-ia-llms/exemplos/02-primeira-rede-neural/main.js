// Exemplo 02 — Primeira rede neural do zero em JS: dados -> treino -> validação -> inferência.
import * as tf from '@tensorflow/tfjs';
import { criarRng, gerarCirculo, dividir } from './dados.js';

await tf.setBackend('cpu');
const SEED = 7;

// ---------- 1. DADOS ----------
const rng = criarRng(SEED);
const { treino, validacao, teste } = dividir(gerarCirculo(1000, rng));
const positivos = treino.ys.filter((y) => y === 1).length;
console.log(`[dados] treino=${treino.xs.length} validação=${validacao.xs.length} teste=${teste.xs.length}`);
console.log(`[dados] classe 1 (dentro do círculo) no treino: ${(100 * positivos / treino.ys.length).toFixed(1)}%`);
// Baseline: chutar sempre a classe majoritária. A rede precisa bater isso para valer algo.
const baseline = Math.max(positivos, treino.ys.length - positivos) / treino.ys.length;
console.log(`[dados] baseline (sempre a classe majoritária): ${(100 * baseline).toFixed(1)}%`);

const paraTensor = ({ xs, ys }) => ({ x: tf.tensor2d(xs), y: tf.tensor2d(ys, [ys.length, 1]) });
const tr = paraTensor(treino);
const va = paraTensor(validacao);
const te = paraTensor(teste);

// ---------- 2. MODELO ----------
// 2 entradas -> 16 neurônios ReLU -> 1 saída sigmoid (probabilidade de estar dentro).
const init = (s) => tf.initializers.glorotUniform({ seed: s }); // pesos iniciais reprodutíveis
const model = tf.sequential({
  layers: [
    tf.layers.dense({ inputShape: [2], units: 16, activation: 'relu', kernelInitializer: init(1) }),
    tf.layers.dense({ units: 1, activation: 'sigmoid', kernelInitializer: init(2) }),
  ],
});
// binaryCrossentropy mede "quão errada" está a probabilidade; adam ajusta os pesos pelo gradiente.
model.compile({ optimizer: tf.train.adam(0.05), loss: 'binaryCrossentropy', metrics: ['accuracy'] });
console.log(`[modelo] parâmetros treináveis: ${model.countParams()} (2·16+16 + 16·1+1)`);

// ---------- 3. TREINO (+ validação a cada época) ----------
const inicio = Date.now();
await model.fit(tr.x, tr.y, {
  epochs: 60,
  batchSize: 32,
  shuffle: false, // dados já vêm embaralhados; false deixa o resultado reprodutível
  validationData: [va.x, va.y],
  callbacks: {
    onEpochEnd: (epoch, logs) => {
      if ((epoch + 1) % 10 === 0 || epoch === 0) {
        console.log(
          `[treino] época ${String(epoch + 1).padStart(2)} loss=${logs.loss.toFixed(4)} acc=${logs.acc.toFixed(3)}` +
            ` | val_loss=${logs.val_loss.toFixed(4)} val_acc=${logs.val_acc.toFixed(3)}`,
        );
      }
    },
  },
});
console.log(`[treino] concluído em ${((Date.now() - inicio) / 1000).toFixed(1)}s`);

// ---------- 4. AVALIAÇÃO FINAL NO TESTE (dados nunca vistos) ----------
const [lossTeste, accTeste] = model.evaluate(te.x, te.y).map((t) => t.dataSync()[0]);
const prob = model.predict(te.x).dataSync();
let vp = 0, fp = 0, fn = 0, vn = 0;
teste.ys.forEach((real, i) => {
  const prev = prob[i] >= 0.5 ? 1 : 0;
  if (prev === 1 && real === 1) vp++;
  else if (prev === 1 && real === 0) fp++;
  else if (prev === 0 && real === 1) fn++;
  else vn++;
});
console.log(`[teste] loss=${lossTeste.toFixed(4)} acurácia=${(100 * accTeste).toFixed(1)}%`);
console.log(`[teste] matriz de confusão: VP=${vp} FP=${fp} FN=${fn} VN=${vn}`);
console.log(`[teste] precisão=${(vp / (vp + fp)).toFixed(3)} recall=${(vp / (vp + fn)).toFixed(3)}`);

// ---------- 5. INFERÊNCIA em pontos novos ----------
const novos = [[0, 0], [0.3, 0.3], [0.5, 0.5], [0.9, -0.9], [0.59, 0]];
const p = model.predict(tf.tensor2d(novos)).dataSync();
novos.forEach(([x, y], i) => {
  const real = x * x + y * y < 0.36 ? 'dentro' : 'fora';
  console.log(`[inferência] (${x}, ${y}) -> P(dentro)=${p[i].toFixed(3)} | resposta certa: ${real}`);
});

// Salvar/carregar: no Node puro não há 'file://' (isso é do tfjs-node); use tf.io.withSaveHandler
// ou, no browser, model.save('localstorage://circulo').
