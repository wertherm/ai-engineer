# Imagem da API Python (FastAPI: REST + MCP). Contexto de build: a pasta do módulo
#   docker build -f app_py/Dockerfile .
# O que entra/sai do contexto está em app_py/Dockerfile.dockerignore (o BuildKit usa esse arquivo no lugar
# do .dockerignore da raiz, que é o da imagem JS).
FROM python:3.14.7-slim-trixie
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv
WORKDIR /srv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never PYTHONUNBUFFERED=1
# Camada de dependências separada do código: mudar um .py não reinstala nada. --no-dev: sem pytest,
# ruff, playwright nem ADK na imagem; --no-install-project: o código roda direto de /srv (python -m).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY app_py app_py
COPY app/dados app/dados
RUN useradd --system --uid 10001 api
USER api
ENV PATH=/srv/.venv/bin:$PATH HOST=0.0.0.0 PORT=31100
EXPOSE 31100
HEALTHCHECK --interval=5s --timeout=3s --retries=12 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:31100/health', timeout=2)" || exit 1
CMD ["python", "-m", "app_py.server"]
