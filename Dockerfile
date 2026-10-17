# F.O.G.O. em contêiner. Uso: docker compose up --build  →  http://localhost:3333
# node:22-slim: o better-sqlite3 já tem binário pronto para ela, então nada é compilado na construção.

# 1) Dependências (com as de desenvolvimento: o Vite compila a interface e o tsx roda o servidor TypeScript).
FROM node:22-slim AS dependencias
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# 2) Interface compilada (dist/web, servida pelo próprio servidor).
FROM dependencias AS interface
COPY tsconfig.json vite.config.ts ./
COPY shared ./shared
COPY web ./web
RUN npx vite build

# 3) Imagem final: servidor + interface pronta. O banco fica em /app/data (volume).
FROM node:22-slim
ENV NODE_ENV=production PORT=3333 FOGO_DB=/app/data/fogo.db
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY package.json ./
COPY shared ./shared
COPY server ./server
COPY --from=interface /app/dist ./dist
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME /app/data
EXPOSE 3333
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "server/index.ts"]
