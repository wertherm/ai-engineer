# Dockerfile com problemas PLANTADOS: tag latest, sem USER (roda como root), ADD remoto.
FROM node:latest
ADD https://example.com/app.tar.gz /app/
WORKDIR /app
CMD ["node", "server.js"]
