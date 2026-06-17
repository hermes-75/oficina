# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_HERMES_BRIDGE_URL=ws://localhost:8787
ENV VITE_HERMES_BRIDGE_URL=$VITE_HERMES_BRIDGE_URL
RUN npm run build

# Stage 2: Production
FROM node:22-alpine
WORKDIR /app

# Solo lo necesario para servir y ejecutar el bridge
COPY --from=builder /app/dist       ./dist
COPY --from=builder /app/server     ./server
COPY --from=builder /app/serve.mjs  ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 5174
EXPOSE 8787

ENV \
  HERMES_MOCK=1 \
  HERMES_BRIDGE_PORT=8787 \
  VITE_HERMES_BRIDGE_URL=ws://localhost:8787

CMD ["node", "serve.mjs"]
