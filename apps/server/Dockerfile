# Production image for the API server (apps/server). Build from the repo root, since the
# server depends on the workspace packages:
#
#   docker build -f apps/server/Dockerfile -t jevschedule-server .
#   docker run --rm -e DATABASE_URL=postgres://... jevschedule-server node docker/migrate.mjs
#   docker run -d -p 3000:3000 -e DATABASE_URL=postgres://... jevschedule-server
#
# The server listens on 0.0.0.0:$PORT (3000) and answers GET /health.

FROM node:24-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# Manifests first so the dependency layer stays cached until they change. The install is
# filtered to the server and its workspace deps so the desktop app's Electron isn't fetched.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/scraper/package.json packages/scraper/
RUN pnpm install --frozen-lockfile --filter @jevschedule/server...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/scraper packages/scraper
COPY apps/server apps/server
RUN pnpm --filter @jevschedule/server... build

# Production deps only, with the workspace packages copied in (not symlinked).
RUN pnpm --filter @jevschedule/server deploy --prod /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DEGREE_DATA_DIR=/app/data/degrees

# Same layout as the repo: dist/ resolves data/degrees relative to apps/server.
WORKDIR /app/apps/server
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules node_modules
COPY --from=build /out/dist dist
COPY --from=build /out/drizzle drizzle
COPY --from=build /out/docker docker
COPY data/degrees /app/data/degrees

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
