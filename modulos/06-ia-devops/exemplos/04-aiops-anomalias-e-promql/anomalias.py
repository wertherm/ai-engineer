"""AIOps sem LLM: detecção de anomalias (Isolation Forest) e forecasting de capacidade.

Gera métricas sintéticas com sazonalidade diária e anomalias INJETADAS (gabarito conhecido), compara
um limiar estático com o Isolation Forest em precisão/recall e projeta quando a CPU do nó estoura.
Saída: métricas no terminal + saida/dashboard.html (SVG estático, abre no navegador).
"""

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression
from sklearn.metrics import precision_score, recall_score

RNG = np.random.default_rng(42)
SAIDA = Path(__file__).parent / "saida"


def gerar_latencia(dias: int = 3) -> pd.DataFrame:
    """Latência p95 (ms) por minuto: pico diário às 14h + ruído + anomalias plantadas."""
    t = pd.date_range("2026-10-01", periods=dias * 1440, freq="min")
    hora = (t.hour + t.minute / 60).to_numpy()
    base = 120 + 60 * np.exp(-((hora - 14) ** 2) / 8)  # horário comercial mais lento (normal!)
    lat = base + RNG.normal(0, 6, len(t))
    rotulo = np.zeros(len(t), dtype=int)
    # Anomalias reais: 3 picos curtos FORA do horário de pico (altos para a hora, mas abaixo do pico
    # normal das 14h: um limiar fixo não os vê) e um incidente de 40 min no meio da manhã.
    for ini, dur, delta in [(200, 4, 55), (1700, 5, 55), (2600, 3, 60), (3500, 40, 70)]:
        lat[ini : ini + dur] += delta
        rotulo[ini : ini + dur] = 1
    return pd.DataFrame({"ts": t, "latencia_ms": lat, "anomalia": rotulo})


def features(df: pd.DataFrame) -> pd.DataFrame:
    """O segredo do AIOps não é o modelo, são as features: comparar com o 'normal daquele horário'."""
    minuto_do_dia = df.ts.dt.hour * 60 + df.ts.dt.minute
    # Perfil sazonal: mediana da latência para cada minuto do dia (robusta às anomalias).
    perfil = df.groupby(minuto_do_dia).latencia_ms.transform("median")
    residuo = df.latencia_ms - perfil
    return pd.DataFrame(
        {
            "residuo": residuo,
            "residuo_media5": residuo.rolling(5, min_periods=1).mean(),  # suaviza ruído de 1 ponto
            "derivada": df.latencia_ms.diff().fillna(0),
        }
    )


def avaliar(nome: str, y_true, y_pred) -> str:
    p = precision_score(y_true, y_pred, zero_division=0)
    r = recall_score(y_true, y_pred, zero_division=0)
    return f"{nome:<32} alertas={int(y_pred.sum()):>4}  precisão={p:.2f}  recall={r:.2f}"


def forecast_cpu() -> tuple[pd.DataFrame, pd.DataFrame, float, str]:
    """CPU do nó por hora em 21 dias, com tendência de alta. Regressão com tendência + Fourier."""
    t = pd.date_range("2026-09-10", periods=21 * 24, freq="h")
    x = np.arange(len(t))
    cpu = 38 + 0.045 * x + 12 * np.sin(2 * np.pi * (t.hour - 8) / 24) + RNG.normal(0, 2.5, len(t))
    df = pd.DataFrame({"ts": t, "cpu": cpu})

    def matriz(idx: np.ndarray, horas: np.ndarray) -> np.ndarray:
        ang = 2 * np.pi * horas / 24
        return np.column_stack([idx, np.sin(ang), np.cos(ang)])

    treino, teste = df.iloc[:-72], df.iloc[-72:]  # valida nos últimos 3 dias (backtest simples)
    m = LinearRegression().fit(matriz(np.arange(len(treino)), treino.ts.dt.hour.values), treino.cpu)
    mae = float(np.abs(m.predict(matriz(np.arange(len(treino), len(df)), teste.ts.dt.hour.values)) - teste.cpu).mean())

    m.fit(matriz(x, t.hour.values), cpu)  # re-treina com tudo e projeta 14 dias
    futuro_t = pd.date_range(t[-1] + pd.Timedelta(hours=1), periods=14 * 24, freq="h")
    futuro = pd.DataFrame({"ts": futuro_t, "cpu": m.predict(matriz(np.arange(len(t), len(t) + len(futuro_t)), futuro_t.hour.values))})
    cruzou = futuro[futuro.cpu > 85]
    quando = cruzou.ts.iloc[0].strftime("%Y-%m-%d %Hh") if len(cruzou) else "não cruza em 14 dias"
    return df, futuro, mae, quando


def svg_serie(valores, marcados, largura=900, altura=180, cor="#2563eb", titulo="") -> str:
    """Gráfico de linha mínimo em SVG; pontos marcados (anomalias) em vermelho."""
    v = np.asarray(valores, dtype=float)
    lo, hi = v.min(), v.max()
    xs = np.linspace(0, largura, len(v))
    ys = altura - (v - lo) / (hi - lo) * (altura - 10) - 5
    pts = " ".join(f"{a:.1f},{b:.1f}" for a, b in zip(xs, ys))
    marcas = "".join(f'<circle cx="{xs[i]:.1f}" cy="{ys[i]:.1f}" r="2.5" fill="#dc2626"/>' for i in np.flatnonzero(marcados))
    return (
        f'<h2>{titulo}</h2><svg viewBox="0 0 {largura} {altura}" width="100%" role="img" aria-label="{titulo}">'
        f'<polyline points="{pts}" fill="none" stroke="{cor}" stroke-width="1"/>{marcas}</svg>'
        f'<p class="eixo">mín {lo:.0f} · máx {hi:.0f}</p>'
    )


def main() -> None:
    df = gerar_latencia()
    y = df.anomalia.values
    print(f"Série: {len(df)} pontos (1/min, 3 dias) · {y.sum()} minutos anômalos plantados\n")

    # Baseline 1: limiar estático (o alerta clássico "latência > X ms").
    estatico = (df.latencia_ms > np.percentile(df.latencia_ms, 99)).astype(int).values
    # Isolation Forest sobre as features sazonais. contamination = fração esperada de anomalias.
    X = features(df)
    iso = IsolationForest(n_estimators=200, contamination=0.015, random_state=0).fit(X)
    pred_iso = (iso.predict(X) == -1).astype(int)
    # Redução de falso positivo: só alerta se 2 minutos seguidos forem anômalos (debounce).
    debounce = (pd.Series(pred_iso).rolling(2).sum() >= 2).astype(int).values

    print(avaliar("limiar estático (p99)", y, estatico))
    print(avaliar("Isolation Forest", y, pred_iso))
    print(avaliar("Isolation Forest + debounce 2min", y, debounce))

    hist, futuro, mae, quando = forecast_cpu()
    print(f"\nForecast de CPU do nó: MAE no backtest (72h) = {mae:.2f} p.p.")
    print(f"Alerta preditivo: CPU média passa de 85% em {quando}")

    SAIDA.mkdir(exist_ok=True)
    html = (
        "<!doctype html><meta charset='utf-8'><title>Dashboard AIOps</title>"
        "<style>body{font-family:system-ui;margin:16px;background:#fff;color:#111}"
        ".eixo{color:#555;font-size:12px}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}}</style>"
        "<h1>Dashboard AIOps (dados sintéticos)</h1>"
        + svg_serie(df.latencia_ms, debounce, titulo="Latência p95 (ms) · vermelho = anomalia (Isolation Forest + debounce)")
        + svg_serie(np.concatenate([hist.cpu, futuro.cpu]), np.r_[np.zeros(len(hist)), futuro.cpu > 85], cor="#059669",
                    titulo=f"CPU do nó (%) · histórico + forecast 14 dias · vermelho = acima de 85% (a partir de {quando})")
    )
    (SAIDA / "dashboard.html").write_text(html, encoding="utf-8")
    print(f"\nDashboard: {(SAIDA / 'dashboard.html').relative_to(Path.cwd()) if SAIDA.is_relative_to(Path.cwd()) else SAIDA}")


if __name__ == "__main__":
    main()
