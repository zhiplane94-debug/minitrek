import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createTrip,
  listTrips,
  getTrip,
  updateTrip,
  addDay,
  addActivity,
  updateActivity,
  deleteActivity,
  moveActivity,
  addChecklistItem,
} from '../db/queries.js';
import { trainClient } from '../train/client.js';

/** 统一把结果转成 MCP 文本输出 */
function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function createMcpServer() {
  const server = new McpServer({
    name: 'miniTrek',
    version: '0.1.0',
  });

  // ---------- 行程 ----------
  server.registerTool(
    'create_trip',
    {
      title: '创建行程',
      description: '创建一次新的家庭旅行行程，并根据起止日期自动生成每天的空计划（天数）。创建后返回完整行程结构。',
      inputSchema: {
        title: z.string().describe('行程标题，如：扬州中秋亲子游'),
        origin: z.string().describe('出发地，如：郑州'),
        destination: z.string().describe('目的地，如：扬州'),
        startDate: z.string().describe('开始日期，格式 YYYY-MM-DD'),
        endDate: z.string().optional().describe('结束日期，格式 YYYY-MM-DD，缺省与开始日期相同'),
      },
    },
    async (args) => {
      const trip = await createTrip(args);
      return textResult(trip);
    },
  );

  server.registerTool(
    'list_trips',
    {
      title: '列出行程',
      description: '列出所有旅行行程项目（不含每日明细）。',
      inputSchema: {},
    },
    async () => textResult(await listTrips()),
  );

  server.registerTool(
    'get_trip',
    {
      title: '获取行程详情',
      description: '获取某个行程的完整结构，包括每天的计划、节点（住宿/交通/景点等）、成员与清单。',
      inputSchema: { tripId: z.string().describe('行程 ID') },
    },
    async (args) => {
      const trip = await getTrip(args.tripId);
      if (!trip) throw new Error('行程不存在');
      return textResult(trip);
    },
  );

  server.registerTool(
    'update_trip',
    {
      title: '更新行程',
      description: '更新行程基本信息（标题/出发地/目的地/日期/状态）。若修改日期范围，会自动重建每天的安排。',
      inputSchema: {
        tripId: z.string().describe('行程 ID'),
        title: z.string().optional().describe('新标题'),
        origin: z.string().optional().describe('新出发地'),
        destination: z.string().optional().describe('新目的地'),
        startDate: z.string().optional().describe('新开始日期 YYYY-MM-DD'),
        endDate: z.string().optional().describe('新结束日期 YYYY-MM-DD'),
        status: z.string().optional().describe('状态：规划中/已发布'),
      },
    },
    async (args) => {
      const { tripId, ...patch } = args;
      const trip = await updateTrip(tripId, patch);
      if (!trip) throw new Error('行程不存在');
      return textResult(trip);
    },
  );

  // ---------- 天数 ----------
  server.registerTool(
    'add_day',
    {
      title: '增加一天',
      description: '给行程手动增加一天安排。',
      inputSchema: {
        tripId: z.string().describe('行程 ID'),
        date: z.string().describe('日期 YYYY-MM-DD'),
        dayNo: z.number().optional().describe('第几天序号，缺省为当前最大+1'),
      },
    },
    async (args) => {
      const day = await addDay(args.tripId, args.date, args.dayNo);
      if (!day) throw new Error('行程不存在');
      return textResult(day);
    },
  );

  // ---------- 节点 ----------
  server.registerTool(
    'add_activity',
    {
      title: '添加行程节点',
      description: '在某一天添加一个行程节点（住宿/交通/景点/餐饮/备注等），返回该天所有节点。',
      inputSchema: {
        dayId: z.string().describe('天数 ID'),
        type: z.string().optional().describe('节点类型：景点/住宿/交通/餐饮/备注，默认景点'),
        name: z.string().describe('节点名称，如：瘦西湖风景区'),
        address: z.string().optional().describe('地址'),
        time: z.string().optional().describe('时间，如 08:00'),
        cost: z.number().optional().describe('费用（元）'),
        bookStatus: z.string().optional().describe('预订状态：待预订/已预订/无需预订'),
        note: z.string().optional().describe('备注'),
      },
    },
    async (args) => {
      const { dayId, ...data } = args;
      return textResult(await addActivity(dayId, data));
    },
  );

  server.registerTool(
    'update_activity',
    {
      title: '编辑行程节点',
      description: '更新某个行程节点的字段，返回该节点所在天的所有节点。',
      inputSchema: {
        activityId: z.string().describe('节点 ID'),
        type: z.string().optional(),
        name: z.string().optional(),
        address: z.string().nullable().optional(),
        time: z.string().nullable().optional(),
        cost: z.number().nullable().optional(),
        bookStatus: z.string().optional(),
        note: z.string().nullable().optional(),
      },
    },
    async (args) => {
      const { activityId, ...patch } = args;
      const acts = await updateActivity(activityId, patch);
      if (!acts) throw new Error('节点不存在');
      return textResult(acts);
    },
  );

  server.registerTool(
    'delete_activity',
    {
      title: '删除行程节点',
      description: '删除某个行程节点。',
      inputSchema: { activityId: z.string().describe('节点 ID') },
    },
    async (args) => {
      await deleteActivity(args.activityId);
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    'move_activity',
    {
      title: '移动/排序节点',
      description: '移动行程节点到目标天（可跨天），或在当天调整顺序。',
      inputSchema: {
        activityId: z.string().describe('节点 ID'),
        dayId: z.string().describe('目标天数 ID'),
        position: z.number().optional().describe('插入位置（从0开始），缺省移到末尾'),
      },
    },
    async (args) => {
      const ok = moveActivity(args.activityId, args.dayId, args.position);
      if (!ok) throw new Error('节点或目标天不存在');
      return textResult({ ok: true });
    },
  );

  // ---------- 清单 ----------
  server.registerTool(
    'add_checklist_item',
    {
      title: '添加出行清单项',
      description: '给行程的出行清单添加一项（如：证件、婴儿用品、赶海装备）。',
      inputSchema: {
        tripId: z.string().describe('行程 ID'),
        name: z.string().describe('清单项名称'),
      },
    },
    async (args) => {
      const list = await addChecklistItem(args.tripId, args.name);
      if (!list) throw new Error('行程不存在');
      return textResult(list);
    },
  );

  // ---------- 汇总 ----------
  server.registerTool(
    'get_trip_summary',
    {
      title: '行程汇总',
      description: '获取行程的汇总信息：天数、节点数、总费用、清单数等，适合快速了解行程概览。',
      inputSchema: { tripId: z.string().describe('行程 ID') },
    },
    async (args) => {
      const trip = await getTrip(args.tripId);
      if (!trip) throw new Error('行程不存在');
      const days = trip.days ?? [];
      const activities = days.flatMap((d) => d.activities ?? []);
      const totalCost = activities.reduce((s, a) => s + (a.cost ?? 0), 0);
      return textResult({
        id: trip.id,
        title: trip.title,
        route: `${trip.origin} → ${trip.destination}`,
        startDate: trip.startDate,
        endDate: trip.endDate,
        dayCount: days.length,
        status: trip.status,
        activityCount: activities.length,
        totalCost,
        checklistCount: (trip.checklist ?? []).length,
      });
    },
  );

  // ---------- 12306 车票查询（代理到 12306-mcp 服务） ----------
  server.registerTool(
    'query_train',
    {
      title: '查询火车票',
      description:
        '查询 12306 火车余票与票价（车次/出发到达时间/历时/各席别票价与余票）。' +
        '出发地与到达地支持中文城市名或车站名（如 郑州、扬州、北京南），也可用站代码。' +
        '若不确定站点代码可先调用 search_station。日期需为 YYYY-MM-DD 且不早于今天。',
      inputSchema: {
        date: z.string().describe('查询日期 YYYY-MM-DD（不早于今天，12306 一般预售 15 天）'),
        from: z.string().describe('出发地，中文城市名/车站名或 station_code，如 郑州'),
        to: z.string().describe('到达地，中文城市名/车站名或 station_code，如 扬州'),
        trainType: z
          .string()
          .optional()
          .describe('车次类型过滤，可组合，如 G(高铁/城际) D(动车) Z(直达) T(特快) K(快速)，默认空=全部'),
        earliestStartTime: z.number().optional().describe('最早出发小时 0-24，默认 0'),
        latestStartTime: z.number().optional().describe('最晚出发小时 0-24，默认 24'),
        limitedNum: z.number().optional().describe('返回车次数上限，默认不限'),
      },
    },
    async (args) => {
      const text = await trainClient.callTool('get-tickets', {
        date: args.date,
        fromStation: args.from,
        toStation: args.to,
        trainFilterFlags: args.trainType ?? '',
        earliestStartTime: args.earliestStartTime ?? 0,
        latestStartTime: args.latestStartTime ?? 24,
        limitedNum: args.limitedNum ?? 0,
        format: 'text',
      });
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  server.registerTool(
    'search_station',
    {
      title: '查询车站代码',
      description: '通过中文城市名或车站名查询 12306 车站代码（station_code），city 与 stationName 至少填一个。',
      inputSchema: {
        city: z.string().optional().describe('中文城市名，如 上海，返回该市全部车站'),
        stationName: z.string().optional().describe('中文车站名，如 郑州东 / 扬州东'),
      },
    },
    async (args) => {
      let text = '';
      if (args.stationName) {
        text = await trainClient.callTool('get-station-code-by-names', {
          stationNames: args.stationName,
        });
      } else if (args.city) {
        text = await trainClient.callTool('get-stations-code-in-city', { city: args.city });
      } else {
        throw new Error('city 与 stationName 至少填一个');
      }
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  return server;
}
