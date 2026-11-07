# Grantit API image: Node 24 runs the TypeScript sources directly (type stripping).
# Build context is the repo root (see deploy/31-grantit.sh).
FROM node:24-alpine
WORKDIR /app

# npm workspaces need every workspace's package.json present for ci to resolve.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund --omit=dev -w shared -w api

COPY shared/ shared/
COPY api/ api/

ENV HOST=0.0.0.0 PORT=8787 NODE_ENV=production
EXPOSE 8787
WORKDIR /app/api
CMD ["node", "src/server.ts"]
