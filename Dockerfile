FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY package.json ./
COPY shared/ ./shared/
COPY server/ ./server/
COPY --from=builder /app/client/dist/ ./client/dist/
COPY --from=builder /app/admin/dist/ ./admin/dist/
COPY --from=builder /app/node_modules/ ./node_modules/
EXPOSE 3001
CMD ["bun", "server/index.ts"]
