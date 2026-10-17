# UI Angular · Políticas com Fonte

Front-end do Micro-SaaS (Angular 22, componentes standalone, signals, sem zone.js). Fala com o back-end por
REST (`/v1`) e por MCP (`/mcp`, SDK oficial no navegador). Guia completo:
[entrega 3](../../exemplos/03-entrega-3-front-e-implantacao/).

```bash
# o Angular CLI 22 exige Node >= 24.15: rodamos dentro do container node:24.22.0-alpine
bash ../../exemplos/03-entrega-3-front-e-implantacao/build-web.sh   # npm ci + ng build -> dist/web/browser
```
