import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tripDays } from '../db/schema.js';
import {
  addActivity,
  deleteActivity,
  getActivities,
  moveActivity,
  updateActivity,
  updateDay,
} from '../db/queries.js';

export async function activitiesRoutes(app: FastifyInstance) {
  // 在指定天添加节点
  app.post('/days/:dayId/activities', async (req, reply) => {
    const { dayId } = req.params as { dayId: string };
    const body = req.body as { type?: string; name?: string; [k: string]: unknown };
    if (!body.name) {
      return reply.code(400).send({ error: '缺少必填字段: name' });
    }
    const [day] = await db.select().from(tripDays).where(eq(tripDays.id, dayId));
    if (!day) return reply.code(404).send({ error: '天数不存在' });
    return addActivity(dayId, body as { type?: string; name: string });
  });

  // 编辑节点
  app.patch('/activities/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const allowed = ['type', 'name', 'address', 'lat', 'lng', 'time', 'cost', 'bookStatus', 'note'];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: '没有可更新的字段' });
    }
    const acts = await updateActivity(id, patch);
    if (!acts) return reply.code(404).send({ error: '节点不存在' });
    return acts;
  });

  // 删除节点
  app.delete('/activities/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteActivity(id);
    return { ok: true };
  });

  // 移动/排序节点（支持同天和跨天）
  app.post('/activities/:id/move', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { dayId?: string; position?: number };
    if (!body.dayId) return reply.code(400).send({ error: '缺少 dayId' });
    const ok = moveActivity(id, body.dayId, body.position);
    if (!ok) return reply.code(404).send({ error: '节点或目标天不存在' });
    return { ok: true };
  });

  // 更新天数信息（天气/备注）
  app.patch('/days/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const allowed = ['weatherTemp', 'weatherDesc', 'note'];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: '没有可更新的字段' });
    }
    const day = await updateDay(id, patch);
    if (!day) return reply.code(404).send({ error: '天数不存在' });
    return day;
  });
}
