"""O mesmo pipeline em Kubeflow Pipelines v2 (base dos AI Pipelines do OpenShift AI 3.5).

Cada etapa vira um COMPONENTE: uma função Python que roda no seu próprio container.
O resultado da compilação (pipeline_kfp.yaml) é o arquivo que se importa no OpenShift AI:
  Dashboard -> Pipelines -> Import pipeline.

Compilar (local, sem cluster):  uv run --group kfp python exemplos/05-pipeline-de-treino/pipeline_kfp.py
Executar: só num cluster com AI Pipelines (não executado localmente).
"""
from pathlib import Path

from kfp import compiler, dsl

IMAGEM = "python:3.12-slim"
PACOTES = ["scikit-learn==1.9.1", "pandas==3.0.6"]


@dsl.component(base_image=IMAGEM, packages_to_install=PACOTES)
def carregar_e_validar(test_size: float, random_state: int, treino: dsl.Output[dsl.Dataset], teste: dsl.Output[dsl.Dataset]):
    from sklearn.datasets import load_breast_cancer
    from sklearn.model_selection import train_test_split

    X, y = load_breast_cancer(return_X_y=True, as_frame=True)
    if X.isna().any().any() or (X < 0).any().any():
        raise ValueError("dados inválidos: nulos ou negativos")  # falhar aqui interrompe o pipeline
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=test_size, random_state=random_state, stratify=y)
    X_tr.assign(target=y_tr).to_csv(treino.path, index=False)  # artefatos trafegam entre passos como arquivos
    X_te.assign(target=y_te).to_csv(teste.path, index=False)


@dsl.component(base_image=IMAGEM, packages_to_install=PACOTES)
def treinar_e_avaliar(C: float, treino: dsl.Input[dsl.Dataset], teste: dsl.Input[dsl.Dataset],
                      modelo: dsl.Output[dsl.Model], metricas: dsl.Output[dsl.Metrics]) -> float:
    import pickle

    import pandas as pd
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import recall_score, roc_auc_score
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    tr, te = pd.read_csv(treino.path), pd.read_csv(teste.path)
    m = make_pipeline(StandardScaler(), LogisticRegression(C=C, max_iter=1000)).fit(tr.drop(columns="target"), tr.target)
    recall = recall_score(te.target, m.predict(te.drop(columns="target")), pos_label=0)
    metricas.log_metric("recall_maligno", recall)
    metricas.log_metric("roc_auc", roc_auc_score(te.target, m.predict_proba(te.drop(columns="target"))[:, 1]))
    with open(modelo.path, "wb") as f:
        pickle.dump(m, f)
    return recall


@dsl.component(base_image=IMAGEM)
def registrar(modelo: dsl.Input[dsl.Model]):
    # No OpenShift AI 3.5, aqui entraria o registro no MLflow do projeto ou no Model Registry.
    print(f"registrando o modelo em {modelo.uri}")


@dsl.pipeline(name="cancer-clf-treino", description="Treino com portão de recall mínimo")
def pipeline(C: float = 1.0, test_size: float = 0.25, random_state: int = 42, recall_minimo: float = 0.95):
    dados = carregar_e_validar(test_size=test_size, random_state=random_state)
    treino = treinar_e_avaliar(C=C, treino=dados.outputs["treino"], teste=dados.outputs["teste"])
    with dsl.If(treino.outputs["Output"] >= recall_minimo):  # o portão vira uma condição do grafo
        registrar(modelo=treino.outputs["modelo"])


if __name__ == "__main__":
    destino = Path(__file__).with_name("pipeline_kfp.yaml")
    compiler.Compiler().compile(pipeline, package_path=str(destino))
    print(f"compilado: {destino.name} ({destino.stat().st_size} bytes)")
