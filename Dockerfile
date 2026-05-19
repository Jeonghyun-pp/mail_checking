# One image, two roles: the Next.js server (`npm run start`) and the BullMQ
# worker (`tsx src/worker/index.ts`). docker-compose.prod.yml picks the role
# per service via `command:`. Build this ON the target VM so Prisma's query
# engine is compiled for the host arch (arm64 on Oracle Ampere).

FROM node:22-bookworm-slim AS base
# openssl is required by the Prisma query engine at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- build stage: install ALL deps (tsx + prisma are devDeps), then build ----
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---- runtime stage: carries the build, node_modules (incl. tsx for the
#      worker), source, and the generated Prisma client ----
FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
EXPOSE 3000
CMD ["npm", "run", "start"]
