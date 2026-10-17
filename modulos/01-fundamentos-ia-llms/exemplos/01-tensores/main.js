// Exemplo 01 — Tensores com @tensorflow/tfjs puro (sem tfjs-node, que quebra no Node 24).
// Tensor = array N-dimensional com shape e dtype. Toda rede neural é "só" operações entre tensores.
import * as tf from '@tensorflow/tfjs';

await tf.setBackend('cpu'); // no Node puro o backend disponível é o 'cpu' (JS)
console.log('Backend:', tf.getBackend(), '| versão tfjs:', tf.version.tfjs);

// 1) Rank (número de eixos) e shape
const escalar = tf.scalar(3.5);                       // rank 0
const vetor = tf.tensor1d([1, 2, 3]);                 // rank 1, shape [3]
const matriz = tf.tensor2d([[1, 2], [3, 4], [5, 6]]); // rank 2, shape [3, 2]
// Um "lote" de 2 imagens 4x4 RGB: [batch, altura, largura, canais]
const imagens = tf.zeros([2, 4, 4, 3]);
for (const [nome, t] of Object.entries({ escalar, vetor, matriz, imagens })) {
  console.log(`${nome.padEnd(8)} rank=${t.rank} shape=[${t.shape}] dtype=${t.dtype} elementos=${t.size}`);
}

// 2) Operações elemento a elemento e broadcasting:
// somar um vetor [2] a uma matriz [3,2] "estica" o vetor nas 3 linhas.
console.log('\nmatriz + [10, 100] (broadcasting):');
matriz.add(tf.tensor1d([10, 100])).print();

// 3) Produto de matrizes = o coração de uma camada densa: saída = entrada · W + b
const entrada = tf.tensor2d([[1, 0, 2]]);            // 1 exemplo com 3 features
const W = tf.tensor2d([[0.5, -1], [1, 1], [0.25, -2]]); // pesos 3 -> 2 neurônios
const b = tf.tensor1d([0.1, -0.1]);
const camada = entrada.matMul(W).add(b);
console.log('\nCamada densa  x·W + b =', await camada.array());
console.log('Depois da ReLU        =', await camada.relu().array());

// 4) Reshape não copia dados: só muda a "visão" dos mesmos números
const seq = tf.range(0, 12);
console.log('\nrange(0,12).reshape([3,4]):');
seq.reshape([3, 4]).print();

// 5) Gradiente automático: é assim que a rede "aprende" (ver exemplo 02).
// f(x) = x² + 3x  ->  f'(x) = 2x + 3  ->  f'(2) = 7
const df = tf.grad((x) => x.square().add(x.mul(3)));
console.log('Derivada de x²+3x em x=2:', (await df(tf.scalar(2)).data())[0]);

// 6) Memória: tf.tidy libera os tensores intermediários criados dentro da função
const antes = tf.memory().numTensors;
const media = tf.tidy(() => tf.randomNormal([1000, 100], 0, 1, "float32", 42).mean());
console.log(`\nMédia de 100k amostras N(0,1): ${(await media.data())[0].toFixed(3)}`);
console.log(`Tensores vivos: antes=${antes} depois=${tf.memory().numTensors} (tidy liberou os intermediários)`);
