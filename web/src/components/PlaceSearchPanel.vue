<template>
  <div class="place-panel">
    <div class="search-row">
      <input
        v-model="keyword"
        class="search"
        placeholder="搜索地点，如：瘦西湖 / 何园…"
        @keyup.enter="onSearch"
      />
      <button class="btn btn-primary btn-go" :disabled="searching" @click="onSearch">
        {{ searching ? '…' : '搜' }}
      </button>
    </div>

    <p v-if="!activeDayId" class="muted">请先在左侧选中某一天，再搜索添加地点</p>

    <div v-if="searchMsg" class="search-msg">{{ searchMsg }}</div>

    <div v-if="results.length" class="results">
      <div v-for="(poi, i) in results" :key="poi.id + i" class="poi">
        <div class="poi-main">
          <span class="poi-name">{{ poi.name }}</span>
          <button
            class="btn btn-add"
            :disabled="!activeDayId || addingId === poi.id"
            @click="addPoi(poi)"
          >
            {{ addingId === poi.id ? '添加中…' : '＋ 添加' }}
          </button>
        </div>
        <div class="poi-addr">{{ poi.address || '（无地址）' }}</div>
        <div class="poi-type">{{ poi.type }}</div>
      </div>
    </div>

    <div v-else-if="!searching && searched && !searchMsg" class="muted">未找到相关地点，换个关键词试试</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, type Trip } from '../api/client';

const props = defineProps<{
  trip: Trip;
  activeDayId: string | null;
  destination: string;
}>();
const emit = defineEmits<{ (e: 'added'): void }>();

const keyword = ref('');
const searching = ref(false);
const searched = ref(false);
const searchMsg = ref('');
const results = ref<any[]>([]);
const addingId = ref('');

watch(
  () => props.destination,
  () => {
    /* 目的地变化时清空旧结果 */
    results.value = [];
    searched.value = false;
  },
);

async function onSearch() {
  const kw = keyword.value.trim();
  if (!kw) return;
  searching.value = true;
  searched.value = true;
  searchMsg.value = '';
  results.value = [];
  try {
    const { pois } = await api.poiSearch(kw, props.destination || undefined);
    searching.value = false;
    if (pois.length) {
      results.value = pois;
    } else {
      searchMsg.value = '未找到相关地点';
    }
  } catch (e) {
    searching.value = false;
    searchMsg.value = (e as Error).message;
  }
}

async function addPoi(poi: any) {
  if (!props.activeDayId) return;
  addingId.value = poi.id;
  try {
    await api.addActivity(props.activeDayId, {
      type: '景点',
      name: poi.name,
      address: poi.address || null,
      lat: poi.lat ?? null,
      lng: poi.lng ?? null,
      bookStatus: '待预订',
    });
    emit('added');
  } catch (e) {
    searchMsg.value = (e as Error).message;
  } finally {
    addingId.value = '';
  }
}
</script>

<style scoped>
.place-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.search-row {
  display: flex;
  gap: 6px;
}
.search {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  outline: none;
  font-size: 13px;
}
.search:focus {
  border-color: var(--color-primary);
}
.btn-go {
  padding: 8px 12px;
  font-size: 13px;
}
.muted {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin: 0;
  line-height: 1.6;
}
.search-msg {
  color: var(--color-danger);
  font-size: 12px;
}
.results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 46vh;
  overflow-y: auto;
}
.poi {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 8px 10px;
  background: #fff;
  font-size: 13px;
  line-height: 1.6;
}
.poi-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.poi-name {
  font-weight: 600;
}
.btn-add {
  font-size: 12px;
  padding: 3px 10px;
  flex-shrink: 0;
}
.poi-addr {
  color: var(--color-text-secondary);
  font-size: 12px;
}
.poi-type {
  color: var(--color-text-secondary);
  font-size: 11px;
}
</style>
