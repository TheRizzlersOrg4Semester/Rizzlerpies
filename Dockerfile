FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 4000

CMD ["npm", "start"]
