import type { FastifyInstance } from 'fastify';
import {
  verifyAdminPassword,
  createSession,
  deleteSession,
  verifySession,
  setAdminPassword,
  isDbPasswordSet,
  extractToken,
} from '../auth.js';

export async function authRoutes(app: FastifyInstance) {
  // 登录：校验密码并签发会话 token
  app.post('/auth/login', async (req, reply) => {
    const body = (req.body ?? {}) as { password?: string };
    const pw = body.password ?? '';
    if (!pw) return reply.code(400).send({ error: '请输入密码' });
    if (!(await verifyAdminPassword(pw))) {
      return reply.code(401).send({ error: '密码错误' });
    }
    const token = await createSession();
    return { ok: true, token };
  });

  // 登出：删除当前会话
  app.post('/auth/logout', async (req) => {
    await deleteSession(extractToken(req));
    return { ok: true };
  });

  // 当前登录态
  app.get('/auth/me', async (req) => {
    const token = extractToken(req);
    return {
      authed: await verifySession(token),
      passwordConfigured: await isDbPasswordSet(),
    };
  });

  // 修改密码（需已登录）
  app.post('/auth/change-password', async (req, reply) => {
    const token = extractToken(req);
    if (!(await verifySession(token))) {
      return reply.code(401).send({ error: '未登录或会话已过期' });
    }
    const body = (req.body ?? {}) as { oldPassword?: string; newPassword?: string };
    const oldPw = body.oldPassword ?? '';
    const newPw = body.newPassword ?? '';
    if (String(newPw).length < 6) {
      return reply.code(400).send({ error: '新密码至少 6 位' });
    }
    if (!(await verifyAdminPassword(String(oldPw)))) {
      return reply.code(403).send({ error: '原密码错误' });
    }
    await setAdminPassword(String(newPw));
    return { ok: true };
  });
}
