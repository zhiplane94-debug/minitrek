# ---- 阶段1：构建前端 ----
FROM node:20-slim AS web-build
WORKDIR /build/web
COPY web/package.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# ---- 阶段2：后端依赖与源码 ----
FROM node:20-slim AS server
WORKDIR /app
COPY server/package.json ./
RUN npm install
COPY server/ ./

# ---- 阶段3：运行时（合并前端产物 + 后端） ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8288
COPY --from=server /app ./server
COPY --from=web-build /build/web/dist ./web/dist
RUN mkdir -p /app/data
WORKDIR /app/server
EXPOSE 8288
CMD ["node", "--import", "tsx", "src/index.ts"]
