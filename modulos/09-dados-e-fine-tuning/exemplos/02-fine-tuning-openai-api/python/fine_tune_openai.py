"""Automação de fine-tuning supervisionado na OpenAI com o SDK Python `openai` (porta de `../fine-tune-openai.js`):
valida -> sobe os arquivos (files, purpose "fine-tune") -> cria o job (fine_tuning.jobs, method supervised)
-> acompanha status + eventos de métricas -> lista checkpoints -> registra a versão do modelo.

Modos:
  --dry-run  (padrão, roda local SEM chave) valida o JSONL, calcula o hash e mostra o payload que seria enviado.
  --executar contra a OpenAI real: NÃO executado localmente (exige OPENAI_API_KEY de conta com acesso ao
             fine-tuning; ver docs/03). Contra o mock local (mock_openai.py ou ../mock-openai.js) foi executado.

Uso (da pasta do módulo): uv run python exemplos/02-fine-tuning-openai-api/python/fine_tune_openai.py [--executar]
"""
from __future__ import annotations

import hashlib
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "01-preparacao-de-dataset" / "python"))
from comum_py.config import DADOS, RAIZ, json_js  # noqa: E402
from validar_jsonl import validar_arquivo  # noqa: E402

executar = "--executar" in sys.argv
MODELO_BASE = os.environ.get("MODELO_BASE_FT", "gpt-4.1-nano-2025-04-14")
ARQ_TREINO = DADOS / "treino.jsonl"
ARQ_VALID = DADOS / "validacao.jsonl"

# Hiperparâmetros básicos. "auto" deixa a OpenAI escolher pelo tamanho do dataset; fixe para reprodutibilidade.
HIPERPARAMETROS = {"n_epochs": 3, "batch_size": "auto", "learning_rate_multiplier": "auto"}
POLL_S = int(os.environ.get("POLL_MS", "30000")) / 1000  # 30 s é educado com a API; o mock usa menos

# 1. Validação local: barato e evita job "failed" depois do upload.
for v in (validar_arquivo(ARQ_TREINO), validar_arquivo(ARQ_VALID)):
    print(f"validação {Path(v['caminho']).name}: {v['exemplos']} exemplos, ~{v['tokens']} tokens, {len(v['erros'])} erro(s)")
    if v["erros"]:
        sys.exit("\n".join(v["erros"][:5]))

versao_dataset = hashlib.sha256(ARQ_TREINO.read_bytes()).hexdigest()[:12]  # o hash identifica a versão dos dados
payload_job = {
    "model": MODELO_BASE,
    "training_file": "<file-id do upload de treino>",
    "validation_file": "<file-id do upload de validação>",
    "suffix": f"suporte-{versao_dataset[:6]}",  # aparece no nome: ft:gpt-4.1-nano...:suporte-xxxxxx:<id>
    "seed": 42,
    "method": {"type": "supervised", "supervised": {"hyperparameters": HIPERPARAMETROS}},
    "metadata": {"dataset_sha256": versao_dataset, "projeto": "triagem-tickets"},
}

if not executar:
    print("\n[dry-run] nada foi enviado. Payload que seria usado em client.fine_tuning.jobs.create():")
    print(json_js(payload_job, indent=2))
    print("\nPara executar de verdade: OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_API_KEY=sk-... "
          "uv run python exemplos/02-fine-tuning-openai-api/python/fine_tune_openai.py --executar")
    sys.exit(0)

# ---------------- daqui para baixo: contra a OpenAI real, NÃO executado localmente ----------------
from openai import OpenAI  # noqa: E402

if os.environ.get("OPENAI_API_KEY", "ollama") == "ollama":
    sys.exit("Defina OPENAI_API_KEY de uma conta OpenAI com acesso ao fine-tuning.")
client = OpenAI(base_url=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"))
# Registro de modelos ("model card" mínimo, versionado em git). Contra o mock local, vai para outro arquivo.
REGISTRO = DADOS / ("registro-modelos.mock.jsonl" if "localhost" in str(client.base_url) else "registro-modelos.jsonl")

# 2. Upload: cada arquivo vira um File com purpose "fine-tune" (o SDK monta o multipart a partir do Path).
f_treino = client.files.create(file=ARQ_TREINO, purpose="fine-tune")
f_valid = client.files.create(file=ARQ_VALID, purpose="fine-tune")
print(f"upload ok: treino={f_treino.id} validação={f_valid.id}")

# 3. Cria o job (no SDK Python os parâmetros são keyword arguments; `method` vai como dict).
job = client.fine_tuning.jobs.create(**{**payload_job, "training_file": f_treino.id, "validation_file": f_valid.id})
print(f"job criado: {job.id} (status {job.status})")

# 4. Polling: status + eventos novos (inclui eventos "metrics" com train_loss/valid_loss por passo).
vistos: set[str] = set()
FINAIS = {"succeeded", "failed", "cancelled"}
while job.status not in FINAIS:
    time.sleep(POLL_S)
    job = client.fine_tuning.jobs.retrieve(job.id)
    pagina = client.fine_tuning.jobs.list_events(job.id, limit=50)
    for ev in reversed(pagina.data):  # a API devolve do mais novo para o mais antigo
        if ev.id in vistos:
            continue
        vistos.add(ev.id)
        extra = f" {json_js(ev.data)}" if ev.type == "metrics" else ""
        quando = datetime.fromtimestamp(ev.created_at, UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        print(f"[{quando}] {ev.level} {ev.message}{extra}")
    print(f"status={job.status} trained_tokens={job.trained_tokens if job.trained_tokens is not None else '-'}")

if job.status != "succeeded":
    sys.exit(f"job terminou em {job.status}: {job.error}")

# 5. Checkpoints (a OpenAI guarda os das 3 últimas épocas): escolha pelo menor valid_loss, não pelo último.
# Iterar a página faz a auto-paginação (equivale ao `for await` do JS).
checkpoints = list(client.fine_tuning.jobs.checkpoints.list(job.id))
for c in checkpoints:
    print(f"checkpoint passo {c.step_number}: {c.fine_tuned_model_checkpoint} {json_js(c.metrics.model_dump(exclude_none=True))}")

# 6. Versionamento/documentação: uma linha por modelo treinado, com tudo para reproduzir e auditar.
hp = job.method.supervised.hyperparameters.model_dump() if job.method and job.method.supervised else HIPERPARAMETROS
registro = {
    "data": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    "modelo": job.fine_tuned_model, "base": MODELO_BASE, "job": job.id, "dataset_sha256": versao_dataset,
    "arquivos": {"treino": f_treino.id, "validacao": f_valid.id}, "hiperparametros": hp,
    "trained_tokens": job.trained_tokens, "linguagem": "python",
    "checkpoints": [{"passo": c.step_number, "modelo": c.fine_tuned_model_checkpoint,
                     "metricas": c.metrics.model_dump(exclude_none=True)} for c in checkpoints],
}
with REGISTRO.open("a", encoding="utf-8") as f:
    f.write(json_js(registro) + "\n")
print(f"\nmodelo pronto: {job.fine_tuned_model} (registrado em {REGISTRO.relative_to(RAIZ)})")
