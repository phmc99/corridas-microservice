# Build a partir da raiz do repositório: docker build -f apps/api/Dockerfile .
FROM node:24-alpine

# O Prisma precisa do OpenSSL, que não vem na imagem alpine.
RUN apk add --no-cache openssl

WORKDIR /app

# Monorepo com npm workspaces: o package-lock.json fica na raiz.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/ui/package.json apps/ui/
RUN npm ci --omit=dev --workspace apps/api

COPY apps/api apps/api

WORKDIR /app/apps/api
RUN npx prisma generate --schema src/database/schema.prisma

USER node
EXPOSE 3000

CMD ["sh", "-c", "npm run migrate && exec node src/server.js"]
