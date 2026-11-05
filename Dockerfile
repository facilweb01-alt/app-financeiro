# Contay (app dos clientes) em contêiner — usado no VPS da Hostinger (05/11/2026).
# A imagem é construída pelo GitHub Actions (.github/workflows/imagem-docker.yml)
# e publicada em ghcr.io/facilweb01-alt/app-financeiro; o VPS só baixa e roda,
# sem gastar CPU/memória do servidor com o build.
#
# Na inicialização roda as migrações (drizzle-kit, igual ao Render) e depois o
# Next na porta 3000. Todas as variáveis (banco, Asaas, Evolution, Meta...)
# vêm do ambiente do contêiner, nunca da imagem.

FROM node:22-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 TZ=America/Sao_Paulo
COPY package.json package-lock.json ./
# Dependências completas: o drizzle-kit (migrações na inicialização) é de desenvolvimento.
RUN npm ci --no-audit --no-fund
COPY . .
# O "next build" carrega as rotas e o cliente do banco exige um endereço de
# banco só para montar o módulo (não conecta). Endereço falso, só no build;
# o de verdade vem do ambiente do contêiner.
RUN DATABASE_URL=postgres://build:build@127.0.0.1:1/build npm run build && chown -R node:node /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=10s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
