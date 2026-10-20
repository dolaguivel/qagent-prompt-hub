FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
RUN mkdir -p storage && chown node:node storage
USER node
ENV PORT=3000
EXPOSE 3000
VOLUME ["/app/storage"]
HEALTHCHECK CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
