# Build a partir da raiz do repositório: docker build -f apps/worker/Dockerfile .
FROM node:24-alpine

WORKDIR /app

# Monorepo com npm workspaces: o package-lock.json fica na raiz.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/ui/package.json apps/ui/
RUN npm ci --omit=dev --workspace apps/worker

COPY apps/worker apps/worker

WORKDIR /app/apps/worker
USER node
EXPOSE 3001

CMD ["node", "src/server.js"]
