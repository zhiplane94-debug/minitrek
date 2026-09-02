<template>
  <div v-if="trip" class="share">
    <header class="topbar">
      <div class="left">
        <span class="brand">miniTrek</span>
        <span class="title">{{ trip.title }}（{{ trip.origin }}出发）</span>
      </div>
      <span class="badge">只读分享</span>
    </header>

    <div class="summary">
      <span>{{ trip.destination }} · {{ trip.startDate }}</span>
      <span v-if="trip.endDate">至 {{ trip.endDate }}</span>
      <span class="dot">·</span>
      <span>共 {{ trip.days?.length || 0 }} 天</span>
      <span class="dot">·</span>
      <span>总费用 ¥{{ totalCost.toFixed(2) }}</span>
    </div>

    <div class="body">
      <!-- 左栏 · 只读时间线 -->
      <aside class="timeline">
        <div v-for="day in trip.days" :key="day.id" class="day-card" :class="{ active: activeDayId === day.id }">
          <div class="day-head" @click="activeDayId = day.id">
            <span class="day-no">第{{ day.dayNo }}天</span>
            <span class="day-date">{{ fmtDate(day.date) }}</span>
            <span v-if="day.weatherTemp != null || day.weatherDesc" class="day-weather">
              {{ day.weatherTemp != null ? day.weatherTemp + '°' : '' }}{{ day.weatherDesc || '' }}
            </span>
          </div>
          <div v-for="sec in sectionOrder" :key="sec">
            <div v-if="grouped(day)[sec].length" class="section">
              <div class="section-label">{{ sec }}</div>
              <div v-for="act in grouped(day)[sec]" :key="act.id" class="node">
                <div class="node-main">
                  <span class="node-name">{{ act.name }}</span>
                  <span v-if="act.bookStatus && act.bookStatus !== '无需预订'" class="node-status">
                    {{ act.bookStatus }}
                  </span>
                  <span v-if="act.cost" class="node-cost">¥{{ act.cost }}</span>
                </div>
                <div v-if="act.address" class="node-addr">{{ act.address }}</div>
                <div v-if="act.time" class="node-addr">⏱ {{ act.time }}</div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- 右栏 · 地图 -->
      <section class="map">
        <AmapPanel :points="mapPoints" />
      </section>
    </div>
  </div>

  <div v-else-if="error" class="loading error">{{ error }}</div>
  <div v-else class="loading">加载中…</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api, type Trip, type TripDay, type Activity } from '../api/client';
import AmapPanel from '../components/AmapPanel.vue';

interface MapPoint {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
}

const route = useRoute();
const trip = ref<Trip | null>(null);
const error = ref('');
const activeDayId = ref<string | null>(null);

const sectionOrder = ['住宿', '交通', '地点', '餐饮', '计划'] as const;
function sectionOf(type: string): string {
  if (type === '住宿') return '住宿';
  if (type === '交通') return '交通';
  if (type === '餐饮' || type === '美食') return '餐饮';
  if (type === '备注' || type === '计划' || type === '旅行计划') return '计划';
  return '地点';
}
function grouped(day: TripDay): Record<string, Activity[]> {
  const g: Record<string, Activity[]> = { 住宿: [], 交通: [], 地点: [], 餐饮: [], 计划: [] };
  for (const a of day.activities) {
    const sec = sectionOf(a.type);
    if (!g[sec]) g[sec] = [];
    g[sec].push(a);
  }
  return g;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function fmtDate(s: string) {
  const d = new Date(s + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
}

const totalCost = computed(() =>
  (trip.value?.days ?? []).reduce(
    (s, d) => s + d.activities.reduce((x, a) => x + (a.cost ?? 0), 0),
    0,
  ),
);

const mapPoints = computed<MapPoint[]>(() => {
  const t = trip.value;
  if (!t || !activeDayId.value) return [];
  const day = t.days?.find((d) => d.id === activeDayId.value);
  if (!day) return [];
  return day.activities
    .filter((a) => a.lat != null && a.lng != null)
    .map((a) => ({ name: a.name, address: a.address, lat: a.lat as number, lng: a.lng as number }));
});

onMounted(async () => {
  const token = route.params.token as string;
  try {
    const t = await api.getShareTrip(token);
    trip.value = t;
    if (t.days?.length) activeDayId.value = t.days[0].id;
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<style scoped>
.share {
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
.brand {
  font-weight: 700;
  color: var(--color-primary);
}
.title {
  font-weight: 600;
}
.badge {
  font-size: 12px;
  color: #b45309;
  background: #fef3c7;
  border-radius: 12px;
  padding: 3px 12px;
}
.summary {
  padding: 10px 24px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: #f7f8fa;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  gap: 8px;
  align-items: center;
}
.dot {
  opacity: 0.5;
}
.body {
  flex: 1;
  display: grid;
  grid-template-columns: 380px 1fr;
  height: calc(100vh - 118px);
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
.node-addr {
  color: var(--color-text-secondary);
  font-size: 12px;
}
.map {
  position: relative;
  background: #eef1f4;
}
.loading {
  padding: 60px;
  text-align: center;
  color: var(--color-text-secondary);
}
.loading.error {
  color: var(--color-danger);
}
</style>
