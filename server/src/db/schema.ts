import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/** 行程项目 */
export const trips = sqliteTable('trips', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  origin: text('origin').notNull(),
  destination: text('destination').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  status: text('status').notNull().default('规划中'),
  shareToken: text('share_token'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** 家庭成员画像（每个行程一份） */
export const familyMembers = sqliteTable('family_members', {
  id: text('id').primaryKey(),
  tripId: text('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  role: text('role').notNull(), // 成人/儿童/婴儿/老人
  birthYear: integer('birth_year'),
  note: text('note'),
});

/** 行程天数 */
export const tripDays = sqliteTable('trip_days', {
  id: text('id').primaryKey(),
  tripId: text('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  dayNo: integer('day_no').notNull(),
  date: text('date').notNull(),
  note: text('note'),
  weatherTemp: integer('weather_temp'), // 当天温度（℃）
  weatherDesc: text('weather_desc'), // 天气描述，如"晴"
});

/** 行程节点（住宿/景点/交通/餐饮/备注 统一一张表） */
export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  dayId: text('day_id')
    .notNull()
    .references(() => tripDays.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 住宿/景点/交通/餐饮/备注
  name: text('name').notNull(),
  address: text('address'),
  lat: real('lat'),
  lng: real('lng'),
  time: text('time'),
  cost: real('cost'),
  bookStatus: text('book_status').notNull().default('待预订'), // 待预订/已预订/无需预订
  note: text('note'),
  sortOrder: integer('sort_order').notNull().default(0),
  refType: text('ref_type'), // 交通引用：train/other
  refId: text('ref_id'), // 关联车次快照 JSON
});

/** 出行清单 */
export const checklistItems = sqliteTable('checklist_items', {
  id: text('id').primaryKey(),
  tripId: text('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  done: integer('done').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
});

/** MCP API Token（单用户场景可仅一条） */
export const mcpTokens = sqliteTable('mcp_tokens', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  label: text('label'),
  createdAt: text('created_at').notNull(),
});

/** 运行时设置（key-value），如高德地图 API Key */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at').notNull(),
});
