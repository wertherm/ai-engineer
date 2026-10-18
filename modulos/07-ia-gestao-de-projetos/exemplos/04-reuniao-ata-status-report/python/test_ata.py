from datetime import UTC, datetime

from ata import calendario, criar_schema_ata, gerar_ics, participantes, validar_ata
from status import metricas_sprint, numeros_sem_lastro


def test_participantes_saem_da_transcricao():
    assert participantes("[09:00] Ana (dev): oi\n[09:01] Bruno: ok\n[09:02] Ana: tchau") == ["Ana", "Bruno"]


def test_valida_responsavel_inventado_e_prazo_fora_do_formato():
    p = validar_ata({"decisoes": [], "pendencias": [], "acoes": [{"responsavel": "Zé", "tarefa": "x", "prazo": "quinta"}]}, ["Ana"])
    assert len(p) == 2


def test_ics_tem_um_vtodo_por_acao_com_prazo():
    ics = gerar_ics(
        [{"responsavel": "Ana", "tarefa": "t", "prazo": "2026-11-04"}, {"responsavel": "Ana", "tarefa": "u", "prazo": "sem prazo"}],
        datetime(2026, 11, 2, tzinfo=UTC),
    )
    assert ics.count("BEGIN:VTODO") == 1
    assert "DUE;VALUE=DATE:20261104" in ics


def test_semaforo_amarelo_com_bloqueio_e_entrega_igual_ao_tempo():
    m = metricas_sprint({"pontosPlanejados": 30, "pontosEntregues": 21, "diasRestantes": 3, "diasTotais": 10, "bugsCriticos": 1,
                         "itensBloqueados": ["x"], "orcamentoPrevisto": 120000, "orcamentoGasto": 96000, "percentualEscopoConcluido": 70})
    assert m["semaforo"] == "amarelo"
    assert m["cpi"] == 0.88


def test_calendario_resolve_dia_da_semana():
    assert [c["dia"] for c in calendario("2026-11-02", 3)] == ["segunda", "terça", "quarta"]


def test_numero_inventado_e_sinalizado():
    assert numeros_sem_lastro("CPI 0,88 e atraso de 5 dias", '{"cpi":0.88}') == [5]


def test_schema_dinamico_gera_enum():
    # Extra do Python: o enum montado pelo código aparece no JSON Schema que vai para o servidor.
    schema = criar_schema_ata(["Ana", "Bruno"], ["2026-11-02"]).model_json_schema()
    acao = schema["$defs"]["Acao"]["properties"]
    assert acao["responsavel"]["enum"] == ["Ana", "Bruno"]
    assert acao["prazo"]["enum"] == ["2026-11-02", "sem prazo"]
