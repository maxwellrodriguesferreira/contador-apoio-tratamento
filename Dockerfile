# ==============================================================================
# Stage 1: Compilação do Frontend (React 18 + Vite + Tailwind CSS)
# ==============================================================================
FROM node:24-alpine AS client-builder

WORKDIR /app

# Copia manifestos de dependências do frontend
COPY package.json package-lock.json ./
RUN npm ci || npm install

# Copia arquivos de configuração e código-fonte do frontend
COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts postcss.config.js tailwind.config.js ./
COPY src/ ./src/

# Executa compilação estática do Vite (gera artefatos em /app/dist)
RUN npm run build

# ==============================================================================
# Stage 2: Compilação do Backend (Node.js 24 + TypeScript)
# ==============================================================================
FROM node:24-alpine AS server-builder

WORKDIR /app/server

# Copia manifestos de dependências do backend
COPY server/package.json server/package-lock.json ./
RUN npm ci || npm install

# Copia configurações e código-fonte do backend
COPY server/tsconfig.json ./
COPY server/src/ ./src/

# Executa compilação TypeScript e cópia do schema SQL
RUN npm run build

# ==============================================================================
# Stage 3: Runtime de Produção Unificado (Single Container)
# ==============================================================================
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV CLIENT_BUILD_PATH=/app/client
ENV DATABASE_DIR=/app/data

# Instala apenas dependências de produção do backend
COPY server/package.json server/package-lock.json ./
RUN npm install --omit=dev

# Copia o backend compilado
COPY --from=server-builder /app/server/dist ./dist

# Copia os arquivos estáticos do frontend
COPY --from=client-builder /app/dist ./client

# Configura diretório para persistência do banco local (D1 SQLite Engine) com permissão adequada
RUN mkdir -p /app/data && chown -R node:node /app

# Execução segura com usuário não-root
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
