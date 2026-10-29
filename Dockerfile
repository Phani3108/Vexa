# Single image: builds the web dashboard, then runs the API which serves it.
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY --from=web /app/web/dist /app/web/dist
# Run as the unprivileged node user; recordings live on a volume it owns
RUN mkdir -p /data/recordings /app/backend/.data /app/backend/logs && chown -R node:node /data/recordings /app/backend/.data /app/backend/logs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" >/dev/null || exit 1
CMD ["node", "src/app.js"]
