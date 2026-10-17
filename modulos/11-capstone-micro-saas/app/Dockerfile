# Imagem da API (REST + MCP). Contexto de build: a pasta do módulo (docker build -f app/Dockerfile .).
FROM node:24.22.0-alpine
WORKDIR /srv
ENV NODE_ENV=production
# Camada de dependências separada do código: mudar um .js não reinstala nada.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY app/src app/src
COPY app/dados app/dados
USER node
ENV HOST=0.0.0.0 PORT=31100
EXPOSE 31100
HEALTHCHECK --interval=5s --timeout=3s --retries=12 CMD wget -qO- http://127.0.0.1:31100/health || exit 1
CMD ["node", "app/src/server.js"]
