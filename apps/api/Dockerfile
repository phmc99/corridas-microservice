FROM node:24-alpine

# O Prisma precisa do OpenSSL, que não vem na imagem alpine.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npx prisma generate --schema src/database/schema.prisma

USER node
EXPOSE 3000

CMD ["sh", "-c", "npm run migrate && exec node src/server.js"]
