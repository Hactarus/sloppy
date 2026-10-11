# Build context = repository directory `jeton/` (see docker-compose.yml)
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app/jeton/server
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN pnpm build && pnpm prune --prod

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/jeton/server
COPY --from=build /app/jeton/server/node_modules ./node_modules
COPY --from=build /app/jeton/server/dist ./dist
COPY server/package.json ./
# The OpenAPI file (routes + roles) and the SQL migrations are read at runtime (../../api, ../../db relative to dist/)
COPY api/openapi.yaml /app/jeton/api/openapi.yaml
COPY db/migrations /app/jeton/db/migrations
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
