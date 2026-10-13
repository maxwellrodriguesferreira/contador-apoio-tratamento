# Stage 1: Build do Backend TypeScript
FROM node:24-alpine AS builder

WORKDIR /app

# Copia manifestos de dependências do servidor
COPY package.json package-lock.json ./

# Instala dependências
RUN npm install

# Copia código-fonte e configurações
COPY . .

# Compila o TypeScript para dist
RUN npm run build

# Stage 2: Runtime de Produção Node.js
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copia arquivos de dependências
COPY package.json package-lock.json ./

# Instala apenas dependências de produção
RUN npm install --omit=dev

# Copia build compilado
COPY --from=builder /app/dist ./dist

# Cria diretório para persistência do banco local (D1 SQLite Engine)
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 4000

CMD ["node", "dist/index.js"]
