import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import { db } from '../db/index.js';
import { mcpTokens } from '../db/schema.js';

interface McpSession {
  transport: StreamableHTTPServerTransport;
  server: ReturnType<typeof createMcpServer>;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * MCP Server HTTP 路由（Streamable HTTP transport）
 * - 端点：/mcp（GET 协议发现 / POST JSON-RPC / DELETE 结束会话）
 * - 认证：Authorization: Bearer <token>，token 可来自环境变量 MINITREK_MCP_TOKEN
 *   或「设置页生成的 Token」（存 mcp_tokens 表哈希）
 * - 有状态模式：每个会话独立的 server + transport，sessionId 管理
 */
export async function mcpRoutes(app: FastifyInstance) {
  const sessions = new Map<string, McpSession>();

  async function authorize(req: { headers: Record<string, unknown> }): Promise<boolean> {
    const auth = (req.headers.authorization as string) || '';
    if (!auth.startsWith('Bearer ')) return false;
    const raw = auth.slice(7).trim();
    if (!raw) return false;
    // 1) 环境变量 token（Docker/部署时注入）
    const envToken = process.env.MINITREK_MCP_TOKEN;
    if (envToken && raw === envToken) return true;
    // 2) 数据库内生成过的 token（设置页生成，存哈希）
    const hash = sha256(raw);
    const row = await db.select().from(mcpTokens).where(eq(mcpTokens.tokenHash, hash)).get();
    return !!row;
  }

  // GET /mcp —— 协议/健康发现
  app.get('/mcp', async (req, reply) => {
    reply.type('application/json');
    reply.send({ name: 'miniTrek', version: '0.1.0', transport: 'streamable-http' });
  });

  // POST /mcp —— JSON-RPC（initialize / tools/list / tools/call）
  app.post('/mcp', async (req, reply) => {
    if (!(await authorize(req))) {
      return reply.code(401).send({ error: 'Unauthorized: 需要有效的 Bearer Token' });
    }
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let session = sessionId ? sessions.get(sessionId) : undefined;

    if (!session) {
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, { transport, server });
        },
        onsessionclosed: (sid) => {
          sessions.delete(sid);
        },
        enableJsonResponse: true,
      });
      await server.connect(transport);
      session = { transport, server };
    }

    reply.hijack();
    await session.transport.handleRequest(req.raw, reply.raw, req.body);
  });

  // DELETE /mcp —— 结束会话
  app.delete('/mcp', async (req, reply) => {
    if (!(await authorize(req))) {
      return reply.code(401).send({ error: 'Unauthorized: 需要有效的 Bearer Token' });
    }
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (session) {
      reply.hijack();
      await session.transport.handleRequest(req.raw, reply.raw);
    } else {
      reply.code(404).send({ error: '会话不存在' });
    }
  });
}
