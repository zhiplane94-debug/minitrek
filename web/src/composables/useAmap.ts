import { api } from '../api/client';

/**
 * 高德 JS API 共享加载器（全局单例）
 * - 从设置读取 Key
 * - 动态加载脚本并带齐插件（PlaceSearch / Geocoder）
 * - 返回 AMap 构造器；未配 Key 时抛出带 code 的 Error
 */
let amapScriptLoading: Promise<any> | null = null;

export class NoAmapKeyError extends Error {
  code = 'NO_KEY';
  constructor() {
    super('未配置高德 Key');
  }
}

export async function loadAmap(): Promise<any> {
  if ((window as any).AMap) return (window as any).AMap;
  if (amapScriptLoading) return amapScriptLoading;

  const { amapKey } = await api.getSettings();
  if (!amapKey) throw new NoAmapKeyError();

  amapScriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(amapKey)}` +
      `&plugin=AMap.Scale,AMap.ToolBar,AMap.PlaceSearch,AMap.Geocoder`;
    script.async = true;
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve((window as any).AMap);
    };
    script.onload = () => {
      let n = 0;
      const tick = () => {
        if ((window as any).AMap) return done();
        if (++n > 10) return done(new Error('高德地图初始化超时，请确认 Key 有效'));
        setTimeout(tick, 200);
      };
      tick();
    };
    script.onerror = () => done(new Error('高德地图脚本加载失败，请检查网络与 Key'));
    document.head.appendChild(script);
  });
  return amapScriptLoading;
}
