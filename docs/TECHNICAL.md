# miniTrek · 技术方案（TECHNICAL DESIGN）

> 版本：v0.1　日期：2026-08-31　关联：`docs/PRD.md`

---

## 1. 技术栈选型

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | **Vue 3 + Vite + Pinia + Vue Router** | 国内生态成熟、上手快、三栏布局组件化开发高效 |
| 后端 | **Node.js + TypeScript + Fastify** | 与前端同语言同类型，单仓库心智负担低；Fastify 轻量高性能 |
| 数据访问 | **better-sqlite3 + Drizzle ORM** | 同步 API 简单；ORM 抽象为未来迁 Postgres 留口子 |
| MCP | **@modelcontextprotocol/sdk (TypeScript)** | 官方 SDK，支持 Streamable HTTP 远程 transport |
| 地图 | **高德地图 JS API 2.0**（前端）+ **Web 服务 API**（POI/天气/地理编码） | 国内地图首选，家庭/旅游场景数据全 |
| 车次数据 | **12306 公开查询接口**（自封装服务） | 覆盖车次/时刻/票价，免第三方费用 |
| 部署 | **Docker 单容器**（Node 进程托管前端静态资源 + API + MCP） | 飞牛 NAS 上最小化运维，一个容器搞定 |

> 说明：全栈 TypeScript、单仓库、单容器，SQLite 数据文件挂 NAS 存储卷，备份=复制 `.db` 文件。

---

## 2. 整体架构

```
┌──────────────────────── 用户环境 ────────────────────────┐
│  你的 AI 客户端（豆包/Claude/Cursor，配置 MCP Server + Token）│
│        │ MCP (Streamable HTTP, Authorization: Bearer)     │
│        ▼                                                  │
│  ┌─────────────────────────────┐                          │
│  │  miniTrek 单体（Docker 容器）│                          │
│  │  ┌───────────────────────┐  │   ┌───────────────────┐  │
│  │  │ MCP Server (/mcp)     │  │   │ REST API (/api)    │  │
│  │  │  ·行程 CRUD            │  │   │ ·行程/节点/车次/费用│  │
│  │  │  ·车次/天气/POI/清单    │  │   │ ·分享链接          │  │
│  │  └──────────┬────────────┘  │   └─────────┬─────────┘  │
│  │             └──── 业务层 ────┘             │            │
│  │  ┌────────────────────────────────────────┐│            │
│  │  │  Drizzle ORM → SQLite (data/minitrek.db)│            │
│  │  └────────────────────────────────────────┘            │
│  │  前端静态资源（Vue 构建产物，由 Node 托管）               │
│  └─────────────────────────────────────────────┘           │
│        ▲  Web 浏览器（家人通过只读链接 /share/:token）      │
└────────────────────────────────────────────────────────────┘
```

- 三条访问通道：**浏览器（Web 手动编辑 + 查看）**、**AI 客户端（MCP 写入）**、**家人（只读链接）**。
- MCP 与 REST 共用同一业务层与数据库，保证数据一致。

---

## 3. 数据模型（SQLite Schema）

```
trips                    行程项目
  id            TEXT PK (uuid)
  title         TEXT        标题，如"扬州中秋亲子游"
  origin        TEXT        出发地
  destination   TEXT        目的地
  start_date    TEXT        YYYY-MM-DD
  end_date      TEXT        YYYY-MM-DD
  status        TEXT        规划中/已发布
  share_token   TEXT NULL   只读分享 token（唯一）
  created_at / updated_at

family_members            家庭成员（每个行程一份画像）
  id            TEXT PK
  trip_id       TEXT FK→trips
  name          TEXT
  role          TEXT        成人/儿童/婴儿/老人
  birth_year    INTEGER NULL
  note          TEXT        如"需午休""推车""忌口"

trip_days                 行程天数
  id            TEXT PK
  trip_id       TEXT FK→trips
  day_no        INTEGER     第 N 天
  date          TEXT        YYYY-MM-DD
  note          TEXT NULL
  weather_temp  REAL NULL   天气（℃，可自动查询回填）
  weather_desc  TEXT NULL   天气描述（晴/多云…）

activities                行程节点（住宿/景点/交通/餐饮/备注 统一一张表）
  id            TEXT PK
  day_id        TEXT FK→trip_days
  type          TEXT        住宿/景点/交通/餐饮/备注
  name          TEXT
  address       TEXT NULL
  lat / lng     REAL NULL   地图标注用
  time          TEXT NULL   如"08:00" / "09:02~14:10"
  cost          REAL NULL   费用（元）
  book_status   TEXT        待预订/已预订/无需预订
  note          TEXT NULL
  sort_order    INTEGER     同天内排序
  ref_type      TEXT NULL   交通引用：train
  ref_id        TEXT NULL   车次号（如 G2614）

settings                  键值设置
  key           TEXT PK     amap_key / amap_web_key
  value         TEXT
  updated_at    TEXT

checklist_items           出行清单
  id            TEXT PK
  trip_id       TEXT FK→trips
  name          TEXT
  done          INTEGER     0/1
  sort_order    INTEGER

mcp_tokens                 MCP API Token（单用户场景可仅一条）
  id            TEXT PK
  token_hash    TEXT        存哈希，不存明文
  label         TEXT
  created_at
```

关键设计点：
- **activity 用一张表**承载所有节点类型，类型用 `type` 字段区分，避免过度拆分。
- 车次信息以**快照 JSON** 存在 `ref_id`，避免每次读行程都实时查 12306。
- Token 存 **哈希**，不存明文。

---

## 4. 后端 REST API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/auth/login | 登录（管理员密码），返回会话 Token |
| POST | /api/auth/logout | 登出，使当前会话失效 |
| GET | /api/auth/me | 当前登录态（authed / passwordConfigured） |
| POST | /api/auth/change-password | 修改登录密码（需原密码，新密码≥6 位） |
| GET/POST | /api/trips | 行程列表 / 新建行程 |
| POST | /api/trips/import | 批量导入行程（Markdown 导入走此接口，一次事务创建行程+天数+节点；显式天数优先，否则按日期范围生成空天） |
| GET/PATCH/DELETE | /api/trips/:id | 详情（含 days/activities）/ 更新 / 删除 |
| POST | /api/days/:dayId/activities | 添加节点 |
| PATCH | /api/days/:id | 更新天气/备注 |
| PATCH | /api/activities/:id | 编辑节点 |
| DELETE | /api/activities/:id | 删除节点 |
| POST | /api/activities/:id/move | 排序/移动（拖拽） |
| GET | /api/weather?city=&date= | 天气查询（Open-Meteo，城市表内置坐标） |
| GET | /api/train/query?date=&from=&to=&type= | 12306 车次/余票/票价（代理 12306-mcp） |
| GET | /api/train/stations?city= | 车站代码 |
| GET | /api/poi/search?keywords=&city= | POI 搜索（高德 Web 服务） |
| GET | /api/geocode?address=&city= | 地址→经纬度（高德 Web 服务） |
| GET/PUT | /api/settings | 读取/保存设置（amapKey / amapWebKey） |
| GET/POST | /api/mcp/token | 查询 MCP Token 状态 / 生成新 Token（`mtk_` 前缀，仅存哈希，明文只返回一次） |
| POST | /api/trips/:id/share | 生成分享链接 |
| GET | /api/share/:token | 只读分享数据（无需登录） |

Web 编辑操作（手动规划）走 REST；AI 规划走 MCP（二者业务层复用）。

### 4.1 行程导入 / 导出（Markdown）
- **导出**：详情页「导出」将行程渲染为标准 Markdown（`.md` 下载）。结构：
  ```
  # 行程标题
  - 出发地：郑州
  - 目的地：扬州
  - 开始日期：2026-09-25
  - 结束日期：2026-09-27

  ## 第1天 · 2026-09-25（9月25日 周五）
  天气：24°晴
  ### 住宿
  - [待预订] 东关街商圈酒店（¥350）
    - 地址：江苏省扬州市广陵区东关街
  ### 交通
  - [待预订] 高铁 郑州东→扬州东（¥200）
    - 时间：08:00-12:30
  ### 地点
  - [待预订] 东关街历史街区
  ### 计划
  - [待预订] 第一天不安排景点，让宝宝适应节奏。
  ```
- **导入**：详情页「导入」弹窗支持**粘贴 / 上传 .md / 填入格式模板**，前端解析后展示可导入摘要（标题/天数/节点数），确认后调用 `POST /api/trips/import` **新建**行程并跳转。
- **解析规则**（前后端一致的格式契约）：
  - `#` 标题；`- 出发地/目的地/开始日期/结束日期：` 元信息（中文/半角冒号均可）；
  - `##` 天行（自动提取其中的 `YYYY-MM-DD`）；`天气：N°描述` 回填天气；
  - `###` 分区名映射节点类型：住宿/交通/地点/餐饮/计划；
  - `- [状态] 名称（¥费用）` 节点行，`[已预订/待预订]` 与 `（¥350）` 可选；缩进的 `- 地址/时间/备注：` 作为节点子属性；
  - 无 `[状态]` 默认 `待预订`；费用可用 `（¥350）` 或 `¥350` 两种写法。
- **往返一致性**：已用自动化测试（`server/test_md_roundtrip.js`）验证"导出→再导入"字段无损（标题/日期/天气/类型/费用/预订状态/地址/时间/备注），并在浏览器端到端验证导入后 3 天 12 节点数据完整。

---

## 5. MCP Server 设计

### 5.1 Transport 与认证
- **Transport**：Streamable HTTP，端点 `/mcp`（支持远程 AI 客户端访问）。
- **认证**：`Authorization: Bearer <api-token>`，token 支持两种来源，任一匹配即放行：
  1. **页面/接口生成**：`POST /api/mcp/token` 生成 `mtk_` 前缀随机 token，sha256 哈希存 `mcp_tokens` 表，明文仅生成时返回一次；前端在首页「AI 规划」弹窗与设置页提供「生成新 Token」入口；
  2. **环境变量**：部署时设 `MINITREK_MCP_TOKEN`。
- Token 校验先比对环境变量，再查 `mcp_tokens` 表哈希，避免泄露明文。

### 5.2 工具清单（AI 可用能力，当前 13 个）

| 工具 | 参数（核心） | 说明 |
|---|---|---|
| `create_trip` | title, origin, destination, startDate, endDate | 创建行程项目 |
| `list_trips` | — | 列出所有行程 |
| `get_trip` | tripId | 获取完整行程结构 |
| `update_trip` | tripId, title?, origin?, ... | 更新行程信息 |
| `add_day` | tripId, date, dayNo | 增加一天 |
| `add_activity` | dayId, type, name, address?, time?, cost?, note? | 增加行程节点 |
| `update_activity` | activityId, ... | 编辑节点 |
| `delete_activity` | activityId | 删除节点 |
| `move_activity` | activityId, dayId?, position | 排序/移动（跨天） |
| `add_checklist_item` | tripId, name | 写入出行清单 |
| `get_trip_summary` | tripId | 行程汇总（天数/费用/节点数） |
| `query_train` | date, fromStation, toStation, trainType?, earliestStartTime?, latestStartTime?, limitedNum? | 查 12306 车次/余票/票价（代理 12306-mcp） |
| `search_station` | city 或 stationNames | 查 12306 车站代码（代理 12306-mcp） |

### 5.3 工具响应规范
- 统一返回结构化 JSON（车次含车次号/出发/到达/历时/席别票价）。
- 所有写入立即落库，AI 下次 `get_trip` 可读回，形成"规划—校验—修正"闭环。

---

## 6. 数据源方案

### 6.1 12306 车次数据（代理 12306-mcp 服务）
- 复用开源 [Joooook/12306-mcp](https://github.com/Joooook/12306-mcp)（MIT），已实测可查询真实余票/票价。
- 集成方式：miniTrek 后端作为 MCP 客户端，通过 `MINITREK_12306_MCP_URL` 代理调用 12306-mcp 的 `get-tickets` / `get-station-code-by-names` 等工具，注册为 `query_train` / `search_station` 两个 MCP 工具，对 AI 客户端透明。
- 部署：docker-compose 内置 `12306-mcp` 服务（仅绑定回环地址，不对外暴露），本机开发时独立进程跑 9999 端口。
- 风险声明：12306 未正式开放第三方 API，存在接口变动/风控风险；本项目定位"查不订"，正好规避交易侧合规风险。若接口失效，可切换第三方聚合 API 或降级为"仅展示时刻表"。

### 6.2 高德地图与地点数据
- 申请高德开放平台开发者账号，获取 **Web 端（JS API）Key** + **Web 服务 Key**（两个 key，可在设置页或环境变量 `AMAP_KEY` / `AMAP_WEB_KEY` 配置）。
- 前端：JS API 2.0 渲染地图、Marker 标注点位，`day` 联动切换当前日期点位，视野自适应。
- 后端：Web 服务 API 提供 POI 搜索（`/api/poi/search`）与地理编码（`/api/geocode`）。前端 AMap.PlaceSearch 因用户 key 平台限制改用后端代理。

### 6.3 天气（Open-Meteo，免费无 Key）
- 数据源 [Open-Meteo](https://open-meteo.com/) 免费 API，按经纬度返回未来 16 天逐日预报（最高温 + WMO 天气码）。
- 内置中国主要城市坐标表（`src/lib/cities.ts`）完成"城市名 → 坐标"；超出 16 天预报范围时返回 `available:false` 并提示"出行临近再查"。
- 前端进入行程详情自动按目的地城市+各天日期回填天气（已手工填写的保留），天气弹窗可"自动查询/手工编辑"。
- 注：本机 Node 默认 IPv6 优先导致请求超时，已统一改用 `https` 模块 + `family:4` 强制 IPv4。

---

## 7. 认证与安全

| 面 | 方案 |
|---|---|
| Web 管理端 | 登录页 + 会话 Token。登录校验：数据库 `settings.admin_password_hash`（scrypt 加盐哈希）优先，未设置时用环境变量 `MINITREK_ADMIN_PASSWORD`（默认 `changeme`）。登录签发随机 32 字节 Token，sha256 哈希存 `sessions` 表（30 天有效），前端 localStorage 保存，REST 请求带 `Authorization: Bearer <token>`。除 `/api/health`、`/api/auth/login`、`/api/share/:token` 外 `/api/*` 全部需登录。忘记密码可用重置脚本（见 8.3） |
| MCP 端 | API Token，Bearer 认证；Token 由页面生成（`mtk_` 前缀）或环境变量 `MINITREK_MCP_TOKEN` 配置，库中仅存 sha256 哈希；**与 Web 登录互不影响** |
| 分享链接 | `/share/:token` 随机 token 只读，无登录，可撤销 |
| 网络安全 | 依赖 NAS 部署环境；如需公网访问建议套 HTTPS 反向代理 |
| 数据 | SQLite 文件落本地卷；备份即复制文件 |

---

## 8. 部署方案（飞牛 NAS）

### 8.1 目录结构（仓库内）
```
minitrek/
├─ server/          Node 后端（Fastify + MCP + 数据层）
├─ web/             Vue 3 前端
├─ docker/
│  └─ Dockerfile    多阶段构建（build web → copy 静态 → 跑 server）
├─ docker-compose.yml
├─ data/            SQLite 数据目录（卷挂载，勿提交）
└─ docs/            PRD.md / TECHNICAL.md
```

### 8.2 docker-compose.yml（示意）
```yaml
services:
  minitrek:
    build: .
    container_name: minitrek
    ports:
      - "8288:8288"
    environment:
      - PORT=8288
      - MINITREK_ADMIN_PASSWORD=changeme   # Web 登录初始密码（修改后写入数据库，不再读此值）
      - MINITREK_MCP_TOKEN=changeme
      - AMAP_KEY=your_amap_js_key        # 可选，也可进设置页填
      - AMAP_WEB_KEY=your_amap_web_key   # 可选，POI 搜索/定位
      - MINITREK_12306_MCP_URL=http://12306-mcp:8080/mcp
      - DATA_DIR=/app/data               # 数据库目录，与挂载卷对齐
    volumes:
      - ./data:/app/data        # SQLite 持久化
    restart: unless-stopped
  # 12306 车次代理服务（仅回环，不对外暴露）
  12306-mcp:
    image: node:20-alpine
    command: ["sh", "-c", "npx -y 12306-mcp --port 8080"]
    ports:
      - "127.0.0.1:9999:8080"
    restart: unless-stopped
```

### 8.3 部署步骤（飞牛 NAS）
1. 仓库上传到 NAS（或 NAS 上 git clone）。
2. SSH 到 NAS（或用飞牛应用中心/Docker 面板）执行 `docker compose up -d --build`。
3. 浏览器访问 `http://<NAS-IP>:8288`，用 `MINITREK_ADMIN_PASSWORD` 登录（默认 `changeme`，建议登录后在「设置 → 账号与安全」改掉）。
4. **忘记 Web 登录密码（恢复密码）**：在 NAS 上执行
   ```bash
   docker exec -it minitrek node --import tsx src/scripts/reset-password.ts
   ```
   不传参数生成随机新密码并打印；也可 `... reset-password.ts 新密码` 指定（≥6 位）。重置后写入数据库，所有旧登录会话失效。
5. **MCP 远程访问**：飞牛 NAS 若无公网 IP，通过以下任一方式暴露 `/mcp` 端点：
   - 飞牛自带远程访问功能（若支持端口转发）；
   - 内网穿透（frp / Tailscale / ZeroTier）将 NAS 8288 端口映射到可访问地址；
   - 域名 + DDNS + 反向代理（推荐套 HTTPS）。
6. 在 AI 客户端配置 MCP Server：`http://<可达地址>:8288/mcp`，Header 填 `Authorization: Bearer <Token>`。Token 可：
   - 在 Web 首页「AI 规划」弹窗或设置页「MCP API Token」点击「生成新 Token」自动获取（复制保存），并按所选客户端一键导出配置 JSON；弹窗填地址时会自动补全默认端口 8288（自填端口或 HTTPS 反代则保留）；
   - 或使用部署时设置的 `MINITREK_MCP_TOKEN`。

---

## 9. 开发里程碑

| 阶段 | 内容 | 产出 | 状态 |
|---|---|---|---|
| M1 骨架 | 仓库初始化、前后端脚手架、Docker、SQLite 建表 | 可空跑的服务 + 空页面 | ✅ |
| M2 数据层+API | Drizzle schema、REST API、手动规划接口 | API 可用（curl 验证） | ✅ |
| M3 前端核心 | 首页列表、行程详情三栏、时间线编辑、地图联动 | 手动规划闭环 | ✅ |
| M4 MCP Server | 工具集 + Token 认证 + AI 端联调 | AI 可建行程写入 | ✅ |
| M5 数据源 | 12306 车次、天气自动查询、高德 POI/定位 | 交通/天气/地点查询可用 | ✅ |
| M6 分享+费用+设置 | 只读链接、费用汇总、设置页 | MVP 完整 | ✅ |
| M6.5 导入导出 | Markdown 导出/导入（新建行程）+ 往返测试 | 数据可迁移 | ✅ |
| M7 部署上线 | NAS 部署、MCP 远程联调、备份方案 | 可日常使用 | ✅（飞牛 NAS 实测通过） |
| M7.5 登录认证 | 登录页 + 会话 Token + REST 鉴权；设置页修改/恢复密码；重置脚本 | Web 访问受保护 | ✅ |

---

## 10. 待办/风险清单

- [ ] 高德 **Web 服务 Key** 申请并在设置页/环境变量配置（地点搜索与地址定位当前依赖它；JS Key 仅用于地图）。
- [ ] MCP 远程访问经 DDNS 暴露后的 HTTPS 反向代理配置。
