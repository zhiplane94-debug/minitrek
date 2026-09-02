import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from './index.js';
import { trips, tripDays, activities, familyMembers, checklistItems } from './schema.js';

/** 用本地时间格式化为 YYYY-MM-DD（避免 toISOString 的 UTC 时区偏移） */
export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 计算 start..end 之间的所有日期（含两端） */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    out.push(fmtDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** 组装行程完整结构（含天数、节点、成员、清单） */
export async function getTrip(id: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, id));
  if (!trip) return null;

  const days = await db
    .select()
    .from(tripDays)
    .where(eq(tripDays.tripId, id))
    .orderBy(tripDays.dayNo);

  const dayIds = days.map((d) => d.id);
  const acts = dayIds.length
    ? await db
        .select()
        .from(activities)
        .where(inArray(activities.dayId, dayIds))
        .orderBy(activities.sortOrder)
    : [];

  const actsByDay = new Map<string, typeof acts>();
  for (const a of acts) {
    if (!actsByDay.has(a.dayId)) actsByDay.set(a.dayId, []);
    actsByDay.get(a.dayId)!.push(a);
  }

  const members = await db.select().from(familyMembers).where(eq(familyMembers.tripId, id));
  const checklist = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.tripId, id))
    .orderBy(checklistItems.sortOrder);

  return {
    ...trip,
    days: days.map((d) => ({ ...d, activities: actsByDay.get(d.id) || [] })),
    members,
    checklist,
  };
}

export async function listTrips() {
  return db.select().from(trips).orderBy(trips.createdAt);
}

export interface CreateTripInput {
  title: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate?: string;
}

/** 新建行程，并按日期范围自动生成天数 */
export async function createTrip(data: CreateTripInput) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const start = data.startDate;
  const end = data.endDate || start;

  await db.insert(trips).values({
    id,
    title: data.title,
    origin: data.origin,
    destination: data.destination,
    startDate: start,
    endDate: end,
    status: '规划中',
    createdAt: now,
    updatedAt: now,
  });

  const dates = daysBetween(start, end);
  for (let i = 0; i < dates.length; i++) {
    await db.insert(tripDays).values({ id: randomUUID(), tripId: id, dayNo: i + 1, date: dates[i] });
  }
  return getTrip(id);
}

export interface ImportActivityInput {
  type?: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  time?: string | null;
  cost?: number | null;
  bookStatus?: string;
  note?: string | null;
}

export interface ImportDayInput {
  date: string;
  weatherTemp?: number | null;
  weatherDesc?: string | null;
  note?: string | null;
  activities?: ImportActivityInput[];
}

export interface ImportTripInput {
  title: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate?: string;
  days?: ImportDayInput[];
}

/** 批量导入：一次创建行程 + 天数 + 节点（供 md 导入使用） */
export async function importTrip(data: ImportTripInput) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const start = data.startDate;
  const end = data.endDate || start;

  await db.insert(trips).values({
    id,
    title: data.title,
    origin: data.origin,
    destination: data.destination,
    startDate: start,
    endDate: end,
    status: '规划中',
    createdAt: now,
    updatedAt: now,
  });

  // 有显式天数则按天数导入；否则按日期范围生成空天
  const dayInputs: ImportDayInput[] =
    data.days && data.days.length
      ? data.days
      : daysBetween(start, end).map((d): ImportDayInput => ({ date: d }));
  for (let i = 0; i < dayInputs.length; i++) {
    const day = dayInputs[i];
    const dayId = randomUUID();
    await db.insert(tripDays).values({
      id: dayId,
      tripId: id,
      dayNo: i + 1,
      date: day.date,
      weatherTemp: day.weatherTemp ?? null,
      weatherDesc: day.weatherDesc ?? null,
      note: day.note ?? null,
    });
    const acts = day.activities || [];
    for (let j = 0; j < acts.length; j++) {
      const a = acts[j];
      await db.insert(activities).values({
        id: randomUUID(),
        dayId,
        type: a.type || '计划',
        name: a.name,
        address: a.address ?? null,
        lat: a.lat ?? null,
        lng: a.lng ?? null,
        time: a.time ?? null,
        cost: a.cost ?? null,
        bookStatus: a.bookStatus || '待预订',
        note: a.note ?? null,
        sortOrder: j,
      });
    }
  }
  return getTrip(id);
}

export async function deleteTrip(id: string) {
  await db.delete(trips).where(eq(trips.id, id));
}

export async function updateTrip(
  id: string,
  patch: Partial<{
    title: string;
    origin: string;
    destination: string;
    startDate: string;
    endDate: string;
    status: string;
  }>,
) {
  const [existing] = await db.select().from(trips).where(eq(trips.id, id));
  if (!existing) return null;
  await db.update(trips).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(trips.id, id));
  // 仅当日期范围「实际变化」时才同步天数；值未变时不得重建（避免级联删除节点）
  const newStart = patch.startDate || existing.startDate;
  const newEnd = patch.endDate || patch.startDate || existing.endDate;
  if (newStart !== existing.startDate || newEnd !== existing.endDate) {
    const oldRows = await db.select().from(tripDays).where(eq(tripDays.tripId, id));
    const oldByDate = new Map(oldRows.map((r) => [r.date, r]));
    const newDates = daysBetween(newStart, newEnd);
    const kept = new Set(newDates);
    // 删除已不在新日期范围内的天（其节点随之外联删除）
    for (const r of oldRows) {
      if (!kept.has(r.date)) await db.delete(tripDays).where(eq(tripDays.id, r.id));
    }
    // 保留仍在范围内的天（含节点），仅校正 dayNo；缺失日期补全新天
    for (let i = 0; i < newDates.length; i++) {
      const date = newDates[i];
      const existing = oldByDate.get(date);
      if (existing) {
        if (existing.dayNo !== i + 1 || existing.date !== date) {
          await db.update(tripDays).set({ dayNo: i + 1, date }).where(eq(tripDays.id, existing.id));
        }
      } else {
        await db.insert(tripDays).values({ id: randomUUID(), tripId: id, dayNo: i + 1, date });
      }
    }
  }
  return getTrip(id);
}

/** 新增行程天数（dayNo 自动为当前最大 +1） */
export async function addDay(tripId: string, date: string, dayNo?: number) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!trip) return null;
  const rows = await db.select().from(tripDays).where(eq(tripDays.tripId, tripId));
  const no = dayNo ?? rows.reduce((m, r) => Math.max(m, r.dayNo), 0) + 1;
  const id = randomUUID();
  await db.insert(tripDays).values({ id, tripId, dayNo: no, date });
  const [day] = await db.select().from(tripDays).where(eq(tripDays.id, id));
  return day;
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
}

/** 在指定天添加节点，返回该天所有节点 */
export async function addActivity(dayId: string, data: ActivityInput) {
  const rows = await db.select().from(activities).where(eq(activities.dayId, dayId));
  const sortOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0) + 1;
  await db.insert(activities).values({
    id: randomUUID(),
    dayId,
    type: data.type || '景点',
    name: data.name,
    address: data.address ?? null,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    time: data.time ?? null,
    cost: data.cost ?? null,
    bookStatus: data.bookStatus || '待预订',
    note: data.note ?? null,
    sortOrder,
    refType: null,
    refId: null,
  });
  return getActivities(dayId);
}

export async function updateActivity(id: string, patch: Record<string, unknown>) {
  await db.update(activities).set(patch).where(eq(activities.id, id));
  const [act] = await db.select().from(activities).where(eq(activities.id, id));
  return act ? getActivities(act.dayId) : null;
}

export async function deleteActivity(id: string) {
  await db.delete(activities).where(eq(activities.id, id));
}

export async function getActivities(dayId: string) {
  return db.select().from(activities).where(eq(activities.dayId, dayId)).orderBy(activities.sortOrder);
}

/** 移动/排序节点（同天和跨天），事务保证新旧天顺序连续 */
export function moveActivity(id: string, targetDayId: string, position?: number) {
  const act = db.select().from(activities).where(eq(activities.id, id)).get();
  if (!act) return false;
  const targetExists = db.select().from(tripDays).where(eq(tripDays.id, targetDayId)).get();
  if (!targetExists) return false;

  const oldDayId = act.dayId;
  const pos = Math.max(0, position ?? 9999);

  db.transaction((tx) => {
    const targetRows = tx
      .select()
      .from(activities)
      .where(eq(activities.dayId, targetDayId))
      .all()
      .filter((r) => r.id !== id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    targetRows.splice(Math.min(pos, targetRows.length), 0, act);

    for (let i = 0; i < targetRows.length; i++) {
      const r = targetRows[i];
      if (r.id === id) {
        tx.update(activities)
          .set({ dayId: targetDayId, sortOrder: i + 1 })
          .where(eq(activities.id, id))
          .run();
      } else if (r.sortOrder !== i + 1) {
        tx.update(activities).set({ sortOrder: i + 1 }).where(eq(activities.id, r.id)).run();
      }
    }

    if (oldDayId !== targetDayId) {
      const oldRows = tx
        .select()
        .from(activities)
        .where(eq(activities.dayId, oldDayId))
        .all()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      for (let i = 0; i < oldRows.length; i++) {
        tx.update(activities).set({ sortOrder: i + 1 }).where(eq(activities.id, oldRows[i].id)).run();
      }
    }
  });

  return true;
}

export async function updateDay(
  id: string,
  patch: Partial<{ weatherTemp: number | null; weatherDesc: string | null; note: string | null }>,
) {
  await db.update(tripDays).set(patch).where(eq(tripDays.id, id));
  const [day] = await db.select().from(tripDays).where(eq(tripDays.id, id));
  return day;
}

export async function addChecklistItem(tripId: string, name: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!trip) return null;
  const rows = await db.select().from(checklistItems).where(eq(checklistItems.tripId, tripId));
  const sortOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0) + 1;
  await db.insert(checklistItems).values({
    id: randomUUID(),
    tripId,
    name,
    done: 0,
    sortOrder,
  });
  return db.select().from(checklistItems).where(eq(checklistItems.tripId, tripId)).orderBy(checklistItems.sortOrder);
}

/** 通过分享 token 获取行程（只读分享用） */
export async function getTripByShareToken(token: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.shareToken, token));
  if (!trip) return null;
  return getTrip(trip.id);
}

/** 确保行程有分享 token，无则生成 */
export async function ensureShareToken(id: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, id));
  if (!trip) return null;
  if (trip.shareToken) return trip.shareToken;
  const token = randomUUID();
  await db.update(trips).set({ shareToken: token }).where(eq(trips.id, id));
  return token;
}
