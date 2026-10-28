# nginx с собранной веб-панелью. Контекст сборки — frontend/ (см. docker-compose.yml).
# Веб ходит в API по тому же адресу (/api/v1), поэтому CORS в проде не нужен.

FROM node:22-alpine AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=web /web/dist /usr/share/nginx/html
