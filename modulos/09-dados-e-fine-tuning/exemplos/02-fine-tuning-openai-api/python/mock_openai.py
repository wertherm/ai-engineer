"""Mock MÍNIMO (FastAPI) dos endpoints de files + fine_tuning.jobs da OpenAI — porta de `../mock-openai.js`.

Só para exercitar o fluxo do fine_tune_openai.py localmente (upload -> job -> polling -> eventos -> checkpoints)
sem conta e sem custo. Não treina nada: o job "avança" um estado a cada consulta.
Uso (da pasta do módulo): uv run python exemplos/02-fine-tuning-openai-api/python/mock_openai.py   (porta 30951)
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from comum_py.numeros import num_fixed  # noqa: E402  (+x.toFixed(3) do JS)

PORTA = int(os.environ.get("PORTA", "30951"))
ESTADOS = ["validating_files", "queued", "running", "running", "succeeded"]
app = FastAPI(title="mock fine-tuning OpenAI")
arquivos = 0
jobs: dict[str, dict] = {}


def erro(status: int, msg: str) -> JSONResponse:
    return JSONResponse({"error": {"message": msg}}, status_code=status)


@app.post("/v1/files")
async def criar_arquivo(request: Request):
    global arquivos
    # multipart/form-data: lemos o corpo cru (dispensa python-multipart) e conferimos só o purpose.
    corpo = await request.body()
    if b"fine-tune" not in corpo:
        return erro(400, "purpose inválido")
    arquivos += 1
    return {"id": f"file-mock{arquivos}", "object": "file", "purpose": "fine-tune", "bytes": len(corpo),
            "status": "processed", "created_at": int(time.time()), "filename": "upload.jsonl"}


@app.post("/v1/fine_tuning/jobs")
async def criar_job(request: Request):
    p = await request.json()
    job = {"id": f"ftjob-mock{len(jobs) + 1}", "object": "fine_tuning.job", "model": p["model"],
           "method": p.get("method"), "passo": 0, "fine_tuned_model": None, "trained_tokens": None}
    jobs[job["id"]] = job
    return {**job, "status": ESTADOS[0]}


def _status(job: dict) -> str:
    return ESTADOS[min(job["passo"], len(ESTADOS) - 1)]


@app.get("/v1/fine_tuning/jobs/{job_id}")
def ler_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        return erro(404, "não encontrado")
    status = _status(job)
    job["passo"] += 1
    fim = status == "succeeded"
    return {**job, "status": status, "fine_tuned_model": f"ft:{job['model']}:mock:suporte:abc123" if fim else None,
            "trained_tokens": 35529 if fim else None}


@app.get("/v1/fine_tuning/jobs/{job_id}/events")
def eventos(job_id: str):
    job = jobs.get(job_id)
    if not job:
        return erro(404, "não encontrado")
    status, agora = _status(job), int(time.time())
    data = [{"id": f"ev-{job['passo']}", "object": "fine_tuning.job.event", "created_at": agora, "level": "info",
             "message": f"Etapa: {status}", "type": "message"}]
    if status == "running":
        data.insert(0, {"id": f"ev-m{job['passo']}", "object": "fine_tuning.job.event", "created_at": agora, "level": "info",
                        "message": f"Step {job['passo'] * 10}/66", "type": "metrics",
                        "data": {"step": job["passo"] * 10, "train_loss": num_fixed(2 / job["passo"], 3)}})
    return {"object": "list", "data": data, "has_more": False}


@app.get("/v1/fine_tuning/jobs/{job_id}/checkpoints")
def checkpoints(job_id: str):
    job = jobs.get(job_id)
    if not job:
        return erro(404, "não encontrado")
    return {"object": "list", "has_more": False, "data": [
        {"id": f"ckpt-{e}", "object": "fine_tuning.job.checkpoint", "step_number": e * 22,
         "fine_tuned_model_checkpoint": f"ft:{job['model']}:mock:suporte:abc123:ckpt-step-{e * 22}",
         "metrics": {"full_valid_loss": num_fixed(0.5 / e, 3)}} for e in (1, 2, 3)]}


if __name__ == "__main__":
    print(f"mock da API de fine-tuning em http://localhost:{PORTA}/v1", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=PORTA, log_level="warning")
