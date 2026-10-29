FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# Le monorepo conserve ses liens workspace et les chemins de métadonnées du BFF.
COPY --from=build --chown=node:node /app /app
USER node
ENV NODE_ENV=production
CMD ["node", "apps/core/dist/main.js"]
