import type { FastifyInstance } from 'fastify';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import { mcpTokens } from '../db/schema.js';

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * MCP API Token 管理
 * - GET  /api/mcp/token     查询当前 token 配置状态（不返回明文）
 * - POST /api/mcp/token     生成新 Token（存哈希，明文仅返回一次）
 */
export async function mcpTokenRoutes(app: FastifyInstance) {
  // 状态查询
  app.get('/mcp/token', async () => {
    const rows = db.select().from(mcpTokens).all();
    return {
      envTokenConfigured: !!process.env.MINITREK_MCP_TOKEN,
      dbTokens: rows.length,
      createdAt: rows[0]?.createdAt ?? null,
      label: rows[0]?.label ?? null,
    };
  });

  // 生成新 Token
  app.post('/mcp/token', async (_req, reply) => {
    const raw = `mtk_${randomBytes(24).toString('hex')}`;
    db.insert(mcpTokens)
      .values({
        id: randomUUID(),
        tokenHash: sha256(raw),
        label: '网页生成',
        createdAt: new Date().toISOString(),
      })
      .run();
    return {
      ok: true,
      token: raw,
      note: '请立即复制保存，明文只显示这一次；旧 Token 仍然有效（可继续用）。',
    };
  });
}
