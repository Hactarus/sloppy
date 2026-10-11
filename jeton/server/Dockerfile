# Build context = repository directory `jeton/` (see docker-compose.yml):  docker build -f server/Dockerfile -t jeton-server:0.1.0 .
# Produces the same image layout as release/build.sh (crane, no daemon): everything under /app, entrypoint /app/bin/jeton.
FROM node:22-bookworm-slim AS appbuild
RUN corepack enable
WORKDIR /src/app
COPY app/package.json app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY api /src/api
COPY app/ ./
RUN pnpm build

FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /src/server
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN pnpm build
RUN mkdir /deps && cp package.json pnpm-lock.yaml /deps/ \
 && printf 'nodeLinker: hoisted\n' > /deps/pnpm-workspace.yaml \
 && cd /deps && pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:22-bookworm-slim
ARG VERSION=0.1.0
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 \
    STATIC_DIR=/app/public MIGRATIONS_DIR=/app/db/migrations OPENAPI_PATH=/app/api/openapi.yaml APP_VERSION=${VERSION}
WORKDIR /app
COPY --from=build /deps/node_modules ./node_modules
COPY --from=build /src/server/dist ./dist
COPY server/package.json ./
COPY db/migrations ./db/migrations
COPY api/openapi.yaml ./api/openapi.yaml
COPY --from=appbuild /src/app/dist ./public
COPY release/bin/jeton ./bin/jeton
RUN echo "${VERSION}" > VERSION
USER node
EXPOSE 3000
ENTRYPOINT ["/app/bin/jeton"]
CMD ["serve"]
