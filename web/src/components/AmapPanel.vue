<template>
  <div class="amap-panel">
    <!-- 地图容器常驻 DOM（不隐藏），保证高德初始化时尺寸正确 -->
    <div id="amap-container" class="amap-container"></div>

    <div v-if="state === 'no-key'" class="map-msg">
      <p>地图未配置</p>
      <p class="muted">
        请在 <button class="link" @click="goSettings">设置</button>
        中填写高德地图 API Key（Web 端 JS API）
      </p>
    </div>
    <div v-else-if="state === 'loading'" class="map-msg">地图加载中…</div>
    <div v-else-if="state === 'error'" class="map-msg error">{{ error }}</div>

    <div
      v-if="state === 'ready' && points.length === 0"
      class="map-msg empty"
    >
      <p>当天暂无地点点位</p>
      <p class="muted">给当天节点填写经纬度（编辑节点）后即可在地图显示</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { loadAmap, NoAmapKeyError } from '../composables/useAmap';

interface MapPoint {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
}

const props = defineProps<{ points: MapPoint[] }>();
const router = useRouter();
const state = ref<'idle' | 'loading' | 'ready' | 'no-key' | 'error'>('idle');
const error = ref('');

let amap: any = null;
let map: any = null;
let markers: any[] = [];
let infoWindow: any = null;
let disposed = false;

function goSettings() {
  router.push('/settings');
}

async function initMap() {
  if (disposed) return;
  state.value = 'loading';
  try {
    amap = await loadAmap();
    if (disposed) return;
    map = new amap.Map('amap-container', {
      zoom: 12,
      center: [119.42, 32.39],
      resizeEnable: true,
    });
    infoWindow = new amap.InfoWindow({ offset: new amap.Pixel(0, -30) });
    state.value = 'ready';
    // 容器可能刚完成布局，主动校正一次尺寸再 fit 视野
    map.resize();
    renderMarkers();
  } catch (e) {
    if (disposed) return;
    if (e instanceof NoAmapKeyError) {
      state.value = 'no-key';
      return;
    }
    error.value = (e as Error).message;
    state.value = 'error';
  }
}

/** 清除并重建 marker，视野自适应到当前天点位 */
function renderMarkers() {
  if (!map || state.value !== 'ready') return;
  markers.forEach((m) => map.remove(m));
  markers = [];

  const pts = props.points;
  for (const p of pts) {
    const marker = new amap.Marker({
      position: [p.lng, p.lat],
      title: p.name,
      content: `<div class="amap-marker" style="
        background:#2f6fed;color:#fff;border-radius:12px;padding:2px 8px;
        font-size:12px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25);
        border:2px solid #fff;">${p.name}</div>`,
    });
    marker.on('click', () => {
      infoWindow.setContent(
        `<div style="padding:6px 10px;font-size:13px;line-height:1.7">
          <b>${p.name}</b><br/><span style="color:#666">${p.address || '（无地址）'}</span>
        </div>`,
      );
      infoWindow.open(map, [p.lng, p.lat]);
    });
    map.add(marker);
    markers.push(marker);
  }

  if (pts.length) {
    map.setFitView(markers, false, [70, 70, 70, 70]);
  } else {
    // 默认视野：扬州城区
    map.setZoomAndCenter(11, [119.42, 32.39]);
  }
}

watch(
  () => props.points,
  () => renderMarkers(),
  { deep: true },
);

onMounted(initMap);
onBeforeUnmount(() => {
  disposed = true;
  markers = [];
  if (map) map.destroy();
  map = null;
});
</script>

<style scoped>
.amap-panel {
  position: absolute;
  inset: 0;
}
.amap-container {
  width: 100%;
  height: 100%;
}
.map-msg {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--color-text-secondary);
  background: #eef1f4;
  font-size: 14px;
  text-align: center;
}
.map-msg p {
  margin: 0;
}
.map-msg .muted {
  font-size: 12px;
}
.map-msg.error {
  color: var(--color-danger);
}
.link {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  text-decoration: underline;
}
</style>
