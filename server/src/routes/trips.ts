import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { trips } from '../db/schema.js';
import { createTrip, deleteTrip, getTrip, importTrip, listTrips, updateTrip } from '../db/queries.js';

export async function tripsRoutes(app: FastifyInstance) {
  // 行程列表
  app.get('/', async () => listTrips());

  // 新建行程（按日期范围自动生成天数）
  app.post('/', async (req, reply) => {
    const body = req.body as {
      title?: string;
      origin?: string;
      destination?: string;
      startDate?: string;
      endDate?: string;
    };
    if (!body.title || !body.origin || !body.destination || !body.startDate) {
      return reply
        .code(400)
        .send({ error: '缺少必填字段: title / origin / destination / startDate' });
    }
    return createTrip({
      title: body.title,
      origin: body.origin,
      destination: body.destination,
      startDate: body.startDate,
      endDate: body.endDate,
    });
  });

  // 批量导入（md 导入用）：一次创建行程+天数+节点
  app.post('/import', async (req, reply) => {
    const body = req.body as {
      title?: string;
      origin?: string;
      destination?: string;
      startDate?: string;
      endDate?: string;
      days?: {
        date: string;
        weatherTemp?: number | null;
        weatherDesc?: string | null;
        note?: string | null;
        activities?: { type?: string; name: string; address?: string | null; time?: string | null; cost?: number | null; bookStatus?: string; note?: string | null }[];
      }[];
    };
    if (!body.title || !body.origin || !body.destination || !body.startDate) {
      return reply
        .code(400)
        .send({ error: '缺少必填字段: title / origin / destination / startDate' });
    }
    return importTrip({
      title: body.title,
      origin: body.origin,
      destination: body.destination,
      startDate: body.startDate,
      endDate: body.endDate,
      days: body.days,
    });
  });

  // 行程详情
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const trip = await getTrip(id);
    if (!trip) return reply.code(404).send({ error: '行程不存在' });
    return trip;
  });

  // 更新行程
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      title?: string;
      origin?: string;
      destination?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
    };
    const allowed = ['title', 'origin', 'destination', 'startDate', 'endDate', 'status'] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: '没有可更新的字段' });
    }
    const trip = await updateTrip(id, patch);
    if (!trip) return reply.code(404).send({ error: '行程不存在' });
    return trip;
  });

  // 删除行程
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteTrip(id);
    return { ok: true };
  });
}
