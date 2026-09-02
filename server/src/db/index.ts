import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 数据目录：优先环境变量 DATA_DIR（Docker 挂载卷），本地开发默认 server 上级的 data/
const dataDir =
  process.env.DATA_DIR || path.resolve(__dirname, '../../data');
fs.mkdirSync(dataDir, { recursive: true });

export const sqlite = new Database(path.join(dataDir, 'minitrek.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// 幂等建表：Web 登录会话表（不依赖 drizzle 迁移，保持向后兼容）
sqlite.exec(`CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
)`);

export const db = drizzle(sqlite, { schema });
export { schema };
