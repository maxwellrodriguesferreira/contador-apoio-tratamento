# Stage 1: Build da aplicação React Vite + TypeScript
FROM node:24-alpine AS builder

WORKDIR /app

# Copia manifestos de dependências
COPY package.json package-lock.json ./

# Instala dependências de forma limpa
RUN npm install

# Copia código-fonte e configurações
COPY . .

# Executa build de produção
RUN npm run build

# Stage 2: Servidor Web Nginx de Produção
FROM nginx:alpine

# Remove configuração padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/default.conf

# Copia configuração customizada com proxy reverso e SPA fallback
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os artefatos compilados do estágio anterior
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
