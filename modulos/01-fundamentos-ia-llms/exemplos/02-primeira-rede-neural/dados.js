// Geração de dados sintéticos reprodutíveis (mesma semente => mesmos números).
// Separado em módulo para o exercício 01 reaproveitar.

// PRNG mulberry32: Math.random não aceita semente, e sem semente o resultado muda a cada execução.
export function criarRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Problema: dado um ponto (x, y) no quadrado [-1, 1]², ele está DENTRO do círculo de raio 0.6?
// Não é linearmente separável: uma reta não resolve, a camada oculta é necessária.
export function gerarCirculo(n, rng, raio = 0.6) {
  const xs = [];
  const ys = [];
  for (let i = 0; i < n; i++) {
    const x = rng() * 2 - 1;
    const y = rng() * 2 - 1;
    xs.push([x, y]);
    ys.push(x * x + y * y < raio * raio ? 1 : 0);
  }
  return { xs, ys };
}

// Divide em treino/validação/teste. Validação guia decisões (épocas, arquitetura);
// teste só é olhado no fim, para medir de forma honesta.
export function dividir({ xs, ys }, fracTreino = 0.7, fracVal = 0.15) {
  const n = xs.length;
  const a = Math.floor(n * fracTreino);
  const b = Math.floor(n * (fracTreino + fracVal));
  const fatia = (i, j) => ({ xs: xs.slice(i, j), ys: ys.slice(i, j) });
  return { treino: fatia(0, a), validacao: fatia(a, b), teste: fatia(b, n) };
}
