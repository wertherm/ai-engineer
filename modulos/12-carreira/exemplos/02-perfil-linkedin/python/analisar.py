"""Analisa um perfil de LinkedIn contra uma vaga: cobertura de palavras-chave, headline e "Sobre".

Não acessa o LinkedIn: trabalha com o texto que você cola em ../perfil.json (nada de scraping nem login).
Lê os MESMOS perfil.json e vaga.txt da versão JS.
"""
import json
import math
import re
from pathlib import Path

PASTA = Path(__file__).resolve().parent.parent

# Limites de 220 (headline) e 2.600 (Sobre) caracteres e ~60 visíveis da headline: dados de guias de
# terceiros (ver docs/01), não da documentação do LinkedIn. Confira no contador do próprio formulário.
LIMITE = {"headline": 220, "headline_visivel": 60, "sobre": 2600, "gancho_sobre": 300}

I = re.IGNORECASE
# Termo canônico -> padrão que o reconhece (sinônimos e grafias). É o que um recrutador digita na busca.
TERMOS = {
    "RAG": re.compile(r"\brag\b|retrieval[- ]augmented", I),
    "Agentes de IA": re.compile(r"\bagent(e|es|s)?\b", I),
    "MCP": re.compile(r"\bmcp\b|model context protocol", I),
    "LangChain/LangGraph": re.compile(r"langchain|langgraph", I),
    "Avaliação de LLMs": re.compile(r"avalia[çc][ãa]o|\bevals?\b", I),
    "Observabilidade": re.compile(r"observabilidade|\bslo\b|lat[êe]ncia|ttft", I),
    "Banco vetorial": re.compile(r"pgvector|vetoria|vector", I),
    "PostgreSQL": re.compile(r"postgres", I),
    "Python/TypeScript": re.compile(r"python|typescript|node\.?js", I),
    "Kubernetes": re.compile(r"kubernetes|\bk8s\b", I),
    "Docker": re.compile(r"docker", I),
    "Prompt engineering": re.compile(r"prompt", I),
    "Fine-tuning": re.compile(r"fine-?tuning", I),
    "vLLM": re.compile(r"\bvllm\b", I),
    "LLMOps/MLOps": re.compile(r"llmops|mlops", I),
}


def cobertura(texto_perfil: str, texto_vaga: str) -> dict:
    pedidos = [(t, rx) for t, rx in TERMOS.items() if rx.search(texto_vaga)]
    presentes = [t for t, rx in pedidos if rx.search(texto_perfil)]
    ausentes = [t for t, rx in pedidos if not rx.search(texto_perfil)]
    # math.floor(x + 0.5) = Math.round do JS (o round() do Python faz meio-para-o-par).
    return {"pct": math.floor(len(presentes) / len(pedidos) * 100 + 0.5), "presentes": presentes, "ausentes": ausentes}


def avaliar_headline(h: str) -> dict:
    visivel = h[: LIMITE["headline_visivel"]]
    return {
        "tamanho": len(h),
        "cabe": len(h) <= LIMITE["headline"],
        # O cargo-alvo precisa aparecer no trecho que a busca e os convites mostram.
        "cargo_visivel": bool(re.search(r"engenheir[oa] de (ia|ai)|ai engineer|machine learning|ml engineer", visivel, I)),
        "cliches": len(re.findall(r"apaixonad|buscando (?:novos )?desafios|inova[çc][ãa]o|entusiasta", h, I)),
    }


def avaliar_sobre(s: str) -> dict:
    gancho = s[: LIMITE["gancho_sobre"]]
    return {
        "tamanho": len(s),
        "cabe": len(s) <= LIMITE["sobre"],
        "gancho_com_numero": bool(re.search(r"\d", gancho)),
        "projetos": len(re.findall(r"^- ", s, re.MULTILINE)),
        "chamada_para_acao": bool(re.search(r"mensagem|contato|fale comigo|aberto a", s, I)),
    }


def relatorio(rotulo: str, headline: str, sobre: str, skills: list[str], vaga: str) -> None:
    c = cobertura("\n".join([headline, sobre, *skills]), vaga)
    h = avaliar_headline(headline)
    s = avaliar_sobre(sobre)
    sn = lambda b: "sim" if b else "NÃO"  # noqa: E731
    print(f"\n== {rotulo} ==")
    print(f"headline: {h['tamanho']}/{LIMITE['headline']} car. · cargo nos {LIMITE['headline_visivel']} visíveis: {sn(h['cargo_visivel'])} · clichês: {h['cliches']}")
    print(f"sobre: {s['tamanho']}/{LIMITE['sobre']} car. · número no gancho: {sn(s['gancho_com_numero'])} · projetos listados: {s['projetos']} · chamada para ação: {sn(s['chamada_para_acao'])}")
    print(f"palavras-chave da vaga: {c['pct']}% ({len(c['presentes'])}/{len(c['presentes']) + len(c['ausentes'])})")
    if c["ausentes"]:
        print(f"  faltando: {', '.join(c['ausentes'])}")


def main() -> None:
    perfil = json.loads((PASTA / "perfil.json").read_text(encoding="utf-8"))
    vaga = (PASTA / "vaga.txt").read_text(encoding="utf-8")
    relatorio("ANTES", perfil["headline"], perfil["sobre"], perfil["skills"], vaga)
    relatorio("DEPOIS", perfil["headlineNova"], perfil["sobreNovo"], perfil["skillsNovas"], vaga)

    # Marca pessoal = constância: calendário de 4 semanas alternando formatos.
    formatos = [
        "post curto: 1 aprendizado + 1 trecho de código",
        "case: problema -> decisão -> número",
        "artigo técnico (blog/dev.to) linkado no post",
        "demo: GIF de 20 s + link do repo",
    ]
    print("\nCalendário de conteúdo (1 publicação/semana + 3 comentários técnicos em posts de outras pessoas):")
    for i, a in enumerate(perfil["aprendizados"]):
        print(f'  semana {i + 1} · {formatos[i % len(formatos)]} · "{a}"')


if __name__ == "__main__":
    main()
