import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { tripsRoutes } from './routes/trips.js';
import { activitiesRoutes } from './routes/activities.js';
import { settingsRoutes } from './routes/settings.js';
import { weatherRoutes } from './routes/weather.js';
import { trainRoutes } from './routes/train.js';
import { shareRoutes } from './routes/share.js';
import { amapRoutes } from './routes/amap.js';
import { mcpRoutes } from './mcp/index.js';
import { mcpTokenRoutes } from './routes/mcp-token.js';
import { authRoutes } from './routes/auth.js';
import { db, sqlite } from './db/index.js';
import { verifySession, extractToken } from './auth.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 启动时自动应用数据库迁移（首次运行自动建表）
const drizzleDir = path.resolve(__dirname, '../drizzle');
if (fs.existsSync(drizzleDir)) {
  migrate(db, { migrationsFolder: drizzleDir });
}

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// REST 鉴权：除白名单外，/api/* 需 Web 登录会话（MCP 的 /mcp 走自己的 Bearer Token 校验，不受影响）
app.addHook('preHandler', async (req, reply) => {
  const url = req.url ?? '';
  if (!url.startsWith('/api/')) return; // 静态资源与 /mcp 放行
  if (url === '/api/health') return; // 健康检查
  if (url.startsWith('/api/auth/login')) return; // 登录本身
  if (url.startsWith('/api/share/')) return; // 只读分享链接（发给家人/朋友）
  const token = extractToken(req);
  if (!(await verifySession(token))) {
    return reply.code(401).send({ error: '未登录或会话已过期' });
  }
});

app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

await app.register(authRoutes, { prefix: '/api' });
await app.register(tripsRoutes, { prefix: '/api/trips' });
await app.register(activitiesRoutes, { prefix: '/api' });
await app.register(settingsRoutes, { prefix: '/api' });
await app.register(weatherRoutes, { prefix: '/api' });
await app.register(trainRoutes, { prefix: '/api' });
await app.register(shareRoutes, { prefix: '/api' });
await app.register(amapRoutes, { prefix: '/api' });
await app.register(mcpRoutes);
await app.register(mcpTokenRoutes, { prefix: '/api' });

// 生产模式：托管前端构建产物（SPA fallback）
const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url?.startsWith('/api') || req.url?.startsWith('/mcp')) {
      return reply.code(404).send({ error: 'Not Found' });
    }
    reply.sendFile('index.html');
  });
}

const port = Number(process.env.PORT || 8288);
try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
