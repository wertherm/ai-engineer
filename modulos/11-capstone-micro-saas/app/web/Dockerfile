# Imagem do front: build do Angular (Node >= 24.15, exigência do CLI 22) e nginx servindo os estáticos
# e fazendo proxy de /v1, /mcp e /docs para a API (mesma origem: sem CORS no navegador).
FROM node:24.22.0-alpine AS build
WORKDIR /w
ENV NG_CLI_ANALYTICS=false
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx ng build

FROM nginx:1.31.7-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /w/dist/web/browser /usr/share/nginx/html
EXPOSE 80
