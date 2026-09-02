<template>
  <div class="cost-panel">
    <div class="total-card">
      <span class="label">总费用</span>
      <span class="amount">¥{{ totalCost.toFixed(2) }}</span>
      <span class="sub">共 {{ totalActs }} 个节点，{{ noCost }} 个未填费用</span>
    </div>

    <!-- 按分类汇总 -->
    <div class="block">
      <h4>按类型</h4>
      <div v-for="c in catList" :key="c.label" class="cat-row">
        <span class="cat-label">{{ c.label }}</span>
        <div class="bar-wrap">
          <div class="bar" :style="{ width: pct(c.amount) }"></div>
        </div>
        <span class="cat-amount">¥{{ c.amount.toFixed(0) }}</span>
        <span class="cat-count">{{ c.count }} 项</span>
      </div>
    </div>

    <!-- 按天明细 -->
    <div class="block">
      <h4>按天明细</h4>
      <div v-for="day in trip.days || []" :key="day.id" class="day-row">
        <div class="day-head">
          <span class="day-no">第{{ day.dayNo }}天</span>
          <span class="day-date">{{ fmtDate(day.date) }}</span>
          <span class="day-total">¥{{ dayCost(day).toFixed(0) }}</span>
        </div>
        <div v-for="a in costActs(day)" :key="a.id" class="act-row">
          <span class="act-name">{{ a.name }}</span>
          <span class="act-type">{{ sectionOf(a.type) }}</span>
          <span class="act-cost">¥{{ a.cost }}</span>
        </div>
        <div v-if="!dayHasCost(day)" class="muted">当天无费用记录</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Trip, TripDay } from '../api/client';

const props = defineProps<{ trip: Trip }>();

function sectionOf(type: string): string {
  if (type === '住宿') return '住宿';
  if (type === '交通') return '交通';
  if (type === '餐饮' || type === '美食') return '餐饮';
  if (type === '景点' || type === '地点') return '景点';
  return '其他';
}

const dayCost = (day: TripDay) => day.activities.reduce((s, a) => s + (a.cost ?? 0), 0);
const dayHasCost = (day: TripDay) => day.activities.some((a) => a.cost);
const costActs = (day: TripDay) => day.activities.filter((a) => a.cost);
const totalCost = computed(() => (props.trip.days ?? []).reduce((s, d) => s + dayCost(d), 0));
const totalActs = computed(() => (props.trip.days ?? []).reduce((s, d) => s + d.activities.length, 0));
const noCost = computed(
  () => (props.trip.days ?? []).reduce((s, d) => s + d.activities.filter((a) => !a.cost).length, 0),
);

const catList = computed(() => {
  const cats: Record<string, { amount: number; count: number }> = {};
  for (const d of props.trip.days ?? []) {
    for (const a of d.activities) {
      const sec = sectionOf(a.type);
      cats[sec] = cats[sec] || { amount: 0, count: 0 };
      cats[sec].amount += a.cost ?? 0;
      if (a.cost) cats[sec].count += 1;
    }
  }
  return Object.entries(cats)
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.amount - a.amount);
});

function pct(amount: number) {
  if (totalCost.value <= 0) return '0%';
  return Math.max(2, Math.round((amount / totalCost.value) * 100)) + '%';
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function fmtDate(s: string) {
  const d = new Date(s + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
}
</script>

<style scoped>
.cost-panel {
  padding: 20px 28px;
  max-width: 860px;
  width: 100%;
}
.total-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 18px 22px;
  background: var(--color-surface);
  display: flex;
  align-items: baseline;
  gap: 14px;
}
.label {
  color: var(--color-text-secondary);
  font-size: 14px;
}
.amount {
  font-size: 30px;
  font-weight: 700;
  color: var(--color-primary);
}
.sub {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-left: auto;
}
.block {
  margin-top: 18px;
}
.block h4 {
  margin: 0 0 10px;
  font-size: 14px;
}
.cat-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
}
.cat-label {
  width: 48px;
  color: var(--color-text-secondary);
}
.bar-wrap {
  flex: 1;
  height: 14px;
  background: #eef1f4;
  border-radius: 7px;
  overflow: hidden;
}
.bar {
  height: 100%;
  background: var(--color-primary);
  border-radius: 7px;
  transition: width 0.3s;
}
.cat-amount {
  width: 64px;
  text-align: right;
  font-weight: 600;
}
.cat-count {
  width: 44px;
  text-align: right;
  color: var(--color-text-secondary);
  font-size: 12px;
}
.day-row {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 10px;
  background: #fff;
}
.day-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.day-no {
  font-weight: 700;
}
.day-date {
  color: var(--color-text-secondary);
  font-size: 12px;
}
.day-total {
  margin-left: auto;
  font-weight: 700;
  color: var(--color-primary);
}
.act-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  font-size: 13px;
  border-top: 1px dashed var(--color-border);
}
.act-name {
  flex: 1;
}
.act-type {
  color: var(--color-text-secondary);
  font-size: 12px;
}
.act-cost {
  font-weight: 600;
  width: 72px;
  text-align: right;
}
.muted {
  color: var(--color-text-secondary);
  font-size: 12px;
}
</style>
