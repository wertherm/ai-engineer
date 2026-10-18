"""Teste sem LLM: a auditoria é código puro, então dá para testar com fixtures."""
import copy

from schema import Requisitos
from validar import auditar_requisitos

BASE = {
    "epicos": [{"id": "EP-01", "titulo": "x", "historias": [{
        "id": "HU-01", "como": "cliente", "quero": "a", "para": "b", "tarefas": ["t1"],
        "criterios": ["Dado X, quando Y, então Z", "Dado A, quando B, então C"],
    }]}],
    "mudancas": [{"descricao": "bloquear vencidos", "afeta": ["HU-01"]}],
    "duvidas": [],
}


def test_backlog_bem_formado_nao_tem_problemas():
    Requisitos.model_validate(BASE)  # a fixture também obedece ao schema
    assert auditar_requisitos(BASE)["problemas"] == []


def test_acusa_criterio_fora_do_gwt_e_mudanca_orfa():
    ruim = copy.deepcopy(BASE)
    ruim["epicos"][0]["historias"][0]["criterios"] = ["funciona"]
    ruim["mudancas"][0]["afeta"] = ["HU-99"]
    assert len(auditar_requisitos(ruim)["problemas"]) == 3
