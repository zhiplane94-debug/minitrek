import type { FastifyInstance } from 'fastify';
import { ensureShareToken, getTrip, getTripByShareToken } from '../db/queries.js';

export async function shareRoutes(app: FastifyInstance) {
  // 生成/获取分享链接：POST /api/trips/:id/share
  app.post('/trips/:id/share', async (req, reply) => {
    const { id } = req.params as { id: string };
    const trip = await getTrip(id);
    if (!trip) return reply.code(404).send({ error: '行程不存在' });
    const token = await ensureShareToken(id);
    return { shareUrl: `/share/${token}` };
  });

  // 只读分享访问：GET /api/share/:token
  app.get('/share/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const trip = await getTripByShareToken(token);
    if (!trip) return reply.code(404).send({ error: '分享链接无效或已失效' });
    return trip;
  });
}
