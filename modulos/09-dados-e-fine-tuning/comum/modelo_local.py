"""Utilitários Python do módulo 9: carregar o modelo pequeno, montar o prompt de chat e gerar a resposta.

Usado pelo treino LoRA (exemplo 03), pelo servidor compatível com OpenAI (exemplo 04) e pelo exercício 01.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "dados"
# Cache do Hugging Face DENTRO do módulo, junto do .venv (ignorado pelo git e pelo validador do repo):
# não depende de ~/.cache e apagar o .venv limpa tudo (o modelo é baixado de novo na próxima execução).
os.environ.setdefault("HF_HOME", str(RAIZ / ".venv" / "huggingface"))
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import torch  # noqa: E402  (precisa vir depois do HF_HOME)
from transformers import AutoModelForCausalLM, AutoTokenizer  # noqa: E402

# Modelo base: SmolLM2-135M-Instruct (Apache-2.0, ~270 MB em bf16). Cabe folgado em CPU e em ~1 GB de RAM.
MODELO_BASE = os.environ.get("MODELO_BASE_LORA", "HuggingFaceTB/SmolLM2-135M-Instruct")
REVISAO = os.environ.get("REVISAO_MODELO", "12fd25f77366fa6b3b4b768ec3050bf629380bac")  # commit fixo = reprodutível
DIR_ADAPTER = RAIZ / "exemplos" / "03-lora-peft-cpu" / "adapter"

DOMINIO = json.loads((RAIZ / "comum" / "dominio.json").read_text(encoding="utf-8"))
CATEGORIAS: list[str] = DOMINIO["categorias"]
SYSTEM_PROMPT: str = DOMINIO["system_prompt"]

# Poucas threads: a máquina é compartilhada com o Ollama e outros processos.
torch.set_num_threads(int(os.environ.get("TORCH_THREADS", "4")))


def ler_jsonl(caminho: Path) -> list[dict]:
    return [json.loads(l) for l in caminho.read_text(encoding="utf-8").splitlines() if l.strip()]


def carregar_base():
    """Tokenizer + modelo base em float32 (em CPU, bf16 é mais lento e menos estável para treinar)."""
    tok = AutoTokenizer.from_pretrained(MODELO_BASE, revision=REVISAO)
    modelo = AutoModelForCausalLM.from_pretrained(MODELO_BASE, revision=REVISAO, dtype=torch.float32)
    return tok, modelo


def prompt_de_chat(tok, messages: list[dict]) -> str:
    """Aplica o chat template do modelo e deixa o turno do assistant aberto (add_generation_prompt)."""
    return tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)


@torch.inference_mode()
def gerar(tok, modelo, messages: list[dict], max_new_tokens: int = 8) -> str:
    """Decodificação gulosa (determinística): a mesma entrada dá sempre a mesma saída."""
    ids = tok(prompt_de_chat(tok, messages), return_tensors="pt")
    saida = modelo.generate(**ids, max_new_tokens=max_new_tokens, do_sample=False, pad_token_id=tok.eos_token_id)
    return tok.decode(saida[0, ids["input_ids"].shape[1]:], skip_special_tokens=True).strip()


def classificar(tok, modelo, ticket: str) -> str:
    return gerar(tok, modelo, [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": ticket}])
