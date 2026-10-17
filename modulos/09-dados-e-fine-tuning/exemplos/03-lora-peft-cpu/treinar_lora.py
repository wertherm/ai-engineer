"""LoRA real em CPU: ajusta o SmolLM2-135M-Instruct para classificar tickets de suporte (dados/treino.jsonl).

Mostra o essencial de PEFT: % de parâmetros treináveis, loss caindo, loss de validação antes/depois e o
tamanho do adapter salvo (MBs, não o modelo inteiro).

Uso (da pasta do módulo):  uv run python exemplos/03-lora-peft-cpu/treinar_lora.py [--epocas 2] [--r 8]
"""
from __future__ import annotations

import argparse
import csv
import math
import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "comum"))
from modelo_local import DADOS, DIR_ADAPTER, carregar_base, prompt_de_chat  # noqa: E402

import torch  # noqa: E402
from datasets import load_dataset  # noqa: E402
from peft import LoraConfig, get_peft_model  # noqa: E402


def tokenizar(tok, exemplo: dict) -> dict:
    """Prompt (system + user) + resposta. A loss só conta nos tokens da RESPOSTA: o rótulo -100 faz a
    cross-entropy ignorar o prompt (senão o modelo gasta capacidade aprendendo a repetir o enunciado)."""
    msgs = exemplo["messages"]
    prompt = prompt_de_chat(tok, msgs[:-1])
    resposta = msgs[-1]["content"] + tok.eos_token  # o EOS ensina o modelo a PARAR depois da categoria
    ids_prompt = tok(prompt, add_special_tokens=False)["input_ids"]
    ids_resp = tok(resposta, add_special_tokens=False)["input_ids"]
    return {"input_ids": ids_prompt + ids_resp, "labels": [-100] * len(ids_prompt) + ids_resp}


def lotes(dados, tamanho: int, pad_id: int, embaralhar: bool, rng: random.Random):
    idx = list(range(len(dados)))
    if embaralhar:
        rng.shuffle(idx)
    for i in range(0, len(idx), tamanho):
        grupo = [dados[j] for j in idx[i:i + tamanho]]
        n = max(len(g["input_ids"]) for g in grupo)
        # padding à direita; a máscara de atenção zera os tokens de enchimento
        yield {
            "input_ids": torch.tensor([g["input_ids"] + [pad_id] * (n - len(g["input_ids"])) for g in grupo]),
            "attention_mask": torch.tensor([[1] * len(g["input_ids"]) + [0] * (n - len(g["input_ids"])) for g in grupo]),
            "labels": torch.tensor([g["labels"] + [-100] * (n - len(g["labels"])) for g in grupo]),
        }


@torch.no_grad()
def loss_media(modelo, dados, pad_id: int) -> float:
    modelo.eval()
    perdas = [modelo(**b).loss.item() for b in lotes(dados, 16, pad_id, False, random.Random(0))]
    return sum(perdas) / len(perdas)


def treinar(arq_treino: Path, arq_valid: Path, saida: Path, epocas: int = 2, r: int = 8, lr: float = 1e-3,
            batch: int = 8, semente: int = 42, verbose: bool = True) -> dict:
    torch.manual_seed(semente)
    rng = random.Random(semente)
    tok, modelo = carregar_base()
    pad_id = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id
    total = sum(p.numel() for p in modelo.parameters())

    # LoRA: congela os pesos originais W e aprende só B·A (posto r) nas projeções de atenção.
    # W' = W + (alpha/r)·B·A  ->  com r=8 em 4 projeções por camada, treinamos <1% dos parâmetros.
    config = LoraConfig(r=r, lora_alpha=2 * r, lora_dropout=0.05, task_type="CAUSAL_LM",
                        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"])
    modelo = get_peft_model(modelo, config)
    treinaveis = sum(p.numel() for p in modelo.parameters() if p.requires_grad)

    # datasets lê o JSONL e aplica a tokenização com map (cacheado e reaproveitável).
    ds = load_dataset("json", data_files={"treino": str(arq_treino), "validacao": str(arq_valid)})
    ds = ds.map(lambda ex: tokenizar(tok, ex), remove_columns=["messages"])
    treino, valid = ds["treino"], ds["validacao"]

    if verbose:
        print(f"parâmetros do modelo: {total:,} | treináveis (LoRA r={r}): {treinaveis:,} "
              f"({100 * treinaveis / total:.2f}%)".replace(",", "."))
        print(f"full fine-tuning treinaria {total:,} parâmetros (+ estados do Adam = ~{3 * total * 4 / 1e9:.1f} GB "
              f"só de pesos/gradientes/otimizador em fp32)".replace(",", "."))
    loss_val_antes = loss_media(modelo, valid, pad_id)

    otimizador = torch.optim.AdamW([p for p in modelo.parameters() if p.requires_grad], lr=lr)
    passos_por_epoca = math.ceil(len(treino) / batch)
    historico, passo, t0 = [], 0, time.time()
    for epoca in range(1, epocas + 1):
        modelo.train()
        for b in lotes(treino, batch, pad_id, True, rng):
            loss = modelo(**b).loss
            loss.backward()
            otimizador.step()
            otimizador.zero_grad()
            passo += 1
            historico.append({"passo": passo, "epoca": epoca, "loss": round(loss.item(), 4)})
            if verbose and (passo % 5 == 0 or passo == 1):
                print(f"época {epoca} passo {passo:3d}/{epocas * passos_por_epoca}  loss={loss.item():.4f}")
    duracao = time.time() - t0
    loss_val_depois = loss_media(modelo, valid, pad_id)

    # Só o adapter é salvo (adapter_model.safetensors + adapter_config.json), não o modelo inteiro.
    modelo.save_pretrained(saida)
    tamanho_adapter = sum(f.stat().st_size for f in saida.glob("*") if f.is_file())
    with (saida / "historico-loss.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["passo", "epoca", "loss"])
        w.writeheader()
        w.writerows(historico)
    res = {"treinaveis": treinaveis, "total": total, "loss_val_antes": loss_val_antes,
           "loss_val_depois": loss_val_depois, "duracao_s": duracao, "tamanho_adapter_mb": tamanho_adapter / 1e6}
    if verbose:
        print(f"\ntreino: {passo} passos em {duracao:.0f} s (CPU)")
        print(f"loss de validação: {loss_val_antes:.4f} -> {loss_val_depois:.4f}")
        print(f"adapter salvo em {saida.relative_to(Path.cwd()) if saida.is_relative_to(Path.cwd()) else saida}: "
              f"{res['tamanho_adapter_mb']:.1f} MB (o modelo base tem ~{total * 2 / 1e6:.0f} MB em bf16)")
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Treina um adapter LoRA em CPU")
    ap.add_argument("--treino", type=Path, default=DADOS / "treino.jsonl")
    ap.add_argument("--validacao", type=Path, default=DADOS / "validacao.jsonl")
    ap.add_argument("--saida", type=Path, default=DIR_ADAPTER)
    ap.add_argument("--epocas", type=int, default=2)
    ap.add_argument("--r", type=int, default=8)
    ap.add_argument("--lr", type=float, default=1e-3)
    a = ap.parse_args()
    treinar(a.treino, a.validacao, a.saida, epocas=a.epocas, r=a.r, lr=a.lr)
