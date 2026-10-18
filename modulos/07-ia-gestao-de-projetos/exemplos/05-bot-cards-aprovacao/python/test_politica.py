import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path

import pytest

from politica import lembretes, precisa_aprovacao
from trilha import canonico, hash_de


def test_arquivar_e_prioridade_alta_exigem_aprovacao():
    assert precisa_aprovacao({"acao": "arquivar", "prioridade": "manter"})
    assert precisa_aprovacao({"acao": "criar", "prioridade": "alta"})
    assert precisa_aprovacao({"acao": "mover", "prioridade": "alta"}) is None


def test_lembra_card_sem_dono_vencendo_em_48h_e_ignora_o_que_esta_feito():
    listas = [{"id": "l1", "name": "Backlog"}, {"id": "l3", "name": "Feito"}]
    agora = datetime(2026, 11, 2, 12, tzinfo=UTC)
    cards = [
        {"name": "A", "idList": "l1", "due": "2026-11-03T12:00:00Z", "idMembers": []},
        {"name": "B", "idList": "l3", "due": "2026-11-01T12:00:00Z", "idMembers": []},
        {"name": "C", "idList": "l1", "due": "2026-11-03T12:00:00Z", "idMembers": ["ana"]},
    ]
    assert lembretes(cards, listas, agora) == ['🟡 "A" vence em 24h e está sem responsável']


def test_hash_da_trilha_nao_depende_da_ordem_das_chaves():
    base = {"solicitante": "w", "pedido": "p", "status": "executado"}
    assert hash_de("genesis", {**base, "operacao": {"lista": "Feito", "acao": "mover"}}) == \
        hash_de("genesis", {**base, "operacao": {"acao": "mover", "lista": "Feito"}})


TEM_NODE = shutil.which("node") and (Path(__file__).resolve().parents[3] / "node_modules" / "pg").exists()


@pytest.mark.skipif(not TEM_NODE, reason="precisa do Node e do npm install do módulo para comparar com o trilha.js")
def test_hash_igual_ao_do_js():
    # Mesmo registro (com acento e motivo null) -> o hash do Python tem de bater com o hashDe() do trilha.js.
    r = {"solicitante": "werther", "pedido": "Arquive o card Tema escuro", "status": "aguardando_aprovacao",
         "operacao": {"prioridade": "manter", "acao": "arquivar", "lista": "Backlog", "card": "Tema escuro no portal"},
         "motivo": "arquivar card é irreversível para o time"}
    js = Path(__file__).resolve().parent.parent / "trilha.js"
    script = (f"import('{js.as_uri()}').then(async m => {{ console.log(m.hashDe('genesis', {canonico(r)})); await m.pool.end(); }})")
    saida = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True, cwd=js.parent)
    assert saida.stdout.strip() == hash_de("genesis", r)
