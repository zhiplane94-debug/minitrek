/**
 * 管理员密码重置脚本（忘记密码时使用）
 *
 * 用法（容器内 / NAS 上）：
 *   docker exec -it minitrek node --import tsx src/scripts/reset-password.ts
 *     → 自动生成随机新密码并打印
 *   docker exec -it minitrek node --import tsx src/scripts/reset-password.ts 我的新密码
 *     → 重置为指定密码（至少 6 位）
 *
 * 重置后写入数据库，所有旧登录会话立即失效，需用新密码重新登录。
 */
import { setAdminPassword, clearSessions } from '../auth.js';
import { sqlite } from '../db/index.js';
import crypto from 'node:crypto';

const arg = process.argv[2]?.trim();
const newPw = arg && arg.length >= 6 ? arg : crypto.randomBytes(6).toString('hex');

await setAdminPassword(newPw);
await clearSessions();
console.log('[minitrek] 管理员密码已重置');
if (!arg) {
  console.log(`临时密码：${newPw}`);
  console.log('请登录后立即在「设置 → 修改密码」中改掉它。');
}
console.log('所有旧登录会话已失效，请用新密码重新登录。');
sqlite.close();
