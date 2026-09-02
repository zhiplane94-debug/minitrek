const BASE = '/api';
const TOKEN_KEY = 'minitrek_session';

export function getSessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSessionToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

interface ApiOptions {
  method?: string;
  body?: unknown;
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) headers['Content-Type'] = 'application/json';
  const token = getSessionToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + path, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: string }).error || '未登录或会话已过期';
    // 登录接口的 401 表示密码错误，不当作会话失效处理
    if (path === '/auth/login') {
      throw new Error(msg);
    }
    setSessionToken(null);
    if (!location.pathname.startsWith('/login')) {
      location.href = '/login';
    }
    throw new Error(msg);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `请求失败 (${res.status})`);
  }
  return res.json();
}

export interface Trip {
  id: string;
  title: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
  days?: TripDay[];
  members?: unknown[];
  checklist?: unknown[];
}

export interface TripDay {
  id: string;
  tripId: string;
  dayNo: number;
  date: string;
  note: string | null;
  weatherTemp: number | null;
  weatherDesc: string | null;
  activities: Activity[];
}

export interface Activity {
  id: string;
  dayId: string;
  type: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  time: string | null;
  cost: number | null;
  bookStatus: string;
  note: string | null;
  sortOrder: number;
  refType: string | null;
  refId: string | null;
}

export interface ActivityInput {
  type?: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  time?: string | null;
  cost?: number | null;
  bookStatus?: string;
  note?: string | null;
  refType?: string | null;
  refId?: string | null;
}

export const api = {
  // 登录 / 认证
  login: (password: string) => request<{ ok: boolean; token: string }>('/auth/login', { method: 'POST', body: { password } }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST', body: {} }),
  getAuthMe: () => request<{ authed: boolean; passwordConfigured: boolean }>('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/auth/change-password', { method: 'POST', body: { oldPassword, newPassword } }),

  listTrips: () => request<Trip[]>('/trips'),
  getTrip: (id: string) => request<Trip>(`/trips/${id}`),
  createTrip: (data: {
    title: string;
    origin: string;
    destination: string;
    startDate: string;
    endDate?: string;
  }) => request<Trip>('/trips', { method: 'POST', body: data }),
  deleteTrip: (id: string) =>
    request<{ ok: boolean }>(`/trips/${id}`, { method: 'DELETE' }),
  updateTrip: (id: string, data: {
    title?: string;
    origin?: string;
    destination?: string;
    startDate?: string;
    endDate?: string;
  }) => request<Trip>(`/trips/${id}`, { method: 'PATCH', body: data }),
  importTrip: (data: {
    title: string;
    origin: string;
    destination: string;
    startDate: string;
    endDate?: string;
    days?: {
      date: string;
      weatherTemp?: number | null;
      weatherDesc?: string | null;
      note?: string | null;
      activities?: ActivityInput[];
    }[];
  }) => request<Trip>('/trips/import', { method: 'POST', body: data }),

  // 行程节点
  addActivity: (dayId: string, data: ActivityInput) =>
    request<Activity[]>(`/days/${dayId}/activities`, { method: 'POST', body: data }),
  updateActivity: (id: string, data: Partial<ActivityInput>) =>
    request<Activity[]>(`/activities/${id}`, { method: 'PATCH', body: data }),
  deleteActivity: (id: string) =>
    request<{ ok: boolean }>(`/activities/${id}`, { method: 'DELETE' }),
  moveActivity: (id: string, data: { dayId: string; position?: number }) =>
    request<{ ok: boolean }>(`/activities/${id}/move`, { method: 'POST', body: data }),

  // 天数（天气）
  updateDay: (id: string, data: { weatherTemp?: number | null; weatherDesc?: string | null; note?: string | null }) =>
    request<TripDay>(`/days/${id}`, { method: 'PATCH', body: data }),

  // 设置
  getSettings: () => request<{ amapKey: string | null; amapWebKey: string | null }>('/settings'),
  saveSettings: (data: { amapKey?: string; amapWebKey?: string }) =>
    request<{ ok: boolean; amapKey: string | null; amapWebKey: string | null }>('/settings', {
      method: 'PUT',
      body: data,
    }),

  // 高德 Web 服务（POI 搜索 / 地理编码，需 Web 服务 Key）
  poiSearch: (keywords: string, city?: string) =>
    request<{ pois: { id: string; name: string; address: string; type: string; lat: number | null; lng: number | null }[] }>(
      `/poi/search?keywords=${encodeURIComponent(keywords)}${city ? `&city=${encodeURIComponent(city)}` : ''}`,
    ),
  geocode: (address: string, city?: string) =>
    request<{ result: { lat: number; lng: number; address: string } | null }>(
      `/geocode?address=${encodeURIComponent(address)}${city ? `&city=${encodeURIComponent(city)}` : ''}`,
    ),

  // 天气（open-meteo，经后端代理）
  getWeather: (city: string, date: string) =>
    request<{ date: string; temp: number; desc: string; available: boolean; message?: string; city?: string | null }>(
      `/weather?city=${encodeURIComponent(city)}&date=${date}`,
    ),

  // 12306 车次查询（经后端代理）
  trainQuery: (data: { date: string; from: string; to: string; type?: string; earliest?: number; latest?: number; limit?: number }) =>
    request<any[]>(`/train/query?${new URLSearchParams(data as any).toString()}`),
  trainStations: (data: { city?: string; name?: string }) =>
    request<any[]>(`/train/stations?${new URLSearchParams(data as any).toString()}`),

  // 分享
  createShare: (id: string) =>
    request<{ shareUrl: string }>(`/trips/${id}/share`, { method: 'POST' }),
  getShareTrip: (token: string) => request<Trip>(`/share/${token}`),

  // MCP API Token
  getMcpTokenStatus: () =>
    request<{ envTokenConfigured: boolean; dbTokens: number; createdAt: string | null; label: string | null }>(
      '/mcp/token',
    ),
  createMcpToken: () =>
    request<{ ok: boolean; token: string; note: string }>('/mcp/token', { method: 'POST', body: {} }),
};
