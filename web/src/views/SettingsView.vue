<template>
  <div class="settings">
    <header class="topbar">
      <div class="brand">miniTrek</div>
      <button class="btn" @click="router.push('/')">返回首页</button>
    </header>

    <main class="content">
      <div class="card">
        <h2>设置</h2>

        <div class="field">
          <label>高德地图 API Key（Web 端 JS API）</label>
          <input
            type="password"
            v-model="amapKey"
            placeholder="输入你的高德 Web 端 Key"
          />
          <p class="hint-text">
            用于行程详情页的地图展示。前往
            <a href="https://console.amap.com" target="_blank" rel="noopener">高德开放平台</a>
            创建「Web端(JS API)」应用获取 Key。保存后为空表示清除配置。
          </p>
        </div>

        <div class="field">
          <label>高德 Web 服务 Key（可选）</label>
          <input
            type="password"
            v-model="amapWebKey"
            placeholder="输入你的高德 Web 服务 Key"
          />
          <p class="hint-text">
            用于右侧「地点搜索」和节点地址「定位」（POI 搜索与地理编码）。
            需在高德开放平台单独创建「Web服务」类型应用获取 Key，与上方 JS API Key 不同。
            未配置时地点搜索与定位不可用。
          </p>
        </div>

        <hr class="divider" />

        <div class="field">
          <label>MCP API Token（AI 规划接入）</label>
          <div class="token-status">
            <span class="badge" :class="tokenReady ? 'ok' : 'warn'">
              {{ tokenReady ? '已配置' : '未配置' }}
            </span>
            <span v-if="tokenInfo" class="hint-inline">
              {{ tokenInfo.label ? tokenInfo.label + ' · ' : '' }}生成于
              {{ fmtTime(tokenInfo.createdAt) }}
            </span>
          </div>
          <div v-if="newToken" class="new-token">
            <div class="token-box">{{ newToken }}</div>
            <button class="btn btn-sm" @click="copyToken">复制 Token</button>
            <p class="hint-text warn-text">
              {{ tokenNote }}<strong>请立即复制保存，关闭本页后不再显示。</strong>
            </p>
          </div>
          <p class="hint-text">
            Token 用于 AI 客户端（豆包 / Claude / Cursor 等）连接本平台的 MCP 接口。
            点击下方「生成新 Token」即可创建；也支持通过部署环境变量
            <code>MINITREK_MCP_TOKEN</code> 配置。Token 以哈希形式存储，页面仅显示一次。
          </p>
          <div class="actions-inline">
            <button class="btn btn-sm" :disabled="generating" @click="onGenerateToken">
              {{ generating ? '生成中…' : '生成新 Token' }}
            </button>
          </div>
        </div>

        <div class="status" v-if="saved">✓ 已保存</div>
        <div class="status error" v-else-if="error">{{ error }}</div>

        <div class="actions">
          <button class="btn" @click="router.push('/')">取消</button>
          <button class="btn btn-primary" :disabled="saving" @click="onSave">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>

      <div class="card">
        <h2>账号与安全</h2>

        <div class="field">
          <label>修改登录密码</label>
          <input type="password" v-model="pwOld" placeholder="原密码" autocomplete="current-password" />
          <input class="gap-top" type="password" v-model="pwNew" placeholder="新密码（至少 6 位）" autocomplete="new-password" />
          <input class="gap-top" type="password" v-model="pwConfirm" placeholder="确认新密码" autocomplete="new-password" />
          <p class="hint-text">
            初始密码为部署时设置的
            <code>MINITREK_ADMIN_PASSWORD</code>（Docker/.env）。
            修改后写入本地数据库，无需改动 .env。
          </p>
          <div class="status" v-if="pwSaved">✓ 密码已修改</div>
          <div class="status error" v-if="pwError">{{ pwError }}</div>
          <div class="actions-inline">
            <button class="btn btn-sm" :disabled="pwSaving" @click="onChangePassword">
              {{ pwSaving ? '修改中…' : '修改密码' }}
            </button>
          </div>
        </div>

        <hr class="divider" />

        <div class="field">
          <label>恢复密码（忘记密码时）</label>
          <p class="hint-text">
            在服务器 / NAS 上执行以下命令重置管理员密码：
          </p>
          <pre class="cmd-box">docker exec -it minitrek node --import tsx \
  src/scripts/reset-password.ts</pre>
          <p class="hint-text">
            不传参数会生成随机新密码并打印；也可在后面跟一个 6 位以上新密码。
            重置后写入数据库，所有旧登录会话立即失效，请用新密码重新登录。
          </p>
        </div>

        <hr class="divider" />

        <div class="field">
          <label>退出登录</label>
          <p class="hint-text">清除当前浏览器登录状态。</p>
          <div class="actions-inline">
            <button class="btn btn-sm btn-danger" @click="onLogout">退出登录</button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api, setSessionToken } from '../api/client';

const router = useRouter();
const amapKey = ref('');
const amapWebKey = ref('');
const saved = ref(false);
const saving = ref(false);
const error = ref('');
const tokenReady = ref(false);
const tokenInfo = ref<{ label: string | null; createdAt: string | null } | null>(null);
const newToken = ref('');
const tokenNote = ref('');
const generating = ref(false);
const pwOld = ref('');
const pwNew = ref('');
const pwConfirm = ref('');
const pwSaving = ref(false);
const pwSaved = ref(false);
const pwError = ref('');

function fmtTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function refreshTokenStatus() {
  try {
    const s = await api.getMcpTokenStatus();
    tokenReady.value = s.envTokenConfigured || s.dbTokens > 0;
    tokenInfo.value = s.createdAt ? { label: s.label, createdAt: s.createdAt } : null;
  } catch {
    tokenReady.value = false;
    tokenInfo.value = null;
  }
}

async function onGenerateToken() {
  generating.value = true;
  try {
    const r = await api.createMcpToken();
    newToken.value = r.token;
    tokenNote.value = r.note || '';
    await refreshTokenStatus();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    generating.value = false;
  }
}

async function copyToken() {
  await navigator.clipboard.writeText(newToken.value).catch(() => undefined);
  alert('Token 已复制到剪贴板');
}

onMounted(async () => {
  try {
    const s = await api.getSettings();
    amapKey.value = s.amapKey ?? '';
    amapWebKey.value = s.amapWebKey ?? '';
  } catch (e) {
    error.value = (e as Error).message;
  }
  await refreshTokenStatus();
});

async function onSave() {
  saving.value = true;
  error.value = '';
  try {
    const r = await api.saveSettings({
      amapKey: amapKey.value.trim(),
      amapWebKey: amapWebKey.value.trim(),
    });
    amapKey.value = r.amapKey ?? '';
    amapWebKey.value = r.amapWebKey ?? '';
    saved.value = true;
    setTimeout(() => (saved.value = false), 2000);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

async function onChangePassword() {
  pwError.value = '';
  pwSaved.value = false;
  if (pwNew.value.length < 6) {
    pwError.value = '新密码至少 6 位';
    return;
  }
  if (pwNew.value !== pwConfirm.value) {
    pwError.value = '两次输入的新密码不一致';
    return;
  }
  pwSaving.value = true;
  try {
    await api.changePassword(pwOld.value, pwNew.value);
    pwSaved.value = true;
    pwOld.value = '';
    pwNew.value = '';
    pwConfirm.value = '';
    setTimeout(() => (pwSaved.value = false), 2000);
  } catch (e) {
    pwError.value = (e as Error).message;
  } finally {
    pwSaving.value = false;
  }
}

async function onLogout() {
  try {
    await api.logout();
  } catch {
    /* 忽略登出接口错误 */
  }
  setSessionToken(null);
  router.push('/login');
}
</script>

<style scoped>
.settings {
  min-height: 100%;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.brand {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: 0.5px;
}
.content {
  max-width: 640px;
  margin: 0 auto;
  padding: 28px;
}
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 24px 28px;
  box-shadow: var(--shadow);
}
.card h2 {
  margin: 0 0 18px;
}
.field label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}
.field input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  outline: none;
  font-size: 14px;
}
.field input:focus {
  border-color: var(--color-primary);
}
.hint-text {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.7;
  margin: 8px 0 0;
}
.hint-text a {
  color: var(--color-primary);
}
.status {
  margin-top: 14px;
  color: var(--color-primary);
  font-size: 13px;
}
.status.error {
  color: var(--color-danger);
}
.divider {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 22px 0;
}
.token-status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.badge {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
}
.badge.ok {
  color: #15803d;
  background: #dcfce7;
}
.badge.warn {
  color: #b45309;
  background: #fef3c7;
}
.hint-inline {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.new-token {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 12px;
  margin: 8px 0;
}
.token-box {
  font-family: monospace;
  font-size: 13px;
  word-break: break-all;
  background: #fff;
  border: 1px dashed var(--color-border);
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 8px;
  user-select: all;
}
.warn-text {
  color: var(--color-danger);
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}
.actions-inline {
  margin-top: 10px;
}
.gap-top {
  margin-top: 8px;
}
.cmd-box {
  background: #f1f3f5;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
code {
  background: #eef1f5;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}
</style>
