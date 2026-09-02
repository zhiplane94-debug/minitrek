<template>
  <div v-if="trip" class="detail">
    <header class="topbar">
      <div class="left">
        <button class="btn btn-back" @click="router.push('/')">← 返回</button>
        <span class="brand">miniTrek</span>
        <span class="title">{{ trip.title }}（{{ trip.origin }}出发）</span>
      </div>
      <div class="right">
        <button class="btn" @click="openTripEdit">编辑</button>
        <button class="btn" @click="onShare">分享</button>
        <button class="btn" @click="exportMd">导出</button>
        <button class="btn" @click="showImport = true">导入</button>
        <button class="btn user-btn" @click="router.push('/settings')">⚙ admin · 设置</button>
      </div>
    </header>

    <nav class="tabs">
      <span
        v-for="tab in tabs"
        :key="tab"
        class="tab"
        :class="{ active: currentTab === tab }"
        @click="currentTab = tab"
      >
        {{ tab }}
      </span>
    </nav>

    <!-- 计划：三栏布局 -->
    <div v-if="currentTab === '计划'" class="plan">
      <!-- 左栏 · 每日卡片时间线 -->
      <aside class="timeline">
        <div
          v-for="day in trip.days"
          :key="day.id"
          class="day-card"
          :class="{ 'drop-target': isDropTarget(day), active: activeDayId === day.id }"
          @dragover.prevent
          @drop="onDrop(day)"
        >
          <div class="day-head" @click="setActiveDay(day.id)">
            <span class="day-no">第{{ day.dayNo }}天</span>
            <span class="day-date">{{ fmtDate(day.date) }}</span>
            <span
              class="day-weather"
              :class="{ empty: day.weatherTemp == null && !day.weatherDesc }"
              @click.stop="openWeather(day)"
              :title="day.weatherTemp == null && !day.weatherDesc ? '点击查询或编辑天气' : '点击编辑天气'"
            >
              <template v-if="day.weatherTemp != null || day.weatherDesc">
                {{ day.weatherTemp != null ? day.weatherTemp + '°' : '' }}{{ day.weatherDesc || '' }}
              </template>
              <template v-else>+ 天气</template>
              <span class="edit-hint">✎</span>
            </span>
          </div>

          <div
            v-for="act in sorted(day)"
            :key="act.id"
            class="node"
            :class="{
              dragging: dragAct?.id === act.id,
              'drop-over': dropHoverId === act.id,
            }"
            draggable="true"
            @click="openEdit(act)"
            @dragstart="onDragStart(act, $event)"
            @dragend="onDragEnd"
            @dragover.prevent="onDragOver(act)"
            @dragleave="dropHoverId = null"
            @drop.stop="onDrop(day, act)"
          >
            <div class="node-main">
              <span class="node-type">{{ typeLabel(act.type) }}</span>
              <span class="node-name">{{ act.name }}</span>
              <span
                v-if="act.bookStatus && act.bookStatus !== '无需预订'"
                class="node-status"
              >
                {{ act.bookStatus }}
              </span>
              <span v-if="act.cost" class="node-cost">¥{{ act.cost }}</span>
              <span class="node-ops">
                <button class="icon-btn" title="编辑" @click.stop="openEdit(act)">✎</button>
                <button class="icon-btn danger" title="删除" @click.stop="onDelete(act)">✕</button>
              </span>
            </div>
            <div v-if="act.address" class="node-addr">{{ act.address }}</div>
            <div v-if="act.note" class="node-note">{{ act.note }}</div>
          </div>

          <div class="day-foot">
            <span v-if="dayCost(day) > 0" class="day-cost">费用 ¥{{ dayCost(day) }}</span>
            <button class="btn btn-add-node" @click="openAdd(day)">+ 添加节点</button>
          </div>
        </div>
        <div class="total">
          总费用 <span>¥{{ totalCost.toFixed(2) }}</span>
        </div>
      </aside>

      <!-- 中栏 · 地图 -->
      <section class="map">
        <AmapPanel :points="mapPoints" />
      </section>

      <!-- 右栏 · 地点搜索面板 -->
      <aside class="panel">
        <div class="panel-count">
          <span>全部 {{ totalActs }}</span><span>未规划 {{ unplannedActs }}</span
          ><span>已规划 {{ plannedActs }}</span>
        </div>
        <PlaceSearchPanel
          :trip="trip"
          :active-day-id="activeDayId"
          :destination="trip.destination"
          @added="load"
        />
      </aside>
    </div>

    <!-- 交通 -->
    <div v-else-if="currentTab === '交通'" class="tab-page">
      <TrainPanel :trip="trip" @changed="load" />
    </div>

    <!-- 费用 -->
    <div v-else-if="currentTab === '费用'" class="tab-page">
      <CostPanel :trip="trip" />
    </div>

    <!-- 节点编辑弹窗（添加/编辑共用） -->
    <div v-if="showNodeModal" class="modal-mask" @click.self="closeNodeModal">
      <div class="modal">
        <h3>{{ editingActivity ? '编辑节点' : '添加节点' }}</h3>
        <label>类型</label>
        <select v-model="nodeForm.type">
          <option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</option>
        </select>
        <label>名称 *</label>
        <input v-model="nodeForm.name" placeholder="如：瘦西湖风景区" />
        <label>地址</label>
        <div class="addr-row">
          <input v-model="nodeForm.address" placeholder="如：江苏省扬州市…" />
          <button
            class="btn btn-geo"
            :disabled="!nodeForm.address || geocoding"
            @click="doGeocode"
          >
            {{ geocoding ? '…' : '定位' }}
          </button>
        </div>
        <div v-if="nodeForm.lat != null && nodeForm.lng != null" class="coord">
          坐标：{{ nodeForm.lat.toFixed(5) }}, {{ nodeForm.lng.toFixed(5) }}
        </div>
        <div v-else-if="geoMsg" class="coord warn">{{ geoMsg }}</div>
        <div class="row">
          <div>
            <label>时间</label>
            <input v-model="nodeForm.time" placeholder="如 08:00" />
          </div>
          <div>
            <label>费用（元）</label>
            <input v-model.number="nodeForm.cost" type="number" placeholder="0" />
          </div>
        </div>
        <label>预订状态</label>
        <select v-model="nodeForm.bookStatus">
          <option value="待预订">待预订</option>
          <option value="已预订">已预订</option>
          <option value="无需预订">无需预订</option>
        </select>
        <label>备注</label>
        <textarea v-model="nodeForm.note" rows="3" placeholder="补充说明…"></textarea>
        <div class="modal-actions">
          <button class="btn" @click="closeNodeModal">取消</button>
          <button class="btn btn-primary" :disabled="!nodeForm.name" @click="saveNode">
            保存
          </button>
        </div>
      </div>
    </div>

    <!-- 天气编辑弹窗 -->
    <div v-if="showWeatherModal" class="modal-mask" @click.self="showWeatherModal = false">
      <div class="modal">
        <h3>编辑当天天气</h3>
        <div class="weather-row">
          <span class="weather-city" v-if="trip.destination">
            城市：{{ trip.destination }} · {{ weatherDay?.date }}
          </span>
          <button class="btn btn-geo" :disabled="weatherQuerying" @click="queryWeatherAuto">
            {{ weatherQuerying ? '查询中…' : '自动查询' }}
          </button>
        </div>
        <div v-if="weatherMsg" class="coord" :class="{ warn: weatherMsgErr }">{{ weatherMsg }}</div>
        <label>温度（℃）</label>
        <input v-model.number="weatherForm.temp" type="number" placeholder="如 24" />
        <label>天气描述</label>
        <input v-model="weatherForm.desc" placeholder="如：晴 / 多云 / 小雨" />
        <div class="modal-actions">
          <button class="btn" @click="showWeatherModal = false">取消</button>
          <button class="btn btn-primary" @click="saveWeather">保存</button>
        </div>
      </div>
    </div>

    <!-- 行程信息编辑弹窗 -->
    <div v-if="showTripEdit" class="modal-mask" @click.self="showTripEdit = false">
      <div class="modal">
        <h3>编辑行程</h3>
        <label>行程标题</label>
        <input v-model="tripForm.title" placeholder="如：扬州中秋亲子游" />
        <div class="row">
          <div>
            <label>出发地</label>
            <input v-model="tripForm.origin" placeholder="如：郑州" />
          </div>
          <div>
            <label>目的地</label>
            <input v-model="tripForm.destination" placeholder="如：扬州" />
          </div>
        </div>
        <div class="row">
          <div>
            <label>开始日期</label>
            <input type="date" v-model="tripForm.startDate" />
          </div>
          <div>
            <label>结束日期</label>
            <input type="date" v-model="tripForm.endDate" />
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" @click="showTripEdit = false">取消</button>
          <button class="btn btn-primary" :disabled="!tripForm.title" @click="saveTripEdit">
            保存
          </button>
        </div>
      </div>
    </div>

    <!-- 行程导入弹窗 -->
    <div v-if="showImport" class="modal-mask" @click.self="showImport = false">
      <div class="modal modal-import">
        <h3>导入行程（Markdown）</h3>
        <p class="muted import-tip">
          粘贴或上传符合格式的 md 文本，将<strong>新建</strong>一个行程。格式可参考
          <a class="link" @click="fillTemplate">点此填入模板</a>。
        </p>
        <div class="import-row">
          <input type="file" accept=".md,.markdown,.txt" class="file-input" @change="onImportFile" />
          <button class="btn btn-sm" @click="fillTemplate">填入格式模板</button>
        </div>
        <textarea
          v-model="importText"
          class="import-box"
          rows="12"
          placeholder="# 行程标题&#10;&#10;- 出发地：郑州&#10;- 目的地：扬州&#10;- 开始日期：2026-09-25&#10;- 结束日期：2026-09-27&#10;&#10;## 第1天 · 2026-09-25&#10;&#10;### 住宿&#10;- [待预订] 酒店名（¥350）&#10;  - 地址：…"
        ></textarea>
        <div v-if="parseResult" class="import-preview">
          <span class="badge ok">可导入</span>
          <span>{{ parseResult.title }}</span> ·
          <span>{{ parseResult.origin }} → {{ parseResult.destination }}</span> ·
          <span>{{ parseResult.startDate }} ~ {{ parseResult.endDate }}</span> ·
          <span>{{ parseResult.dayCount }} 天 / {{ parseResult.nodeCount }} 个节点</span>
        </div>
        <div v-if="importError" class="import-error">{{ importError }}</div>
        <div class="modal-actions">
          <button class="btn" @click="showImport = false">取消</button>
          <button
            class="btn btn-primary"
            :disabled="!parseResult || importing"
            @click="doImport"
          >
            {{ importing ? '导入中…' : '导入为新行程' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="loading">加载中…</div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api, type Trip, type TripDay, type Activity } from '../api/client';
import AmapPanel from '../components/AmapPanel.vue';
import PlaceSearchPanel from '../components/PlaceSearchPanel.vue';
import TrainPanel from '../components/TrainPanel.vue';
import CostPanel from '../components/CostPanel.vue';

interface MapPoint {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
}

const router = useRouter();
const route = useRoute();
const trip = ref<Trip | null>(null);

const tabs = ['计划', '交通', '费用'];
const currentTab = ref('计划');

// ---------- 分区与日期 ----------
function typeLabel(type: string): string {
  const map: Record<string, string> = {
    住宿: '住宿', 交通: '交通', 餐饮: '餐饮', 美食: '餐饮',
    备注: '计划', 计划: '计划', 旅行计划: '计划',
  };
  return map[type] ?? '地点';
}

function sorted(day: TripDay): Activity[] {
  return [...day.activities].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
}

const dayCost = (day: TripDay) =>
  day.activities.reduce((s, a) => s + (a.cost ?? 0), 0);

const totalActs = computed(
  () => trip.value?.days?.reduce((s, d) => s + d.activities.length, 0) ?? 0,
);
const plannedActs = computed(
  () =>
    (trip.value?.days ?? []).reduce(
      (s, d) => s + d.activities.filter((a) => a.lat != null && a.lng != null).length,
      0,
    ),
);
const unplannedActs = computed(() => totalActs.value - plannedActs.value);
const totalCost = computed(() =>
  (trip.value?.days ?? []).reduce((s, d) => s + dayCost(d), 0),
);

// ---------- 选中天（地图联动） ----------
const activeDayId = ref<string | null>(null);
function setActiveDay(id: string) {
  activeDayId.value = id;
}
const mapPoints = computed<MapPoint[]>(() => {
  const t = trip.value;
  if (!t || !activeDayId.value) return [];
  const day = t.days?.find((d) => d.id === activeDayId.value);
  if (!day) return [];
  return day.activities
    .filter((a) => a.lat != null && a.lng != null)
    .map((a) => ({ name: a.name, address: a.address, lat: a.lat as number, lng: a.lng as number }));
});

// ---------- 数据加载 ----------
let weatherAutoRan = false;
async function load() {
  const id = route.params.id as string;
  if (!id) return;
  trip.value = await api.getTrip(id);
  if (!activeDayId.value && trip.value?.days?.length) {
    activeDayId.value = trip.value.days[0].id;
  }
  if (!weatherAutoRan && trip.value?.destination) {
    weatherAutoRan = true;
    void autoFetchWeather();
  }
}

// ---------- 天气自动查询（open-meteo） ----------
async function autoFetchWeather() {
  const t = trip.value;
  if (!t?.destination) return;
  for (const day of t.days ?? []) {
    if (day.weatherTemp != null || day.weatherDesc) continue;
    try {
      const w = await api.getWeather(t.destination, day.date);
      if (w.available === false) continue;
      await api.updateDay(day.id, { weatherTemp: w.temp, weatherDesc: w.desc });
    } catch {
      /* 天气服务暂不可用，跳过 */
    }
  }
  await load();
}

const showWeatherModal = ref(false);
const weatherDay = ref<TripDay | null>(null);
const weatherForm = reactive({ temp: null as number | null, desc: '' });
const weatherQuerying = ref(false);
const weatherMsg = ref('');
const weatherMsgErr = ref(false);

function openWeather(day: TripDay) {
  weatherDay.value = day;
  weatherForm.temp = day.weatherTemp;
  weatherForm.desc = day.weatherDesc ?? '';
  weatherMsg.value = '';
  weatherMsgErr.value = false;
  showWeatherModal.value = true;
}

async function queryWeatherAuto() {
  const day = weatherDay.value;
  const t = trip.value;
  if (!day || !t?.destination) {
    weatherMsg.value = '请先在行程中填写目的地城市';
    weatherMsgErr.value = true;
    return;
  }
  weatherQuerying.value = true;
  weatherMsg.value = '';
  try {
    const w = await api.getWeather(t.destination, day.date);
    if (w.available === false) {
      weatherMsg.value = w.message || '该日期天气预报尚未发布';
      weatherMsgErr.value = true;
      return;
    }
    weatherForm.temp = w.temp;
    weatherForm.desc = w.desc;
    weatherMsg.value = `已获取 ${t.destination} ${day.date} 预报`;
    weatherMsgErr.value = false;
  } catch (e) {
    weatherMsg.value = (e as Error).message;
    weatherMsgErr.value = true;
  } finally {
    weatherQuerying.value = false;
  }
}

async function saveWeather() {
  if (!weatherDay.value) return;
  await api.updateDay(weatherDay.value.id, {
    weatherTemp: weatherForm.temp,
    weatherDesc: weatherForm.desc || null,
  });
  showWeatherModal.value = false;
  await load();
}

// ---------- 节点增删改 ----------
const typeOptions = ['景点', '住宿', '交通', '餐饮', '备注'];
const showNodeModal = ref(false);
const editingActivity = ref<Activity | null>(null);
const targetDay = ref<TripDay | null>(null);
const nodeForm = reactive({
  type: '景点',
  name: '',
  address: '',
  lat: null as number | null,
  lng: null as number | null,
  time: '',
  cost: null as number | null,
  bookStatus: '待预订',
  note: '',
});
const geocoding = ref(false);
const geoMsg = ref('');

function resetNodeForm() {
  nodeForm.type = '景点';
  nodeForm.name = '';
  nodeForm.address = '';
  nodeForm.lat = null;
  nodeForm.lng = null;
  nodeForm.time = '';
  nodeForm.cost = null;
  nodeForm.bookStatus = '待预订';
  nodeForm.note = '';
  geoMsg.value = '';
}

function openAdd(day: TripDay) {
  editingActivity.value = null;
  targetDay.value = day;
  resetNodeForm();
  showNodeModal.value = true;
}

function openEdit(act: Activity) {
  editingActivity.value = act;
  targetDay.value = null;
  nodeForm.type = act.type;
  nodeForm.name = act.name;
  nodeForm.address = act.address ?? '';
  nodeForm.lat = act.lat;
  nodeForm.lng = act.lng;
  nodeForm.time = act.time ?? '';
  nodeForm.cost = act.cost;
  nodeForm.bookStatus = act.bookStatus;
  nodeForm.note = act.note ?? '';
  geoMsg.value = '';
  showNodeModal.value = true;
}

function closeNodeModal() {
  showNodeModal.value = false;
}

async function doGeocode() {
  if (!nodeForm.address) return;
  geocoding.value = true;
  geoMsg.value = '';
  try {
    const { result } = await api.geocode(nodeForm.address, trip.value?.destination);
    if (result) {
      nodeForm.lat = result.lat;
      nodeForm.lng = result.lng;
    } else {
      geoMsg.value = '未能解析该地址，请手动确认';
    }
  } catch (e) {
    geoMsg.value = (e as Error).message;
  } finally {
    geocoding.value = false;
  }
}

async function saveNode() {
  if (!nodeForm.name) return;
  const data = {
    type: nodeForm.type,
    name: nodeForm.name,
    address: nodeForm.address || null,
    lat: nodeForm.lat,
    lng: nodeForm.lng,
    time: nodeForm.time || null,
    cost: nodeForm.cost,
    bookStatus: nodeForm.bookStatus,
    note: nodeForm.note || null,
  };
  if (editingActivity.value) {
    await api.updateActivity(editingActivity.value.id, data);
  } else if (targetDay.value) {
    await api.addActivity(targetDay.value.id, data);
  }
  closeNodeModal();
  await load();
}

async function onDelete(act: Activity) {
  if (confirm(`确认删除「${act.name}」？`)) {
    await api.deleteActivity(act.id);
    await load();
  }
}

// ---------- 拖拽排序 ----------
const dragAct = ref<Activity | null>(null);
const dropHoverId = ref<string | null>(null);

function onDragStart(act: Activity, e: DragEvent) {
  dragAct.value = act;
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd() {
  dragAct.value = null;
  dropHoverId.value = null;
}

function onDragOver(act: Activity) {
  if (dragAct.value && dragAct.value.id !== act.id) {
    dropHoverId.value = act.id;
  }
}

function isDropTarget(day: TripDay) {
  return !!dragAct.value && dragAct.value.dayId !== day.id;
}

async function onDrop(day: TripDay, target?: Activity) {
  if (!dragAct.value) return;
  const src = dragAct.value;
  const nodes = [...day.activities].sort((a, b) => a.sortOrder - b.sortOrder);
  let pos = target ? nodes.indexOf(target) : nodes.length;
  // 同天拖动时，后端会先排除被拖节点自身，故目标 index 需相应前移
  if (src.dayId === day.id) {
    const srcIdx = nodes.findIndex((n) => n.id === src.id);
    if (target && srcIdx >= 0 && srcIdx < pos) pos -= 1;
  }
  await api.moveActivity(src.id, { dayId: day.id, position: pos });
  dragAct.value = null;
  dropHoverId.value = null;
  await load();
}

// ---------- 行程信息编辑 ----------
const showTripEdit = ref(false);
const tripForm = reactive({
  title: '',
  origin: '',
  destination: '',
  startDate: '',
  endDate: '',
});

function openTripEdit() {
  const t = trip.value;
  if (!t) return;
  tripForm.title = t.title;
  tripForm.origin = t.origin;
  tripForm.destination = t.destination;
  tripForm.startDate = t.startDate;
  tripForm.endDate = t.endDate;
  showTripEdit.value = true;
}

async function saveTripEdit() {
  if (!trip.value) return;
  await api.updateTrip(trip.value.id, {
    title: tripForm.title,
    origin: tripForm.origin,
    destination: tripForm.destination,
    startDate: tripForm.startDate,
    endDate: tripForm.endDate || tripForm.startDate,
  });
  showTripEdit.value = false;
  await load();
}

// ---------- 分享 ----------
async function onShare() {
  const id = route.params.id as string;
  try {
    const { shareUrl } = await api.createShare(id);
    const url = `${location.origin}${shareUrl}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    alert(`已生成只读分享链接（无需登录即可查看），已复制到剪贴板：\n\n${url}`);
  } catch (e) {
    alert('生成分享链接失败：' + (e as Error).message);
  }
}

// ---------- 导出 / 导入（Markdown） ----------
const EXPORT_SECTIONS = ['住宿', '交通', '地点', '餐饮', '计划'] as const;
function mdType(type: string): string {
  const m: Record<string, string> = {
    住宿: '住宿', 交通: '交通', 餐饮: '餐饮', 美食: '餐饮',
    备注: '计划', 计划: '计划', 旅行计划: '计划',
  };
  return m[type] ?? '地点';
}
const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function fmtCn(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK_CN[d.getDay()]}`;
}

function tripToMd(t: Trip): string {
  const lines: string[] = [];
  lines.push(`# ${t.title}`, '');
  lines.push(`- 出发地：${t.origin}`, `- 目的地：${t.destination}`);
  lines.push(`- 开始日期：${t.startDate}`, `- 结束日期：${t.endDate}`, '');
  for (const day of [...(t.days || [])].sort((a, b) => a.dayNo - b.dayNo)) {
    lines.push(`## 第${day.dayNo}天 · ${day.date}（${fmtCn(day.date)}）`, '');
    const w = day.weatherTemp != null || day.weatherDesc
      ? `天气：${day.weatherTemp != null ? day.weatherTemp + '°' : ''}${day.weatherDesc || ''}`
      : '天气：待查询';
    lines.push(w, '');
    for (const sec of EXPORT_SECTIONS) {
      const acts = (day.activities || [])
        .filter((a) => mdType(a.type) === sec)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      if (!acts.length) continue;
      lines.push(`### ${sec}`, '');
      for (const a of acts) {
        const status = a.bookStatus && a.bookStatus !== '无需预订' ? `[${a.bookStatus}] ` : '';
        const cost = a.cost ? `（¥${a.cost}）` : '';
        lines.push(`- ${status}${a.name}${cost}`);
        if (a.address) lines.push(`  - 地址：${a.address}`);
        if (a.time) lines.push(`  - 时间：${a.time}`);
        if (a.note) lines.push(`  - 备注：${a.note}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function exportMd() {
  const t = trip.value;
  if (!t) return;
  const text = tripToMd(t);
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${t.title}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const MDFORMAT = `# 行程标题

- 出发地：郑州
- 目的地：扬州
- 开始日期：2026-09-25
- 结束日期：2026-09-27

## 第1天 · 2026-09-25（周五）

天气：24° 晴

### 住宿
- [待预订] 东关街商圈酒店（¥350）
  - 地址：江苏省扬州市广陵区东关街

### 交通
- [待预订] 高铁 郑州东→扬州东（¥200）
  - 时间：08:00-12:30
  - 备注：到站后先入住休整

### 地点
- 瘦西湖风景区
  - 地址：江苏省扬州市邗江区大虹桥路28号

### 计划
- 第一天不安排景点，让宝宝适应节奏。

## 第2天 · 2026-09-26（周六）

天气：多云

### 景点
- 大明寺（平山堂）
  - 地址：江苏省扬州市邗江区平山堂东路8号
`;

const showImport = ref(false);
const importText = ref('');
const importing = ref(false);
const importError = ref('');

interface ImportPreview {
  title: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  nodeCount: number;
}

function parseMd(text: string): {
  title: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  days: { date: string; weatherTemp: number | null; weatherDesc: string | null; note: string | null; activities: { type: string; name: string; address: string | null; time: string | null; cost: number | null; bookStatus: string; note: string | null }[] }[];
} {
  const lines = text.split(/\r?\n/);
  const out = { title: '', origin: '', destination: '', startDate: '', endDate: '', days: [] as any[] };
  let curDay: any = null;
  let curSec = '';
  let curAct: any = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const mTitle = line.match(/^#\s+(.+)/);
    if (mTitle) {
      if (!out.title) out.title = mTitle[1].trim();
      continue;
    }
    const mMeta = line.match(/^-\s*(出发地|目的地|开始日期|结束日期)\s*[：:]\s*(.*)$/);
    if (mMeta) {
      const key = mMeta[1];
      const val = mMeta[2].trim();
      if (key === '出发地') out.origin = val;
      else if (key === '目的地') out.destination = val;
      else if (key === '开始日期') out.startDate = val;
      else if (key === '结束日期') out.endDate = val;
      continue;
    }
    const mDay = line.match(/^##\s+(.*)$/);
    if (mDay) {
      const dateM = mDay[1].match(/(\d{4}-\d{2}-\d{2})/);
      const date = dateM ? dateM[1] : '';
      curDay = { date, weatherTemp: null, weatherDesc: null, note: null, activities: [] };
      out.days.push(curDay);
      curSec = '';
      curAct = null;
      continue;
    }
    const mSec = line.match(/^###\s+(.+)$/);
    if (mSec) {
      curSec = mdType(mSec[1].trim());
      curAct = null;
      continue;
    }
    const mWeather = line.match(/^天气\s*[：:]\s*(.*)$/);
    if (mWeather && curDay) {
      const w = mWeather[1];
      const tM = w.match(/(-?\d+(?:\.\d+)?)/);
      if (tM) curDay.weatherTemp = parseFloat(tM[1]);
      curDay.weatherDesc = w.replace(tM ? tM[0] : '', '').replace(/[°\s]/g, '') || null;
      continue;
    }
    const mNote = line.match(/^(\s*)-?\s*(地址|时间|备注|说明|电话)\s*[：:]\s*(.*)$/);
    if (mNote && curAct) {
      const key = mNote[2];
      const val = mNote[3].trim();
      if (key === '地址') curAct.address = val;
      else if (key === '时间') curAct.time = val;
      else curAct.note = val;
      continue;
    }
    const mAct = line.match(/^(\s*)-?\s+(.*)$/);
    if (mAct && line.startsWith('-') && curDay) {
      const body = mAct[2].trim();
      const stM = body.match(/^\[([^\]]+)\]\s*/);
      const bookStatus = stM ? stM[1].trim() : '待预订';
      let name = stM ? body.slice(stM[0].length) : body;
      let cost: number | null = null;
      const cM = name.match(/[（(]¥\s*([\d.]+)[）)]|¥\s*([\d.]+)/);
      if (cM) {
        cost = parseFloat(cM[1] || cM[2]);
        name = name.replace(/[（(]¥\s*[\d.]+[）)]|¥\s*[\d.]+/, '').trim();
      }
      curAct = {
        type: curSec || '计划',
        name,
        address: null,
        time: null,
        cost,
        bookStatus,
        note: null,
      };
      curDay.activities.push(curAct);
      continue;
    }
  }
  // 结束日期缺省补开始日期；天缺日期则跳过
  if (!out.endDate) out.endDate = out.startDate;
  out.days = out.days.filter((d: any) => d.date);
  return out;
}

const parseResult = computed<ImportPreview | null>(() => {
  if (!importText.value.trim()) return null;
  try {
    const p = parseMd(importText.value);
    if (!p.title || !p.origin || !p.destination || !p.startDate || !p.days.length) return null;
    const nodeCount = p.days.reduce((s, d) => s + d.activities.length, 0);
    return {
      title: p.title, origin: p.origin, destination: p.destination,
      startDate: p.startDate, endDate: p.endDate,
      dayCount: p.days.length, nodeCount,
    };
  } catch {
    return null;
  }
});

function fillTemplate() {
  importText.value = MDFORMAT;
  importError.value = '';
}

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    importText.value = String(reader.result || '');
    importError.value = '';
  };
  reader.readAsText(file, 'utf-8');
  input.value = '';
}

async function doImport() {
  const p = parseResult.value;
  if (!p || importing.value) return;
  importing.value = true;
  importError.value = '';
  try {
    const parsed = parseMd(importText.value);
    const tripNew = await api.importTrip({
      title: parsed.title,
      origin: parsed.origin,
      destination: parsed.destination,
      startDate: parsed.startDate,
      endDate: parsed.endDate || parsed.startDate,
      days: parsed.days,
    });
    showImport.value = false;
    importText.value = '';
    await router.push(`/trips/${tripNew.id}`);
  } catch (e) {
    importError.value = '导入失败：' + (e as Error).message;
  } finally {
    importing.value = false;
  }
}

onMounted(load);
watch(() => route.params.id, load);
</script>

<style scoped>
.detail {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.btn-back {
  padding: 4px 10px;
}
.brand {
  font-weight: 700;
  color: var(--color-primary);
}
.title {
  font-weight: 600;
}
.right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.user-btn {
  padding: 4px 10px;
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 0 24px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.tab {
  padding: 10px 18px;
  cursor: pointer;
  color: var(--color-text-secondary);
  border-bottom: 2px solid transparent;
}
.tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 600;
}
.plan {
  flex: 1;
  display: grid;
  grid-template-columns: 380px 1fr 320px;
  height: calc(100vh - 110px);
}
.timeline {
  overflow-y: auto;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
  padding: 16px;
}
.day-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 12px;
  margin-bottom: 16px;
  background: #fff;
}
.day-card.active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.18);
}
.day-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  cursor: pointer;
  user-select: none;
}
.day-no {
  font-weight: 700;
  font-size: 15px;
}
.day-date {
  color: var(--color-text-secondary);
  font-size: 13px;
}
.day-weather {
  margin-left: auto;
  font-size: 13px;
  color: var(--color-primary);
  background: #eef4ff;
  border-radius: 12px;
  padding: 2px 10px;
  cursor: pointer;
}
.day-weather.empty {
  color: var(--color-text-secondary);
  background: #f3f4f6;
}
.edit-hint {
  font-size: 11px;
  margin-left: 2px;
  opacity: 0.7;
}
.section {
  margin-bottom: 10px;
}
.section-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
  padding-left: 2px;
}
.node {
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-primary);
  border-radius: 6px;
  padding: 7px 10px;
  margin-bottom: 6px;
  background: #fafbfc;
  font-size: 13px;
  line-height: 1.6;
  cursor: grab;
}
.node:active {
  cursor: grabbing;
}
.node.dragging {
  opacity: 0.4;
}
.node.drop-over {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.25);
}
.day-card.drop-target {
  outline: 2px dashed var(--color-primary);
  outline-offset: 2px;
}
.node:hover {
  border-color: var(--color-primary);
}
.node-main {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.node-name {
  font-weight: 500;
}
.node-type {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-primary);
  background: #eef4ff;
  border-radius: 4px;
  padding: 1px 6px;
}
.node-status {
  font-size: 11px;
  color: #b45309;
  background: #fef3c7;
  border-radius: 4px;
  padding: 1px 6px;
}
.node-cost {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.node-addr,
.node-note {
  color: var(--color-text-secondary);
  font-size: 12px;
}
.node-ops {
  margin-left: auto;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}
.node:hover .node-ops {
  opacity: 1;
}
.icon-btn {
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  padding: 2px 5px;
  border-radius: 4px;
  cursor: pointer;
}
.icon-btn:hover {
  background: #eef1f5;
}
.icon-btn.danger:hover {
  color: var(--color-danger);
  background: #fef2f2;
}
.day-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border);
}
.day-cost {
  font-weight: 600;
  color: var(--color-text);
}
.btn-add-node {
  font-size: 12px;
  padding: 4px 10px;
}
.total {
  margin-top: 8px;
  padding: 12px;
  border-top: 2px solid var(--color-border);
  font-weight: 700;
  font-size: 15px;
}
.total span {
  color: var(--color-primary);
}
.map {
  position: relative;
  background: #eef1f4;
}
.panel {
  border-left: 1px solid var(--color-border);
  background: var(--color-surface);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}
.panel-count {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.tab-page {
  flex: 1;
  display: flex;
  justify-content: center;
  background: #f7f8fa;
}
.loading {
  padding: 60px;
  text-align: center;
  color: var(--color-text-secondary);
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
  width: 480px;
  max-width: 92vw;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  max-height: 90vh;
  overflow-y: auto;
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
.modal input,
.modal select,
.modal textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  outline: none;
  background: #fff;
}
.modal input:focus,
.modal select:focus,
.modal textarea:focus {
  border-color: var(--color-primary);
}
.modal .row {
  display: flex;
  gap: 12px;
}
.modal .row > div {
  flex: 1;
}
.addr-row {
  display: flex;
  gap: 8px;
}
.addr-row input {
  flex: 1;
}
.btn-geo {
  padding: 8px 12px;
  font-size: 13px;
  flex-shrink: 0;
}
.coord {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-primary);
}
.coord.warn {
  color: var(--color-danger);
}
.weather-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.weather-city {
  font-size: 13px;
  color: var(--color-text-secondary);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
.modal-import {
  width: 560px;
}
.import-tip {
  font-size: 13px;
  line-height: 1.7;
  margin: 0 0 10px;
}
.link {
  color: var(--color-primary);
  cursor: pointer;
  text-decoration: underline;
}
.import-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.file-input {
  font-size: 12px;
}
.import-box {
  width: 100%;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.6;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 10px;
  resize: vertical;
  outline: none;
}
.import-box:focus {
  border-color: var(--color-primary);
}
.import-preview {
  margin-top: 10px;
  font-size: 13px;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.import-preview .badge {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
  color: #15803d;
  background: #dcfce7;
}
.import-error {
  margin-top: 10px;
  font-size: 13px;
  color: var(--color-danger);
}
</style>
