import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { settings, sessions } from './db/schema.js';

const DEFAULT_PASSWORD = 'changeme';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** scrypt 加盐哈希，格式 salt:hash */
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(pw, salt, 32).toString('hex');
  return safeEqual(calc, hash);
}

async function getStoredHash(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, 'admin_password_hash'));
  return row?.value || null;
}

/**
 * 校验管理员密码：
 * 1) 若已在数据库中设置过（修改密码/重置密码），用 DB 哈希校验；
 * 2) 否则用环境变量 MINITREK_ADMIN_PASSWORD（Docker/.env 注入），默认 changeme。
 */
export async function verifyAdminPassword(pw: string): Promise<boolean> {
  const stored = await getStoredHash();
  if (stored) return verifyPassword(pw, stored);
  const envPw = process.env.MINITREK_ADMIN_PASSWORD || DEFAULT_PASSWORD;
  return safeEqual(pw, envPw);
}

/** 是否已通过修改/重置密码写入了数据库密码（否则为环境变量模式） */
export async function isDbPasswordSet(): Promise<boolean> {
  return (await getStoredHash()) !== null;
}

/** 写入新密码（scrypt 哈希存 settings 表） */
export async function setAdminPassword(pw: string) {
  const now = new Date().toISOString();
  const hash = hashPassword(pw);
  await db
    .insert(settings)
    .values({ key: 'admin_password_hash', value: hash, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: hash, updatedAt: now },
    });
}

/** 签发 Web 登录会话，返回明文 token（仅此一次） */
export async function createSession(): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  return token;
}

export async function verifySession(token: string): Promise<boolean> {
  if (!token) return false;
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, sha256(token)));
  if (!row) return false;
  return new Date(row.expiresAt).getTime() > Date.now();
}

export async function deleteSession(token: string) {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

/** 清空所有会话（重置密码后调用） */
export async function clearSessions() {
  await db.delete(sessions);
}

/** 从请求头提取 Bearer token */
export function extractToken(req: { headers: Record<string, unknown> }): string {
  const auth = (req.headers.authorization as string) || '';
  if (!auth.startsWith('Bearer ')) return '';
  return auth.slice(7).trim();
}
