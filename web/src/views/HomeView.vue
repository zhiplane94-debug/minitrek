<template>
  <div class="home">
    <header class="topbar">
      <div class="brand">miniTrek</div>
      <div class="actions">
        <button class="btn" @click="showAi = true">AI 规划</button>
        <button class="btn btn-primary" @click="openCreate">+ 新建行程</button>
        <button class="user-btn" @click="router.push('/settings')" title="设置">
          <span class="avatar">我</span>
          <span class="user-name">设置</span>
        </button>
      </div>
    </header>

    <main class="content">
      <div v-if="store.loading" class="hint">加载中…</div>
      <div v-else-if="store.error" class="hint error">{{ store.error }}</div>
      <div v-else-if="store.trips.length === 0" class="hint">
        还没有行程，点击右上角「新建行程」或「AI 规划」开始。
      </div>
      <div v-else class="trip-grid">
        <div
          v-for="t in store.trips"
          :key="t.id"
          class="trip-card"
          @click="router.push(`/trips/${t.id}`)"
        >
          <div class="card-title">{{ t.title }}</div>
          <div class="card-route">{{ t.origin }} → {{ t.destination }}</div>
          <div class="card-meta">
            <span>{{ t.startDate }} ~ {{ t.endDate }}</span>
            <span>{{ daysCount(t) }} 天</span>
          </div>
          <div class="card-footer">
            <span class="status">{{ t.status }}</span>
            <button class="btn btn-danger btn-sm" @click.stop="onDelete(t)">删除</button>
          </div>
        </div>
      </div>
    </main>

    <!-- 新建行程弹窗 -->
    <div v-if="showCreate" class="modal-mask" @click.self="showCreate = false">
      <div class="modal">
        <h3>新建行程</h3>
        <label>行程标题</label>
        <input v-model="form.title" placeholder="如：扬州中秋亲子游" />
        <div class="row">
          <div>
            <label>出发地</label>
            <input v-model="form.origin" placeholder="如：郑州" />
          </div>
          <div>
            <label>目的地</label>
            <input v-model="form.destination" placeholder="如：扬州" />
          </div>
        </div>
        <div class="row">
          <div>
            <label>开始日期</label>
            <input type="date" v-model="form.startDate" />
          </div>
          <div>
            <label>结束日期</label>
            <input type="date" v-model="form.endDate" />
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" @click="showCreate = false">取消</button>
          <button class="btn btn-primary" :disabled="!canCreate" @click="onCreate">
            创建
          </button>
        </div>
      </div>
    </div>

    <!-- AI 规划指引弹窗（MCP 配置生成器） -->
    <div v-if="showAi" class="modal-mask" @click.self="showAi = false">
      <div class="modal modal-wide">
        <h3>AI 规划 · MCP 接入配置</h3>
        <p class="muted">
          你的 AI 客户端通过 MCP 连接本平台后，AI 即可直接创建行程、增删节点、查询车次/天气/地点，网页端实时可见。完成下面 3 步即可。
        </p>

        <div class="step">
          <div class="step-no">1</div>
          <div class="step-body">
            <b>获取 API Token</b>
            <div class="token-status">
              <span class="badge" :class="tokenReady ? 'ok' : 'warn'">
                {{ tokenReady ? '已配置' : '未配置' }}
              </span>
              <button class="btn btn-sm" :disabled="generatingToken" @click="genToken">
                {{ generatingToken ? '生成中…' : '生成新 Token' }}
              </button>
            </div>
            <div v-if="newToken" class="new-token">
              <div class="token-box">{{ newToken }}</div>
              <button class="btn btn-sm" @click="copyText(newToken)">复制 Token</button>
              <p class="hint-text warn-text">请立即复制保存，仅显示这一次；也可以到「设置」页生成。</p>
            </div>
            <p class="hint-text">
              Token 由平台生成（仅存哈希）；也可用部署环境变量
              <code>MINITREK_MCP_TOKEN</code> 配置。
            </p>
          </div>
        </div>

        <div class="step">
          <div class="step-no">2</div>
          <div class="step-body">
            <b>填写本平台可访问地址</b>
            <input v-model="mcpHost" placeholder="如：nas.example.com 或 192.168.1.100" />
            <p class="hint-text">
              填你的 DDNS 域名、内网 IP 或 NAS 地址（无需填 /mcp）。平台默认端口
              <code>8288</code> 会自动补全，如填 192.168.1.100 将生成
              <code>http://192.168.1.100:8288/mcp</code>；若已用 HTTPS 反代（443）或自填了端口则按其保留。
            </p>
          </div>
        </div>

        <div class="step">
          <div class="step-no">3</div>
          <div class="step-body">
            <b>复制配置并导入 AI 客户端</b>
            <div class="client-tabs">
              <span
                v-for="c in clientTypes"
                :key="c"
                class="ctab"
                :class="{ active: clientType === c }"
                @click="clientType = c"
              >
                {{ c }}
              </span>
            </div>
            <textarea readonly class="cfg-box" :value="cfgText" rows="10"></textarea>
            <div class="cfg-actions">
              <button class="btn btn-sm" @click="copyText(cfgText)">复制配置</button>
              <button class="btn btn-sm" @click="downloadCfg">下载 .json</button>
            </div>
            <p class="hint-text">{{ clientGuide }}</p>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn" @click="showAi = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTripsStore } from '../stores/trips';
import { api } from '../api/client';
import type { Trip } from '../api/client';

const router = useRouter();
const store = useTripsStore();

const showCreate = ref(false);
const showAi = ref(false);
const form = reactive({
  title: '',
  origin: '',
  destination: '',
  startDate: '',
  endDate: '',
});

const canCreate = computed(
  () => form.title && form.origin && form.destination && form.startDate,
);

function daysCount(t: Trip): number {
  if (!t.days?.length) {
    const d =
      (new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / 86400000 + 1;
    return Math.max(1, Math.round(d));
  }
  return t.days.length;
}

function openCreate() {
  form.title = '';
  form.origin = '';
  form.destination = '';
  form.startDate = '';
  form.endDate = '';
  showCreate.value = true;
}

async function onCreate() {
  const t = await store.createTrip({
    title: form.title,
    origin: form.origin,
    destination: form.destination,
    startDate: form.startDate,
    endDate: form.endDate || form.startDate,
  });
  showCreate.value = false;
  if (t?.id) router.push(`/trips/${t.id}`);
}

async function onDelete(t: Trip) {
  if (confirm(`确认删除行程「${t.title}」？`)) {
    await store.deleteTrip(t.id);
  }
}

// ---------- AI 规划 / MCP 配置生成 ----------
const clientTypes = ['通用 / Claude', 'Cursor', '豆包'];
const clientType = ref('通用 / Claude');
const mcpHost = ref('');
const tokenReady = ref(false);
const newToken = ref('');
const generatingToken = ref(false);

function normalizeHost(): string {
  let raw = mcpHost.value.trim();
  if (!raw) return '';
  // 提取协议（默认 http），去掉路径（防止误粘 /mcp）
  let scheme = 'http';
  const m = raw.match(/^(https?):\/\//i);
  if (m) {
    scheme = m[1].toLowerCase();
    raw = raw.slice(m[0].length);
  }
  raw = raw.replace(/\/+$/, '').split('/')[0];
  // 平台默认端口 8288：http 未带端口时自动补；https 默认 443 不补；用户自填端口则保留
  if (scheme === 'http' && !/:\d+$/.test(raw)) {
    raw = `${raw}:8288`;
  }
  return `${scheme}://${raw}`;
}

function mcpTokenValue(): string {
  return newToken.value || '<你的TOKEN>';
}

const cfgText = computed(() => {
  const base = normalizeHost();
  const token = mcpTokenValue();
  const cfg: Record<string, unknown> = {
    mcpServers: {
      minitrek: {
        type: 'http',
        url: base ? `${base}/mcp` : 'http://<你的地址>:8288/mcp',
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  };
  if (clientType.value === '豆包') {
    return JSON.stringify(
      {
        说明: '在豆包中新增「MCP 服务器」时，填写以下信息：',
        服务器名称: 'minitrek',
        服务器地址: base ? `${base}/mcp` : 'http://<你的地址>:8288/mcp',
        认证头: { Authorization: `Bearer ${token}` },
        工具列表: '创建/查询行程、添加天数与节点、移动排序、出行清单、行程汇总、12306 车次查询、车站代码查询',
      },
      null,
      2,
    );
  }
  return JSON.stringify(cfg, null, 2);
});

const clientGuide = computed(() => {
  if (clientType.value === '通用 / Claude') {
    return 'Claude Desktop：打开 Settings → Developer → Edit Config → 把上方 JSON 写入 claude_desktop_config.json；Cursor：把 JSON 写入项目根 .mcp.json 或 User 级 mcp.json 后重载。';
  }
  if (clientType.value === 'Cursor') {
    return 'Cursor：Command+Shift+P → "MCP: Add Server"（或编辑 ~/.cursor/mcp.json），把上方 mcpServers 内容粘入后重载窗口，即可在 Agent 里调用工具。';
  }
  return '豆包：在支持的客户端/工具中新增 MCP 服务器，名称填 minitrek，地址填上方服务器地址，认证头填 Authorization: Bearer <Token>，保存后即可用自然语言让它规划行程。';
});

async function genToken() {
  generatingToken.value = true;
  try {
    const r = await api.createMcpToken();
    newToken.value = r.token;
    tokenReady.value = true;
    await refreshTokenStatus();
  } catch (e) {
    alert('生成 Token 失败：' + (e as Error).message);
  } finally {
    generatingToken.value = false;
  }
}

async function refreshTokenStatus() {
  try {
    const s = await api.getMcpTokenStatus();
    tokenReady.value = s.envTokenConfigured || s.dbTokens > 0;
  } catch {
    /* ignore */
  }
}

async function copyText(t: string) {
  await navigator.clipboard.writeText(t).catch(() => undefined);
  alert('已复制到剪贴板');
}

function downloadCfg() {
  const blob = new Blob([cfgText.value], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'minitrek-mcp.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

onMounted(() => {
  store.fetchTrips();
  mcpHost.value = location.hostname && location.hostname !== 'localhost' ? location.hostname : '';
  refreshTokenStatus();
});
</script>

<style scoped>
.home {
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
.actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.user-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 5px 12px 5px 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text);
}
.user-btn:hover {
  border-color: var(--color-primary);
}
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}
.content {
  max-width: 1080px;
  margin: 0 auto;
  padding: 28px;
}
.hint {
  text-align: center;
  color: var(--color-text-secondary);
  padding: 80px 0;
}
.hint.error {
  color: var(--color-danger);
}
.trip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
}
.trip-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 18px;
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s;
}
.trip-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
}
.card-route {
  color: var(--color-primary);
  font-weight: 500;
  margin-bottom: 10px;
}
.card-meta {
  color: var(--color-text-secondary);
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 14px;
}
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.status {
  font-size: 12px;
  color: var(--color-primary);
  background: #eef4ff;
  padding: 2px 8px;
  border-radius: 10px;
}
.btn-sm {
  padding: 3px 10px;
  font-size: 12px;
}
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: #fff;
  border-radius: 10px;
  padding: 22px 26px;
  width: 460px;
  max-width: 92vw;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}
.modal h3 {
  margin: 0 0 14px;
}
.modal label {
  display: block;
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 10px 0 4px;
}
.modal input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  outline: none;
}
.modal input:focus {
  border-color: var(--color-primary);
}
.modal .row {
  display: flex;
  gap: 12px;
}
.modal .row > div {
  flex: 1;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
.code-block {
  background: #f6f8fa;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.9;
  margin: 12px 0;
}
.muted {
  color: var(--color-text-secondary);
}
.modal-wide {
  width: 620px;
}
.step {
  display: flex;
  gap: 12px;
  margin: 16px 0;
}
.step-no {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
}
.step-body {
  flex: 1;
}
.step-body > b {
  display: block;
  margin-bottom: 8px;
}
.step input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  outline: none;
}
.step input:focus {
  border-color: var(--color-primary);
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
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}
.new-token {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
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
.client-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.ctab {
  font-size: 12px;
  padding: 5px 12px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  cursor: pointer;
  color: var(--color-text-secondary);
}
.ctab.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: #eef4ff;
  font-weight: 600;
}
.cfg-box {
  width: 100%;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.6;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 10px;
  background: #f8fafc;
  resize: vertical;
  outline: none;
}
.cfg-actions {
  display: flex;
  gap: 8px;
  margin: 8px 0;
}
.hint-text {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.7;
  margin: 8px 0 0;
}
code {
  background: #eef1f5;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
}
</style>
