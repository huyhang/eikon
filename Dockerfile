# syntax=docker/dockerfile:1
# Eikon — runs on the Synology NAS. Build context: repository root.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
COPY fake-tagger/package.json fake-tagger/
COPY tools/package.json tools/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY web web
RUN npm run build -w web && npm run build -w server

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    EIKON_LIBRARY_DIR=/library \
    EIKON_DATA_DIR=/data \
    EIKON_WEB_DIST=/app/web
WORKDIR /app
# The server is a single bundle; sharp (native libvips bindings) is its only external dependency.
COPY server/package.json /tmp/server-package.json
RUN SHARP_VERSION="$(node -p "require('/tmp/server-package.json').dependencies.sharp")" \
 && npm install --omit=dev --no-audit --no-fund --no-package-lock "sharp@${SHARP_VERSION}" \
 && npm cache clean --force && rm /tmp/server-package.json
COPY --from=build /app/server/dist ./server
COPY --from=build /app/web/dist ./web
RUN mkdir -p /data /library && chown node:node /data
USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/auth/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/main.mjs"]
