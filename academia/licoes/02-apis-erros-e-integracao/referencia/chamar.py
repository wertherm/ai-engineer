#!/usr/bin/env python3
"""Solução de referência da Lição 2 em Python (só biblioteca padrão): o mesmo cliente de LLM robusto de chamar.ts.

    python chamar.py "Diga olá em uma palavra."

Contrato (variáveis de ambiente, formato do JSON de saída, os nove tipos de erro): kit/contrato.mjs e a seção 8 da lição.
Detalhe que difere do Node: o `timeout` de http.client/urllib vale POR OPERAÇÃO de rede (conectar, enviar, cada leitura), não para a
tentativa inteira. Um servidor que manda um byte a cada 100 ms nunca "estoura" esse timeout. Por isso aqui há um PRAZO total por tentativa,
conferido a cada leitura (o verificador tem o cenário `gotejamento` para isso).
"""
import http.client
import json
import os
import random
import re
import sys
import time
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit

REPETIVEIS = {"rede", "timeout", "limite_de_taxa", "servidor"}
PADRAO_DE_COTA = re.compile(r"quota|credit|spend_limit|usage_limit|billing", re.I)


class ErroLLM(Exception):
    """Falha de uma chamada, com um dos nove tipos do contrato."""

    def __init__(self, tipo, mensagem, status=None, espera_sugerida_ms=None):
        super().__init__(mensagem)
        self.tipo = tipo
        self.mensagem = mensagem
        self.status = status
        self.espera_sugerida_ms = espera_sugerida_ms  # do cabeçalho Retry-After, se houve
        self.tentativas = 0

    @property
    def repetivel(self):
        return self.tipo in REPETIVEIS


# ---------------------------------------------------------------------------------------------------------------------------------
# Configuração: tudo vem do ambiente. Trocar de provedor é trocar variáveis, nunca editar este arquivo.
# ---------------------------------------------------------------------------------------------------------------------------------
def _inteiro(env, nome, padrao, minimo, maximo=2**53):
    bruto = env.get(nome)
    if bruto is None or bruto == "":
        return padrao
    try:
        n = int(bruto)
    except ValueError:
        n = None
    if n is None or n < minimo or n > maximo:
        raise ValueError(f'{nome} deve ser um inteiro de {minimo} a {maximo} (veio "{bruto}")')
    return n


def ler_configuracao(env):
    def obrigatoria(nome):
        v = env.get(nome)
        if not v:
            raise ValueError(f"defina a variável de ambiente {nome}")
        return v

    base_url = obrigatoria("OPENAI_BASE_URL").rstrip("/")
    partes = urlsplit(base_url)
    if partes.scheme not in ("http", "https") or not partes.hostname:
        raise ValueError("OPENAI_BASE_URL deve ser uma URL http:// ou https://")
    param = env.get("PARAM_MAX_TOKENS") or "max_tokens"
    if not re.fullmatch(r"[a-z_]{3,40}", param):
        raise ValueError("PARAM_MAX_TOKENS deve ser um nome de campo como max_tokens ou max_completion_tokens")
    t = env.get("TEMPERATURA", "0")
    if t == "omitir":
        temperatura = None
    elif t == "":
        temperatura = 0.0
    else:
        try:
            temperatura = float(t)
        except ValueError:
            temperatura = -1.0
        if not 0 <= temperatura <= 2:
            raise ValueError('TEMPERATURA deve ser um número de 0 a 2 ou "omitir"')
    return {
        "base_url": base_url,
        "chave": obrigatoria("OPENAI_API_KEY"),
        "modelo": obrigatoria("MODELO_CHAT"),
        "param_max_tokens": param,
        "temperatura": temperatura,
        "max_tokens": _inteiro(env, "MAX_TOKENS", 64, 1, 100_000),
        "timeout_ms": _inteiro(env, "TIMEOUT_MS", 30_000, 1, 600_000),
        "max_tentativas": _inteiro(env, "MAX_TENTATIVAS", 3, 1, 10),
        "backoff_base_ms": _inteiro(env, "BACKOFF_BASE_MS", 500, 0),
        "backoff_teto_ms": _inteiro(env, "BACKOFF_TETO_MS", 8_000, 0),
        "espera_max_ms": _inteiro(env, "ESPERA_MAX_MS", 60_000, 0),
    }


# ---------------------------------------------------------------------------------------------------------------------------------
# Segredos
# ---------------------------------------------------------------------------------------------------------------------------------
def mascarar(texto, chave):
    t = texto
    if len(chave) >= 4:
        t = t.replace(chave, "***")
    t = re.sub(r"\bsk-[A-Za-z0-9_-]{6,}", "***", t)
    t = re.sub(r"\bBearer\s+[A-Za-z0-9._~+/=-]{6,}", "Bearer ***", t, flags=re.I)
    return re.sub(r"\s+", " ", t).strip()[:300]


# ---------------------------------------------------------------------------------------------------------------------------------
# Espera entre tentativas
# ---------------------------------------------------------------------------------------------------------------------------------
def ler_retry_after(valor, agora_ms=None):
    """Retry-After pode ser um número de segundos ou uma data HTTP. Devolve milissegundos, ou None se não entender."""
    if valor is None:
        return None
    v = valor.strip()
    if re.fullmatch(r"\d+(\.\d+)?", v):
        return round(float(v) * 1000)
    try:
        data = parsedate_to_datetime(v)
    except (TypeError, ValueError):
        return None
    agora = agora_ms if agora_ms is not None else time.time() * 1000
    return max(0, round(data.timestamp() * 1000 - agora))


def espera_de_backoff(tentativa_que_falhou, base_ms, teto_ms, aleatorio=random.random):
    """Backoff exponencial com *full jitter*: sorteia entre 0 e min(teto, base × 2^(n−1))."""
    limite = min(teto_ms, base_ms * 2 ** (tentativa_que_falhou - 1))
    return int(aleatorio() * limite)


# ---------------------------------------------------------------------------------------------------------------------------------
# Uma tentativa
# ---------------------------------------------------------------------------------------------------------------------------------
def _erro_de_http(status, corpo, cabecalho_retry_after, chave):
    codigo, mensagem = "", corpo
    try:
        e = json.loads(corpo).get("error") or {}
        detalhes = e.get("details") if isinstance(e.get("details"), dict) else {}
        # OpenAI: `code` e `type`; Anthropic: o 429 de teto de gasto tem o mesmo `type` de um limite de taxa e só `details.error_code` o distingue
        codigo = f"{e.get('code') if isinstance(e.get('code'), str) else ''} {e.get('type') if isinstance(e.get('type'), str) else ''} {detalhes.get('error_code') if isinstance(detalhes.get('error_code'), str) else ''}"
        if isinstance(e.get("message"), str):
            mensagem = e["message"]
    except (ValueError, AttributeError):
        pass  # corpo que não é JSON: usa o texto cru, cortado
    texto = f"HTTP {status}: {mascarar(mensagem, chave)}"
    espera = ler_retry_after(cabecalho_retry_after)
    if status in (401, 403):
        return ErroLLM("autenticacao", texto, status=status)
    if status == 429:
        if PADRAO_DE_COTA.search(codigo):
            return ErroLLM("cota_esgotada", texto, status=status)
        return ErroLLM("limite_de_taxa", texto, status=status, espera_sugerida_ms=espera)
    if status == 408 or status >= 500:
        return ErroLLM("servidor", texto, status=status, espera_sugerida_ms=espera)
    return ErroLLM("requisicao_invalida", texto, status=status)  # 4xx e redirecionamentos (não os seguimos: o destino é decidido por quem respondeu, não por você)


def _uma_tentativa(prompt, cfg):
    corpo = {"model": cfg["modelo"], "messages": [{"role": "user", "content": prompt}], cfg["param_max_tokens"]: cfg["max_tokens"]}
    if cfg["temperatura"] is not None:
        corpo["temperature"] = cfg["temperatura"]
    alvo = urlsplit(cfg["base_url"])
    prazo = time.monotonic() + cfg["timeout_ms"] / 1000
    restante = lambda: max(prazo - time.monotonic(), 0.001)  # noqa: E731
    classe = http.client.HTTPSConnection if alvo.scheme == "https" else http.client.HTTPConnection
    conexao = classe(alvo.hostname, alvo.port, timeout=restante())
    try:
        conexao.request(
            "POST", f"{alvo.path.rstrip('/')}/chat/completions", body=json.dumps(corpo).encode("utf-8"),
            headers={"content-type": "application/json", "authorization": f"Bearer {cfg['chave']}"},
        )
        conexao.sock.settimeout(restante())
        resposta = conexao.getresponse()
        pedacos = []
        while True:
            if prazo - time.monotonic() <= 0:
                raise TimeoutError()
            conexao.sock.settimeout(restante())
            pedaco = resposta.read1(4096)  # read1 devolve o que já chegou (read(n) esperaria encher o buffer e furaria o prazo)
            if not pedaco:
                break
            pedacos.append(pedaco)
        texto = b"".join(pedacos).decode("utf-8", errors="replace")
        status = resposta.status
        retry_after = resposta.getheader("retry-after")
    except TimeoutError:  # inclui socket.timeout (Python 3.10+)
        raise ErroLLM("timeout", f"sem resposta completa em {cfg['timeout_ms']} ms") from None
    except (OSError, http.client.HTTPException):
        raise ErroLLM("rede", f"não foi possível falar com {alvo.scheme}://{alvo.netloc.rsplit('@', 1)[-1]}") from None  # sem usuário e senha da URL
    finally:
        conexao.close()

    if not 200 <= status < 300:
        raise _erro_de_http(status, texto, retry_after, cfg["chave"])
    try:
        dados = json.loads(texto)
        escolha = dados["choices"][0]
        conteudo, finish_reason = escolha["message"]["content"], escolha["finish_reason"]
        if not isinstance(conteudo, str) or not isinstance(finish_reason, str):
            raise TypeError()
    except (ValueError, KeyError, IndexError, TypeError):
        raise ErroLLM("resposta_invalida", f"HTTP {status} sem um JSON de chat com choices[0].message.content e finish_reason", status=status) from None
    if finish_reason == "length":
        raise ErroLLM("truncado", f"a resposta foi cortada em {cfg['max_tokens']} tokens (finish_reason \"length\"): aumente MAX_TOKENS ou simplifique o pedido", status=status)
    uso = dados.get("usage") if isinstance(dados.get("usage"), dict) else {}
    return {
        "texto": conteudo,
        "finish_reason": finish_reason,
        "usage": {k: uso.get(k, 0) if isinstance(uso.get(k, 0), int) else 0 for k in ("prompt_tokens", "completion_tokens", "total_tokens")},
    }


# ---------------------------------------------------------------------------------------------------------------------------------
# Várias tentativas, só nas falhas que se resolvem sozinhas
# ---------------------------------------------------------------------------------------------------------------------------------
def chamar(prompt, cfg, dormir=time.sleep, aleatorio=random.random, registrar=lambda m: None):
    tentativa = 0
    while True:
        tentativa += 1
        try:
            return {**_uma_tentativa(prompt, cfg), "tentativas": tentativa}
        except ErroLLM as erro:
            erro.tentativas = tentativa
            if not erro.repetivel or tentativa >= cfg["max_tentativas"]:
                raise
            pedida = erro.espera_sugerida_ms
            if pedida is not None and pedida > cfg["espera_max_ms"]:
                raise  # o provedor pediu mais espera do que aceitamos: desista, não trave
            espera = pedida if pedida is not None else espera_de_backoff(tentativa, cfg["backoff_base_ms"], cfg["backoff_teto_ms"], aleatorio)
            registrar(f"tentativa {tentativa} falhou ({erro.tipo}); esperando {espera} ms")
            dormir(espera / 1000)


# ---------------------------------------------------------------------------------------------------------------------------------
# Linha de comando: uma linha JSON no stdout, logs no stderr, código 0 (sucesso), 1 (falha da chamada) ou 2 (uso/configuração)
# ---------------------------------------------------------------------------------------------------------------------------------
def principal(argv, env):
    if not argv:
        print('uso: python chamar.py "<prompt>"', file=sys.stderr)
        return 2
    try:
        cfg = ler_configuracao(env)
    except ValueError as e:
        print(f"configuração inválida: {e}", file=sys.stderr)
        return 2
    try:
        r = chamar(argv[0], cfg, registrar=lambda m: print(m, file=sys.stderr))
        print(json.dumps({"ok": True, **r}))
        return 0
    except ErroLLM as erro:
        print(json.dumps({"ok": False, "erro": {"tipo": erro.tipo, "repetivel": erro.repetivel, "status": erro.status, "mensagem": mascarar(erro.mensagem, cfg["chave"])}, "tentativas": erro.tentativas or 1}))
        return 1


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:], os.environ))
