import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import https from 'node:https';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';

/** 强制 IPv4 的 HTTPS GET */
function httpsGet(url: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get(
      { host: u.hostname, path: u.pathname + u.search, family: 4, timeout: timeoutMs, headers: { 'User-Agent': 'miniTrek/0.1' } },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
          else resolve(data);
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
  });
}

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  if (row?.value) return row.value;
  // 未在库中配置时，用环境变量兜底（适合 Docker 部署时通过 .env 注入）
  if (key === 'amap_key') return process.env.AMAP_KEY || null;
  if (key === 'amap_web_key') return process.env.AMAP_WEB_KEY || null;
  return null;
}

/**
 * 高德 Web 服务代理：POI 搜索 / 地理编码
 * 需要「Web服务(Server)」类型的 Key（在设置页 amapWebKey 配置），
 * 与地图用的「Web端(JS API)」Key 不同。
 */
export async function amapRoutes(app: FastifyInstance) {
  // POI 搜索：GET /api/poi/search?keywords=瘦西湖&city=扬州&offset=10
  app.get('/poi/search', async (req, reply) => {
    const { keywords, city, offset } = req.query as { keywords?: string; city?: string; offset?: string };
    if (!keywords) return reply.code(400).send({ error: '缺少 keywords' });
    const key = await getSetting('amap_web_key');
    if (!key) {
      return reply.code(400).send({
        error: '未配置高德 Web 服务 Key，请到「设置」填写（地点搜索与地址定位需要）',
      });
    }
    const url =
      `https://restapi.amap.com/v3/place/text?key=${encodeURIComponent(key)}` +
      `&keywords=${encodeURIComponent(keywords)}` +
      (city ? `&city=${encodeURIComponent(city)}` : '') +
      `&offset=${Number(offset) || 10}&page=1&extensions=base`;
    try {
      const data = JSON.parse(await httpsGet(url));
      if (data.status !== '1') {
        return reply.code(502).send({ error: `高德搜索失败：${data.info || '未知错误'}` });
      }
      const pois = (data.pois || []).map((p: any) => {
        const [lng, lat] = String(p.location || '').split(',').map(Number);
        return {
          id: p.id,
          name: p.name,
          address: p.address || '',
          type: p.type || '',
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
        };
      });
      return { pois };
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
  });

  // 地理编码：GET /api/geocode?address=瘦西湖&city=扬州
  app.get('/geocode', async (req, reply) => {
    const { address, city } = req.query as { address?: string; city?: string };
    if (!address) return reply.code(400).send({ error: '缺少 address' });
    const key = await getSetting('amap_web_key');
    if (!key) {
      return reply.code(400).send({
        error: '未配置高德 Web 服务 Key，请到「设置」填写（地址定位需要）',
      });
    }
    const url =
      `https://restapi.amap.com/v3/geocode/geo?key=${encodeURIComponent(key)}` +
      `&address=${encodeURIComponent(address)}` +
      (city ? `&city=${encodeURIComponent(city)}` : '');
    try {
      const data = JSON.parse(await httpsGet(url));
      if (data.status !== '1') {
        return reply.code(502).send({ error: `高德地理编码失败：${data.info || '未知错误'}` });
      }
      const g = data.geocodes?.[0];
      if (!g?.location) return { result: null };
      const [lng, lat] = String(g.location).split(',').map(Number);
      return { result: { lat, lng, address: g.formatted_address || address } };
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
  });
}
