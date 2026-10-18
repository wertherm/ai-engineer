"""Gera os DADOS BRUTOS (100% SINTÉTICOS) de tickets de suporte da "Loja Exemplo" — porta de `../gerar-brutos.js`.

Mesma semente (2026) e o MESMO mulberry32 do JS, consumido na MESMA ordem: o arquivo sai idêntico ao do Node.
Atenção à ordem das chamadas ao PRNG: no JS, `.replace('{p}', pick(...))` sorteia o produto MESMO quando o
template não tem `{p}`; aqui as três sorteadas acontecem sempre, antes dos replaces, para não pular números.

Uso (da pasta do módulo): uv run python exemplos/01-preparacao-de-dataset/python/gerar_brutos.py [--saida DIR]
Padrão: dados/python/ (não sobrescreve os arquivos do JS em dados/; compare com `cmp`).
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # raiz do módulo (pastas com hífen não são pacotes)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from comum_py.config import DADOS, json_js  # noqa: E402
from preparacao import mulberry32  # noqa: E402

rand = mulberry32(2026)


def pick(arr: list):
    return arr[math.floor(rand() * len(arr))]


aberturas = ["Olá,", "Oi, boa tarde.", "Bom dia!", "Prezados,", "Boa noite, pessoal.", "", "", "Socorro!", "Oi,"]
fechos = ["Obrigado.", "Aguardo retorno.", "Grata!", "Preciso de ajuda urgente.", "", "", "Att.", "Valeu!"]
produtos = ["fone bluetooth", "cafeteira", "tênis de corrida", "notebook", "liquidificador", "mochila", "smartwatch", "cadeira gamer"]

# Frases-núcleo por categoria: é o "sinal" que o modelo precisa aprender. {p} = produto, {n} = número.
nucleos = {
    "cobranca": [
        "fui cobrado duas vezes pelo pedido {n}", "o boleto do pedido {n} venceu e não consigo gerar outro",
        "a fatura do cartão veio com um valor maior que o do {p}", "paguei via pix e o pedido {n} continua como pendente de pagamento",
        "quero o reembolso do valor cobrado a mais", "o desconto do cupom não foi aplicado na cobrança",
        "apareceu uma cobrança que eu não reconheço no meu cartão", "o estorno do {p} ainda não caiu na minha conta",
        "parcelei em 3x mas cobraram à vista", "a nota fiscal do pedido {n} está com valor errado",
    ],
    "acesso": [
        "não consigo entrar na minha conta", "esqueci a senha e o e-mail de recuperação não chega",
        "minha conta foi bloqueada depois de errar a senha", "o código de verificação por SMS não chega",
        "o app fica pedindo login toda hora", "alguém trocou a senha da minha conta sem eu saber",
        "não consigo alterar o e-mail cadastrado", "aparece erro 403 quando tento acessar meus pedidos",
        "o login com Google parou de funcionar", "minha sessão expira assim que eu faço login",
    ],
    "entrega": [
        "meu pedido {n} está atrasado há {d} dias", "o rastreio do {p} não atualiza desde semana passada",
        "o pedido {n} consta como entregue mas não recebi nada", "a transportadora disse que meu endereço não existe",
        "quero mudar o endereço de entrega do pedido {n}", "o prazo de entrega do {p} passou e ninguém responde",
        "recebi o pedido de outra pessoa no lugar do meu", "o entregador deixou o pacote com o vizinho errado",
        "o {p} ficou parado no centro de distribuição", "qual a previsão de chegada do pedido {n}?",
    ],
    "defeito": [
        "o {p} chegou quebrado", "o {p} parou de funcionar depois de {d} dias de uso",
        "a tela do {p} veio com manchas", "o {p} não liga de jeito nenhum", "veio faltando uma peça do {p}",
        "o {p} esquenta demais e desliga sozinho", "o carregador do {p} não funciona",
        "o {p} veio com a embalagem violada e arranhado", "o botão do {p} está travado", "o {p} faz um barulho estranho",
    ],
    "cancelamento": [
        "quero cancelar o pedido {n}", "desisti da compra do {p}, como cancelo?",
        "quero cancelar minha assinatura do clube de frete", "comprei por engano, preciso cancelar antes do envio",
        "quero exercer o direito de arrependimento do {p}", "como cancelo o pedido {n} que ainda não foi enviado?",
        "quero encerrar minha conta e cancelar tudo", "cancelem o pedido {n}, achei mais barato em outro lugar",
    ],
}

# Desbalanceamento realista: entrega domina, cancelamento é raro. (dict preserva a ordem, como Object.entries)
pesos = {"entrega": 0.38, "cobranca": 0.24, "acesso": 0.16, "defeito": 0.13, "cancelamento": 0.09}
# Como cada time escreveu o rótulo no helpdesk ao longo dos anos (precisa padronizar).
variantes_rotulo = {
    "cobranca": ["cobranca", "Cobrança", "COBRANCA", "financeiro", " cobrança "],
    "acesso": ["acesso", "Acesso", "login", "ACESSO"],
    "entrega": ["entrega", "Entrega", "logistica", "ENTREGA ", "Logística"],
    "defeito": ["defeito", "Defeito", "produto com defeito", "troca"],
    "cancelamento": ["cancelamento", "Cancelamento", "CANCELAR"],
}


def sortear_categoria() -> str:
    r = rand()
    for cat, p in pesos.items():
        r -= p
        if r <= 0:
            return cat
    return "entrega"


def montar_texto(cat: str) -> str:
    template = pick(nucleos[cat])
    produto = pick(produtos)
    numero = str(10000 + math.floor(rand() * 90000))
    dias = str(2 + math.floor(rand() * 20))
    # str.replace com count=1 = String.replace do JS com string (troca só a 1ª ocorrência).
    nucleo = template.replace("{p}", produto, 1).replace("{n}", numero, 1).replace("{d}", dias, 1)
    frase = nucleo[:1].upper() + nucleo[1:]
    partes = [pick(aberturas), frase + ("" if frase.endswith("?") else "."), pick(fechos)]
    return " ".join(p for p in partes if p)


def sujar(texto: str) -> str:
    """Ruídos que aparecem em exportações reais."""
    r = rand()
    if r < 0.12:
        return f"<p>{texto.replace(' ', '&nbsp;')}</p><br>"  # corpo de e-mail em HTML
    if r < 0.2:
        return f"{texto} Meu e-mail é cliente{math.floor(rand() * 999)}@exemplo.com.br"  # PII
    if r < 0.27:
        cpf = math.floor(rand() * 9)
        tel = math.floor(rand() * 9)
        return f"{texto} CPF 123.456.789-0{cpf}, tel (11) 9{tel}876-5432"  # PII
    if r < 0.35:
        return f"   {texto.upper()}   "  # caixa alta e espaços
    return texto


def gerar() -> list[dict]:
    registros: list[dict] = []
    id_ = 1
    for _ in range(420):
        cat = sortear_categoria()
        texto = sujar(montar_texto(cat))
        canal = pick(["email", "chat", "app"])  # mesma ordem do objeto literal do JS: canal antes da categoria
        registros.append({"id": id_, "canal": canal, "texto": texto, "categoria": pick(variantes_rotulo[cat])})
        id_ += 1
        # ~10% de duplicatas: o mesmo cliente reenvia o ticket (às vezes com espaços/caixa diferentes).
        if rand() < 0.1:
            texto_dup = texto if rand() < 0.5 else f" {texto.lower()}  "
            registros.append({"id": id_, "canal": "email", "texto": texto_dup, "categoria": pick(variantes_rotulo[cat])})
            id_ += 1
    # Lixo que precisa ser descartado: texto vazio, curtíssimo, rótulo vazio ou fora do domínio.
    for canal, texto, categoria in [("chat", "", "entrega"), ("chat", "ok", "acesso"), ("app", "teste teste", ""),
                                    ("email", "Vocês vendem cartão-presente?", "outros"),
                                    ("email", "Parabéns pelo atendimento de ontem!", "elogio")]:
        registros.append({"id": id_, "canal": canal, "texto": texto, "categoria": categoria})
        id_ += 1
    return registros


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--saida", type=Path, default=DADOS / "python")
    args = ap.parse_args()
    registros = gerar()
    args.saida.mkdir(parents=True, exist_ok=True)
    destino = args.saida / "tickets-brutos.jsonl"
    destino.write_text("".join(json_js(r) + "\n" for r in registros), encoding="utf-8")
    print(f"Gerados {len(registros)} tickets brutos (SINTÉTICOS) em {destino.relative_to(Path.cwd(), walk_up=True)}")
    print("Exemplo de linha suja:", json_js(next(r for r in registros if r["texto"].startswith("<p>"))))
