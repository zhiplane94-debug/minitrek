import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, sqlite } from './index.js';

migrate(db, { migrationsFolder: './drizzle' });
sqlite.close();
console.log('[minitrek] 数据库迁移完成');
