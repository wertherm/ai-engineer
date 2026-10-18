"""Rede neural densa (MLP) em NumPy puro, com forward, backprop e Adam escritos à mão.

É o que `tf.sequential` + `model.fit` fazem por baixo dos panos no JS. Escrever à mão mostra que
"treinar" é só: prever (forward) -> medir o erro (loss) -> derivar (backward) -> ajustar (otimizador).

- Camadas ocultas: ReLU.
- Saída com 1 neurônio: sigmoid + binary cross-entropy (classificação binária).
- Saída com k > 1 neurônios: softmax + categorical cross-entropy (multiclasse).
Nas duas combinações a derivada da loss em relação à saída ANTES da ativação é a mesma: (p - y) / N.
"""

import numpy as np

EPS = 1e-7  # mesmo epsilon do TF.js: evita log(0) e divisão por zero


def glorot_uniform(fan_in: int, fan_out: int, seed: int) -> np.ndarray:
    """Inicialização Glorot/Xavier uniforme (a padrão do TF.js), com semente própria por camada."""
    limite = np.sqrt(6 / (fan_in + fan_out))
    return np.random.default_rng(seed).uniform(-limite, limite, size=(fan_in, fan_out))


class MLP:
    def __init__(self, entradas: int, ocultas: list[int], saidas: int, seeds: list[int]):
        tamanhos = [entradas, *ocultas, saidas]
        self.W = [glorot_uniform(a, b, s) for a, b, s in zip(tamanhos, tamanhos[1:], seeds)]
        self.b = [np.zeros(b) for b in tamanhos[1:]]  # bias começa em zero (padrão do TF.js)
        self.saidas = saidas

    def contar_parametros(self) -> int:
        return sum(w.size + b.size for w, b in zip(self.W, self.b))

    # ---------- forward ----------
    def _forward(self, x: np.ndarray) -> list[np.ndarray]:
        """Devolve as ativações de cada camada (precisamos delas no backward)."""
        ativ = [x]
        for i, (w, b) in enumerate(zip(self.W, self.b)):
            z = ativ[-1] @ w + b  # camada densa: x·W + b (o mesmo do exemplo 01)
            if i < len(self.W) - 1:
                ativ.append(np.maximum(z, 0))  # ReLU
            elif self.saidas == 1:
                ativ.append(1 / (1 + np.exp(-z)))  # sigmoid
            else:
                e = np.exp(z - z.max(axis=1, keepdims=True))  # softmax estável (subtrai o máximo)
                ativ.append(e / e.sum(axis=1, keepdims=True))
        return ativ

    def prever(self, x) -> np.ndarray:
        return self._forward(np.asarray(x, dtype=float))[-1]

    # ---------- loss e métrica ----------
    def loss(self, p: np.ndarray, y: np.ndarray) -> float:
        p = np.clip(p, EPS, 1 - EPS)
        if self.saidas == 1:
            return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
        return float(-np.mean(np.sum(y * np.log(p), axis=1)))

    def acuracia(self, p: np.ndarray, y: np.ndarray) -> float:
        if self.saidas == 1:
            return float(np.mean((p >= 0.5) == (y >= 0.5)))
        return float(np.mean(p.argmax(axis=1) == y.argmax(axis=1)))

    def avaliar(self, x, y) -> tuple[float, float]:
        p = self.prever(x)
        return self.loss(p, y), self.acuracia(p, y)

    # ---------- backward ----------
    def _gradientes(self, ativ: list[np.ndarray], y: np.ndarray):
        n = y.shape[0]
        delta = (ativ[-1] - y) / n  # dL/dz da saída (sigmoid+BCE ou softmax+CCE)
        gW, gb = [], []
        for i in reversed(range(len(self.W))):
            gW.insert(0, ativ[i].T @ delta)  # regra da cadeia: dL/dW = entrada^T · delta
            gb.insert(0, delta.sum(axis=0))
            if i > 0:
                delta = (delta @ self.W[i].T) * (ativ[i] > 0)  # volta pela ReLU (derivada 0 ou 1)
        return gW, gb

    # ---------- treino ----------
    def treinar(self, x, y, epocas: int, lr: float, batch: int = 32, validacao=None, ao_fim_da_epoca=None):
        """Mini-batch + Adam (beta1=0.9, beta2=0.999, os defaults do TF.js). Sem embaralhar: reprodutível.

        Como no TF.js, loss/acc de treino são a média dos lotes ao longo da época.
        """
        x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
        params = self.W + self.b
        m = [np.zeros_like(p) for p in params]
        v = [np.zeros_like(p) for p in params]
        b1, b2, passo = 0.9, 0.999, 0
        historico = []
        for epoca in range(epocas):
            soma_loss = soma_acc = 0.0
            for ini in range(0, len(x), batch):
                xb, yb = x[ini : ini + batch], y[ini : ini + batch]
                ativ = self._forward(xb)
                soma_loss += self.loss(ativ[-1], yb) * len(xb)
                soma_acc += self.acuracia(ativ[-1], yb) * len(xb)
                gW, gb = self._gradientes(ativ, yb)
                passo += 1
                for j, (p, g) in enumerate(zip(params, gW + gb)):
                    m[j] = b1 * m[j] + (1 - b1) * g  # média móvel do gradiente (momento)
                    v[j] = b2 * v[j] + (1 - b2) * g * g  # média móvel do gradiente² (escala)
                    m_hat = m[j] / (1 - b1**passo)  # correção de viés dos primeiros passos
                    v_hat = v[j] / (1 - b2**passo)
                    p -= lr * m_hat / (np.sqrt(v_hat) + EPS)  # atualização IN-PLACE (W e b são os mesmos objetos)
            logs = {"loss": soma_loss / len(x), "acc": soma_acc / len(x)}
            if validacao is not None:
                logs["val_loss"], logs["val_acc"] = self.avaliar(*validacao)
            historico.append(logs)
            if ao_fim_da_epoca:
                ao_fim_da_epoca(epoca, logs)
        return historico
