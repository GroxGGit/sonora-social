FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    MUSIC_DB_PATH=/app/data/sonora.sqlite

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
