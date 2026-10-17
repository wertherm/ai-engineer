// Solução do exercício 01 — classificar 3 espirais entrelaçadas (multiclasse, não linear).
// Diferenças em relação ao exemplo 02: saída softmax com 3 neurônios, rótulos one-hot,
// categoricalCrossentropy, e comparação de arquiteturas usando SÓ a validação para escolher.
import * as tf from '@tensorflow/tfjs';
import { criarRng } from '../../../exemplos/02-primeira-rede-neural/dados.js';

await tf.setBackend('cpu');
const CLASSES = 3;

// Espiral clássica (CS231n): cada classe é um "braço" girado 120°, com ruído.
function gerarEspirais(porClasse, rng) {
  const pts = [];
  for (let c = 0; c < CLASSES; c++) {
    for (let i = 0; i < porClasse; i++) {
      const r = i / porClasse; // raio de 0 a 1
      const theta = c * ((2 * Math.PI) / CLASSES) + r * 4 + (rng() - 0.5) * 0.4;
      pts.push({ x: [r * Math.sin(theta), r * Math.cos(theta)], y: c });
    }
  }
  // Embaralha (Fisher-Yates) com o rng semeado: sem isso, treino teria só as classes 0 e 1.
  for (let i = pts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pts[i], pts[j]] = [pts[j], pts[i]];
  }
  return pts;
}

const pts = gerarEspirais(200, criarRng(123));
const corte1 = Math.floor(pts.length * 0.7), corte2 = Math.floor(pts.length * 0.85);
const tensores = (lista) => ({
  x: tf.tensor2d(lista.map((p) => p.x)),
  y: tf.oneHot(tf.tensor1d(lista.map((p) => p.y), 'int32'), CLASSES), // 2 -> [0,0,1]
});
const tr = tensores(pts.slice(0, corte1));
const va = tensores(pts.slice(corte1, corte2));
const te = tensores(pts.slice(corte2));
console.log(`treino=${corte1} validação=${corte2 - corte1} teste=${pts.length - corte2} | baseline (chute) ≈ 33.3%`);

function criarModelo(ocultas) {
  const init = (s) => tf.initializers.glorotUniform({ seed: s });
  const model = tf.sequential();
  ocultas.forEach((units, i) =>
    model.add(tf.layers.dense({ units, activation: 'relu', kernelInitializer: init(i + 1), ...(i === 0 ? { inputShape: [2] } : {}) })),
  );
  // Sem camadas ocultas, a própria saída é a primeira camada e precisa do inputShape.
  model.add(tf.layers.dense({ units: CLASSES, activation: 'softmax', kernelInitializer: init(99), ...(ocultas.length ? {} : { inputShape: [2] }) }));
  model.compile({ optimizer: tf.train.adam(0.02), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  return model;
}

// Compara arquiteturas: a escolha é feita pela acurácia de VALIDAÇÃO, nunca pelo teste.
const candidatos = { 'sem oculta (linear)': [], '1x16': [16], '2x32': [32, 32] };
let melhor = null;
for (const [nome, ocultas] of Object.entries(candidatos)) {
  const model = criarModelo(ocultas);
  const h = await model.fit(tr.x, tr.y, { epochs: 150, batchSize: 32, shuffle: false, validationData: [va.x, va.y], verbose: 0 });
  const valAcc = h.history.val_acc.at(-1);
  console.log(`${nome.padEnd(20)} params=${String(model.countParams()).padStart(5)} acc_treino=${h.history.acc.at(-1).toFixed(3)} acc_val=${valAcc.toFixed(3)}`);
  if (!melhor || valAcc > melhor.valAcc) melhor = { nome, model, valAcc };
}

// Só agora, com a arquitetura escolhida, olhamos o teste.
const accTeste = melhor.model.evaluate(te.x, te.y)[1].dataSync()[0];
console.log(`\nescolhido pela validação: ${melhor.nome} -> acurácia no TESTE = ${(100 * accTeste).toFixed(1)}%`);

// Inferência: argMax da softmax = classe prevista
const novos = tf.tensor2d([[0, 0.5], [-0.5, -0.2], [0.3, -0.6]]);
const probs = melhor.model.predict(novos);
const classes = probs.argMax(1).dataSync();
const pa = probs.arraySync();
pa.forEach((p, i) => console.log(`ponto ${JSON.stringify(novos.arraySync()[i])} -> classe ${classes[i]} (probs ${p.map((v) => v.toFixed(2)).join(', ')})`));
