# F.O.G.O. em contêiner. Uso: docker compose up --build  →  http://localhost:3333
# node:22-slim: o better-sqlite3 já tem binário pronto para ela, então nada é compilado na construção.

# 1) Dependências de produção: só o servidor (Fastify, better-sqlite3, zod, tsx que roda o TypeScript). A interface (React, Leaflet, Recharts)
#    já vai compilada em dist/web, então suas bibliotecas ficam em devDependencies e não entram na imagem.
FROM node:22-slim AS producao
# Rede lenta ou instável (Wi-Fi de evento, VPN): o `npm ci` roda até 5 vezes; o cache do npm guarda o que já baixou.
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN for i in 1 2 3 4 5; do npm ci --omit=dev && break; [ $i -lt 5 ] || exit 1; done && npm cache clean --force

# 2) Interface compilada (dist/web, servida pelo próprio servidor). Aqui entram as dependências de desenvolvimento: só o Vite precisa delas.
FROM node:22-slim AS interface
# Rede lenta ou instável (Wi-Fi de evento, VPN): o `npm ci` roda até 5 vezes; o cache do npm guarda o que já baixou.
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN for i in 1 2 3 4 5; do npm ci && break; [ $i -lt 5 ] || exit 1; done
COPY tsconfig.json vite.config.ts ./
COPY shared ./shared
COPY web ./web
RUN npx vite build

# 3) Imagem final: servidor + interface pronta. O banco fica em /app/data (volume).
FROM node:22-slim
ENV NODE_ENV=production PORT=3333 HOST=0.0.0.0 FOGO_DB=/app/data/fogo.db
WORKDIR /app
COPY --from=producao /app/node_modules ./node_modules
COPY package.json ./
COPY shared ./shared
COPY server ./server
# server/porta.ts reexporta as mensagens de porta de scripts/checar-porta.mjs.
COPY scripts/checar-porta.mjs ./scripts/checar-porta.mjs
COPY --from=interface /app/dist ./dist
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME /app/data
EXPOSE 3333
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "server/index.ts"]
