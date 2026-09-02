import type { FastifyInstance } from 'fastify';
import https from 'node:https';
import { cityCoord } from '../lib/cities.js';

/** 强制 IPv4 的 HTTPS GET（Node 默认 IPv6 优先在该网络下会超时） */
function httpsGet(url: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get(
      {
        host: u.hostname,
        path: u.pathname + u.search,
        family: 4,
        timeout: timeoutMs,
        headers: { 'User-Agent': 'miniTrek/0.1' },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
          } else {
            resolve(data);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
  });
}

/** WMO 天气代码 → 中文描述 */
const WMO: Record<number, string> = {
  0: '晴', 1: '晴间多云', 2: '多云', 3: '阴',
  45: '雾', 48: '雾凇',
  51: '毛毛雨', 53: '毛毛雨', 55: '毛毛雨', 56: '冻毛毛雨', 57: '冻毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '小阵雨', 81: '阵雨', 82: '强阵雨', 85: '小阵雪', 86: '大阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '雷暴伴强冰雹',
};

export function weatherDesc(code: number): string {
  return WMO[code] || '未知';
}

interface Daily {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  weather_code: number[];
}

/** 调用 open-meteo 获取指定日期天气（免费、无需 key、按经纬度、覆盖未来16天）
 *  返回 {temp, desc} | {available:false}(日期超出预报范围) | null(服务不可用) */
export async function fetchWeather(
  lng: number,
  lat: number,
  date: string,
): Promise<{ temp: number; desc: string } | { available: false } | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Asia%2FShanghai&forecast_days=16`;
  let data: { daily?: Daily };
  try {
    data = JSON.parse(await httpsGet(url));
  } catch {
    return null;
  }
  const daily = data.daily;
  if (!daily) return null;
  const idx = daily.time.indexOf(date);
  if (idx < 0) return { available: false };
  return {
    temp: Math.round(daily.temperature_2m_max[idx]),
    desc: weatherDesc(daily.weather_code[idx]),
  };
}

export async function weatherRoutes(app: FastifyInstance) {
  // 查询城市天气：GET /api/weather?city=扬州&date=2026-09-26
  app.get('/weather', async (req, reply) => {
    const { city, date, lat, lng } = req.query as {
      city?: string;
      date?: string;
      lat?: string;
      lng?: string;
    };
    if (!date) return reply.code(400).send({ error: '缺少 date 参数' });

    let coords: [number, number] | null = null;
    if (lat && lng) {
      coords = [Number(lng), Number(lat)];
    } else if (city) {
      coords = cityCoord(city);
    }
    if (!coords) {
      return reply.code(400).send({ error: `未找到城市「${city}」坐标，请携带经纬度或使用支持的城市` });
    }
    const weather = await fetchWeather(coords[0], coords[1], date);
    if (weather === null) {
      return reply.code(502).send({ error: '天气服务暂不可用，请稍后再试' });
    }
    if ('available' in weather) {
      return { date, available: false, message: '该日期天气预报尚未发布，出行临近时再来查询', city: city ?? null };
    }
    return { date, ...weather, city: city ?? null };
  });
}
