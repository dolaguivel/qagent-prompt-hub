# QAgent Prompt Hub server image.
# With DATABASE_URL set it uses PostgreSQL; otherwise SQLite in /app/storage (mount a volume there).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY catalog ./catalog
COPY public ./public
RUN mkdir -p storage && chown node:node storage
USER node
ENV PORT=3000
EXPOSE 3000
VOLUME ["/app/storage"]
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
