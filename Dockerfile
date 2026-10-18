FROM node:22.14.0-bookworm-slim AS build
WORKDIR /app
ENV COREPACK_HOME=/opt/corepack
COPY package.json pnpm-lock.yaml .npmrc ./
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
FROM node:22.14.0-bookworm-slim
WORKDIR /app
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate && chmod -R a+rX /opt/corepack
COPY --from=build --chown=node:node /app ./
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["pnpm", "start"]
