<template>
  <div class="train-panel">
    <!-- 查询表单 -->
    <div class="query-form">
      <label>日期<input v-model="form.date" type="date" /></label>
      <label>出发<input v-model="form.from" placeholder="如：郑州" /></label>
      <label>到达<input v-model="form.to" placeholder="如：扬州" /></label>
      <label>
        车次
        <select v-model="form.type">
          <option value="">全部</option>
          <option value="G">高铁 G</option>
          <option value="D">动车 D</option>
          <option value="C">城际 C</option>
          <option value="Z">直达 Z</option>
          <option value="T">特快 T</option>
          <option value="K">快速 K</option>
        </select>
      </label>
      <button class="btn btn-primary" :disabled="querying" @click="onQuery">
        {{ querying ? '查询中…' : '查车次' }}
      </button>
      <span class="hint">实时余票/票价来自 12306</span>
    </div>

    <div v-if="errorMsg" class="error">{{ errorMsg }}</div>

    <!-- 查询结果 -->
    <div v-if="trains.length" class="result-head">
      共 {{ trains.length }} 趟车次
      <button class="btn btn-sm" @click="clear">清空</button>
    </div>
    <div v-if="trains.length" class="train-list">
      <div v-for="(t, i) in trains" :key="i" class="train-row">
        <div class="train-main">
          <span class="train-code">{{ t.start_train_code }}</span>
          <span class="train-time">{{ t.start_time }} → {{ t.arrive_time }}</span>
          <span class="train-dur">{{ t.lishi }}</span>
          <button class="btn btn-sm btn-add" @click="openAddDay(t)">＋ 加入行程</button>
        </div>
        <div class="train-stations">{{ t.from_station }} → {{ t.to_station }}</div>
        <div class="train-prices">
          <span v-for="(p, j) in t.prices || []" :key="j" class="price">
            {{ p.seat_name }} {{ p.price }}<i>{{ p.num === '有' ? '有票' : p.num }}</i>
          </span>
        </div>
      </div>
    </div>

    <div v-else-if="!querying && queried" class="muted">暂无符合条件的车次，试试放宽筛选</div>

    <!-- 行程内已有交通节点 -->
    <div v-if="existingTrains.length" class="existing">
      <h4>行程内交通节点</h4>
      <div v-for="act in existingTrains" :key="act.id" class="exist-row">
        <span>{{ act.name }}</span>
        <span v-if="act.time" class="muted">{{ act.time }}</span>
        <span v-if="act.cost" class="cost">¥{{ act.cost }}</span>
        <span v-if="act.bookStatus && act.bookStatus !== '无需预订'" class="status">{{ act.bookStatus }}</span>
        <button class="icon-btn danger" title="删除" @click="del(act)">✕</button>
      </div>
    </div>

    <!-- 选择加入哪天 -->
    <div v-if="addTarget" class="modal-mask" @click.self="addTarget = null">
      <div class="modal">
        <h3>加入车次 {{ addTarget.start_train_code }}</h3>
        <p class="desc">{{ addTarget.from_station }} → {{ addTarget.to_station }}，{{ addTarget.start_time }} 出发</p>
        <label>加入日期</label>
        <select v-model="addDayId">
          <option v-for="d in trip.days || []" :key="d.id" :value="d.id">
            第{{ d.dayNo }}天（{{ fmtDate(d.date) }}）
          </option>
        </select>
        <label>席别 / 价格</label>
        <select v-model="addSeat">
          <option v-for="p in addTarget.prices || []" :key="p.seat_type_code" :value="p">
            {{ p.seat_name }} ¥{{ p.price }}（{{ p.num === '有' ? '有票' : p.num }}）
          </option>
        </select>
        <label>预订状态</label>
        <select v-model="addBook">
          <option value="待预订">待预订</option>
          <option value="已预订">已预订</option>
          <option value="无需预订">无需预订</option>
        </select>
        <div class="modal-actions">
          <button class="btn" @click="addTarget = null">取消</button>
          <button class="btn btn-primary" :disabled="!addDayId" @click="confirmAdd">添加</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { api, type Trip, type Activity } from '../api/client';

const props = defineProps<{ trip: Trip }>();
const emit = defineEmits<{ (e: 'changed'): void }>();

const form = ref({
  date: props.trip.startDate || new Date().toISOString().slice(0, 10),
  from: props.trip.origin || '',
  to: props.trip.destination || '',
  type: 'G',
});
const trains = ref<any[]>([]);
const querying = ref(false);
const queried = ref(false);
const errorMsg = ref('');

const addTarget = ref<any>(null);
const addDayId = ref('');
const addSeat = ref<any>(null);
const addBook = ref('待预订');

const existingTrains = computed(() =>
  (props.trip.days ?? []).flatMap((d) =>
    d.activities.filter((a) => a.type === '交通'),
  ),
);

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function fmtDate(s: string) {
  const d = new Date(s + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
}

async function onQuery() {
  if (!form.value.date || !form.value.from || !form.value.to) {
    errorMsg.value = '请填写日期、出发和到达';
    return;
  }
  querying.value = true;
  queried.value = true;
  errorMsg.value = '';
  try {
    const list = await api.trainQuery({
      date: form.value.date,
      from: form.value.from,
      to: form.value.to,
      type: form.value.type,
    });
    if (Array.isArray(list)) {
      trains.value = list;
    } else {
      trains.value = [];
      errorMsg.value = '未获取到车次数据，请稍后再试';
    }
  } catch (e) {
    trains.value = [];
    errorMsg.value = (e as Error).message;
  } finally {
    querying.value = false;
  }
}

function clear() {
  trains.value = [];
  queried.value = false;
}

function openAddDay(t: any) {
  addTarget.value = t;
  addDayId.value = props.trip.days?.[0]?.id ?? '';
  addSeat.value = t.prices?.find((p: any) => p.seat_name === '二等座') || t.prices?.[0] || null;
  addBook.value = '待预订';
}

async function confirmAdd() {
  if (!addTarget.value || !addDayId.value) return;
  const t = addTarget.value;
  const seat = addSeat.value;
  try {
    await api.addActivity(addDayId.value, {
      type: '交通',
      name: `${t.from_station} → ${t.to_station} ${t.start_train_code}`,
      address: null,
      time: `${t.start_time}~${t.arrive_time}`,
      cost: seat?.price ?? null,
      bookStatus: addBook.value,
      note: `车次 ${t.start_train_code}，历时${t.lishi}，${t.start_time}出发 ${t.arrive_time}到达。查询日期 ${form.value.date}，价格与余票以 12306 实时为准。`,
      refType: 'train',
      refId: t.start_train_code,
    });
    addTarget.value = null;
    emit('changed');
  } catch (e) {
    errorMsg.value = (e as Error).message;
  }
}

async function del(act: Activity) {
  if (confirm(`删除「${act.name}」？`)) {
    await api.deleteActivity(act.id);
    emit('changed');
  }
}
</script>

<style scoped>
.train-panel {
  padding: 20px 28px;
  max-width: 1000px;
}
.query-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.query-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.query-form input,
.query-form select {
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  outline: none;
  font-size: 13px;
  min-width: 120px;
}
.hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  align-self: center;
  margin-left: auto;
}
.error {
  margin-top: 12px;
  color: var(--color-danger);
  font-size: 13px;
}
.result-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 16px 0 8px;
  font-weight: 600;
}
.btn-sm {
  font-size: 12px;
  padding: 3px 10px;
}
.train-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.train-row {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 14px;
  background: #fff;
  line-height: 1.7;
}
.train-main {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.train-code {
  font-weight: 700;
  color: var(--color-primary);
  font-size: 15px;
}
.train-time {
  font-weight: 600;
}
.train-dur {
  color: var(--color-text-secondary);
  font-size: 13px;
}
.btn-add {
  margin-left: auto;
}
.train-stations {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.train-prices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: 4px;
}
.price {
  font-size: 12px;
}
.price i {
  font-style: normal;
  color: #b45309;
  background: #fef3c7;
  border-radius: 4px;
  padding: 0 4px;
  margin-left: 4px;
}
.existing {
  margin-top: 22px;
  border-top: 1px solid var(--color-border);
  padding-top: 12px;
}
.existing h4 {
  margin: 0 0 8px;
  font-size: 14px;
}
.exist-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  margin-bottom: 6px;
  font-size: 13px;
  background: #fff;
}
.muted {
  color: var(--color-text-secondary);
  font-size: 12px;
}
.cost {
  font-weight: 600;
  color: var(--color-primary);
}
.status {
  font-size: 11px;
  color: #b45309;
  background: #fef3c7;
  border-radius: 4px;
  padding: 1px 6px;
}
.icon-btn {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.icon-btn.danger:hover {
  color: var(--color-danger);
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
  margin: 0 0 6px;
}
.modal .desc {
  margin: 0 0 10px;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.modal label {
  display: block;
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 10px 0 4px;
}
.modal select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  outline: none;
  background: #fff;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
