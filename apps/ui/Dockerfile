# Build a partir da raiz do repositório: docker build -f apps/ui/Dockerfile .
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/ui/package.json apps/ui/
RUN npm ci --workspace apps/ui

COPY apps/ui apps/ui
RUN npm run build --workspace apps/ui

# A imagem final só serve os arquivos estáticos gerados pelo Vite.
FROM nginx:1.29-alpine
COPY apps/ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/ui/dist /usr/share/nginx/html
EXPOSE 80
