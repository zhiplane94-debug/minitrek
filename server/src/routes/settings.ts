import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  if (row?.value) return row.value;
  // 未在库中配置时，用环境变量兜底（适合 Docker 部署时通过 .env 注入）
  if (key === 'amap_key') return process.env.AMAP_KEY || null;
  if (key === 'amap_web_key') return process.env.AMAP_WEB_KEY || null;
  return null;
}

async function setSetting(key: string, value: string) {
  const now = new Date().toISOString();
  await db
    .insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
}

export async function settingsRoutes(app: FastifyInstance) {
  // 读取设置
  app.get('/settings', async () => {
    const amapKey = await getSetting('amap_key');
    const amapWebKey = await getSetting('amap_web_key');
    return { amapKey, amapWebKey };
  });

  // 保存设置
  app.put('/settings', async (req, reply) => {
    const body = req.body as { amapKey?: string; amapWebKey?: string };
    if (body.amapKey === undefined && body.amapWebKey === undefined) {
      return reply.code(400).send({ error: '缺少设置字段' });
    }
    const amapKey = body.amapKey !== undefined ? String(body.amapKey).trim() : undefined;
    const amapWebKey = body.amapWebKey !== undefined ? String(body.amapWebKey).trim() : undefined;
    if (amapKey !== undefined) await setSetting('amap_key', amapKey);
    if (amapWebKey !== undefined) await setSetting('amap_web_key', amapWebKey);
    return { ok: true, amapKey: amapKey ?? null, amapWebKey: amapWebKey ?? null };
  });
}
