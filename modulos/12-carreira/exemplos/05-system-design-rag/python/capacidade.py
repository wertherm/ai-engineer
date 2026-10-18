"""Estimativas "de guardanapo" para system design de IA: volume, pico, concorrência, tokens, custo e
armazenamento vetorial. Funções puras: o exemplo 05 e o exercício 02 reaproveitam (versão Python do
capacidade.js, com as MESMAS fórmulas e os MESMOS nomes de premissas para comparar lado a lado).
"""
from dataclasses import dataclass

# PREÇOS ILUSTRATIVOS em US$ por 1 milhão de tokens (os mesmos do JS e do exemplo 02 do módulo 02). NÃO são
# de um provedor específico: troque pelos da página de preços do provedor escolhido, com a data da consulta.
PRECOS_ILUSTRATIVOS = {"entrada": 0.4, "entradaEmCache": 0.1, "saida": 1.6, "embedding": 0.02}


@dataclass(frozen=True)
class Premissas:
    usuarios: float             # base total de usuários
    ativosDia: float            # fração que usa num dia útil (0–1)
    requisicoesPorAtivo: float  # requisições por usuário ativo por dia
    chamadasLLM: float          # chamadas ao LLM por requisição (RAG simples = 1; agente = várias)
    tokensEntrada: float        # tokens de entrada por chamada (sistema + contexto + histórico + pergunta)
    tokensSaida: float          # tokens de saída por chamada
    fracaoCacheada: float       # fração dos tokens de entrada servida do cache de prompt (0–1)
    horasUteis: float           # janela em que o uso acontece
    fatorPico: float            # pico / média dentro da janela
    latenciaS: float            # latência média ponta a ponta de uma requisição (s)
    diasMes: float              # dias de uso por mês


def estimar(p: Premissas, precos: dict = PRECOS_ILUSTRATIVOS) -> dict:
    req_dia = p.usuarios * p.ativosDia * p.requisicoesPorAtivo
    rps_medio = req_dia / (p.horasUteis * 3600)
    rps_pico = rps_medio * p.fatorPico
    # Lei de Little: requisições simultâneas = taxa de chegada × tempo no sistema.
    concorrencia_pico = rps_pico * p.latenciaS
    chamadas_mes = req_dia * p.chamadasLLM * p.diasMes
    entrada_mes = chamadas_mes * p.tokensEntrada
    saida_mes = chamadas_mes * p.tokensSaida
    # Mesma ordem de operações do JS: com float, (a*b)/c pode diferir de a*(b/c) no último bit.
    custo_mes = (
        ((entrada_mes * (1 - p.fracaoCacheada)) / 1e6) * precos["entrada"]
        + ((entrada_mes * p.fracaoCacheada) / 1e6) * precos["entradaEmCache"]
        + (saida_mes / 1e6) * precos["saida"]
    )
    return {
        "req_dia": req_dia,
        "rps_medio": rps_medio,
        "rps_pico": rps_pico,
        "concorrencia_pico": concorrencia_pico,
        # Throughput de geração que o servidor de inferência precisa sustentar no pico (decisivo para self-host).
        "tokens_saida_por_segundo_pico": rps_pico * p.chamadasLLM * p.tokensSaida,
        "tokens_mes": {"entrada": entrada_mes, "saida": saida_mes},
        "custo_mes": custo_mes,
        "custo_por_requisicao": custo_mes / (req_dia * p.diasMes),
    }


def armazenamento(documentos: int, trechosPorDoc: int, dimensoes: int, bytesTextoPorTrecho: int, **_) -> dict:
    """Armazenamento do índice vetorial: vetores float32 + texto dos trechos (sem o overhead do índice)."""
    trechos = documentos * trechosPorDoc
    bytes_vetores = trechos * dimensoes * 4  # float32 = 4 bytes por dimensão
    return {"trechos": trechos, "gb_vetores": bytes_vetores / 1e9, "gb_texto": trechos * bytesTextoPorTrecho / 1e9}


def custo_indexacao(trechos: int, tokens_por_trecho: int, precos: dict = PRECOS_ILUSTRATIVOS) -> float:
    """Custo de (re)indexar a base inteira com embeddings via API."""
    return ((trechos * tokens_por_trecho) / 1e6) * precos["embedding"]
