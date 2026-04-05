FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY server ./server

ENV NODE_ENV=production

CMD ["node", "server/index.mjs"]
