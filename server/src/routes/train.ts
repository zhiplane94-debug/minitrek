import type { FastifyInstance } from 'fastify';
import { trainClient } from '../train/client.js';

/**
 * 12306 车票查询 REST 代理（复用 MCP 代理客户端）
 * 前端交通标签页调用，结构化返回车次列表
 */
export async function trainRoutes(app: FastifyInstance) {
  // 查余票：GET /api/train/query?date=2026-09-26&from=郑州&to=扬州&type=G&limit=10
  app.get('/train/query', async (req, reply) => {
    const { date, from, to, type, earliest, latest, limit } = req.query as {
      date?: string;
      from?: string;
      to?: string;
      type?: string;
      earliest?: string;
      latest?: string;
      limit?: string;
    };
    if (!date || !from || !to) {
      return reply.code(400).send({ error: '缺少必填参数: date / from / to' });
    }
    try {
      const text = await trainClient.callTool('get-tickets', {
        date,
        fromStation: from,
        toStation: to,
        trainFilterFlags: type ?? '',
        earliestStartTime: Number(earliest) || 0,
        latestStartTime: Number(latest) || 24,
        limitedNum: Number(limit) || 0,
        format: 'json',
      });
      // json 格式返回的车次数组
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
  });

  // 查车站代码：GET /api/train/stations?city=上海 或 ?name=扬州东
  app.get('/train/stations', async (req, reply) => {
    const { city, name } = req.query as { city?: string; name?: string };
    if (!city && !name) {
      return reply.code(400).send({ error: '缺少参数: city 或 name' });
    }
    try {
      let text: string;
      if (name) {
        text = await trainClient.callTool('get-station-code-by-names', { stationNames: name });
      } else {
        text = await trainClient.callTool('get-stations-code-in-city', { city });
      }
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
  });
}
