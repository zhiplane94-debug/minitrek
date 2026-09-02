// 从 TripDetailView.vue 提取的 parseMd / tripToMd 逻辑，做往返一致性测试
const EXPORT_SECTIONS = ['住宿', '交通', '地点', '餐饮', '计划'];
function mdType(type) {
  const m = { 住宿: '住宿', 交通: '交通', 餐饮: '餐饮', 美食: '餐饮', 备注: '计划', 计划: '计划', 旅行计划: '计划' };
  return m[type] ?? '地点';
}
const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function fmtCn(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK_CN[d.getDay()]}`;
}
function tripToMd(t) {
  const lines = [];
  lines.push(`# ${t.title}`, '');
  lines.push(`- 出发地：${t.origin}`, `- 目的地：${t.destination}`);
  lines.push(`- 开始日期：${t.startDate}`, `- 结束日期：${t.endDate}`, '');
  for (const day of [...(t.days || [])].sort((a, b) => a.dayNo - b.dayNo)) {
    lines.push(`## 第${day.dayNo}天 · ${day.date}（${fmtCn(day.date)}）`, '');
    const w = day.weatherTemp != null || day.weatherDesc
      ? `天气：${day.weatherTemp != null ? day.weatherTemp + '°' : ''}${day.weatherDesc || ''}`
      : '天气：待查询';
    lines.push(w, '');
    for (const sec of EXPORT_SECTIONS) {
      const acts = (day.activities || []).filter((a) => mdType(a.type) === sec).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      if (!acts.length) continue;
      lines.push(`### ${sec}`, '');
      for (const a of acts) {
        const status = a.bookStatus && a.bookStatus !== '无需预订' ? `[${a.bookStatus}] ` : '';
        const cost = a.cost ? `（¥${a.cost}）` : '';
        lines.push(`- ${status}${a.name}${cost}`);
        if (a.address) lines.push(`  - 地址：${a.address}`);
        if (a.time) lines.push(`  - 时间：${a.time}`);
        if (a.note) lines.push(`  - 备注：${a.note}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
function parseMd(text) {
  const lines = text.split(/\r?\n/);
  const out = { title: '', origin: '', destination: '', startDate: '', endDate: '', days: [] };
  let curDay = null, curSec = '', curAct = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const mTitle = line.match(/^#\s+(.+)/);
    if (mTitle) { if (!out.title) out.title = mTitle[1].trim(); continue; }
    const mMeta = line.match(/^-\s*(出发地|目的地|开始日期|结束日期)\s*[：:]\s*(.*)$/);
    if (mMeta) {
      const key = mMeta[1], val = mMeta[2].trim();
      if (key === '出发地') out.origin = val;
      else if (key === '目的地') out.destination = val;
      else if (key === '开始日期') out.startDate = val;
      else if (key === '结束日期') out.endDate = val;
      continue;
    }
    const mDay = line.match(/^##\s+(.*)$/);
    if (mDay) {
      const dateM = mDay[1].match(/(\d{4}-\d{2}-\d{2})/);
      const date = dateM ? dateM[1] : '';
      curDay = { date, weatherTemp: null, weatherDesc: null, note: null, activities: [] };
      out.days.push(curDay); curSec = ''; curAct = null; continue;
    }
    const mSec = line.match(/^###\s+(.+)$/);
    if (mSec) { curSec = mdType(mSec[1].trim()); curAct = null; continue; }
    const mWeather = line.match(/^天气\s*[：:]\s*(.*)$/);
    if (mWeather && curDay) {
      const w = mWeather[1];
      const tM = w.match(/(-?\d+(?:\.\d+)?)/);
      if (tM) curDay.weatherTemp = parseFloat(tM[1]);
      curDay.weatherDesc = w.replace(tM ? tM[0] : '', '').replace(/[°\s]/g, '') || null;
      continue;
    }
    const mNote = line.match(/^(\s*)-?\s*(地址|时间|备注|说明|电话)\s*[：:]\s*(.*)$/);
    if (mNote && curAct) {
      const key = mNote[2], val = mNote[3].trim();
      if (key === '地址') curAct.address = val;
      else if (key === '时间') curAct.time = val;
      else curAct.note = val;
      continue;
    }
    const mAct = line.match(/^(\s*)-?\s+(.*)$/);
    if (mAct && line.startsWith('-') && curDay) {
      const body = mAct[2].trim();
      const stM = body.match(/^\[([^\]]+)\]\s*/);
      const bookStatus = stM ? stM[1].trim() : '待预订';
      let name = stM ? body.slice(stM[0].length) : body;
      let cost = null;
      const cM = name.match(/[（(]¥\s*([\d.]+)[）)]|¥\s*([\d.]+)/);
      if (cM) { cost = parseFloat(cM[1] || cM[2]); name = name.replace(/[（(]¥\s*[\d.]+[）)]|¥\s*[\d.]+/, '').trim(); }
      curAct = { type: curSec || '计划', name, address: null, time: null, cost, bookStatus, note: null };
      curDay.activities.push(curAct); continue;
    }
  }
  if (!out.endDate) out.endDate = out.startDate;
  out.days = out.days.filter((d) => d.date);
  return out;
}

// ============ 测试 1：样例行程 -> md -> 再解析（往返一致性） ============
const sample = {
  title: '扬州中秋亲子游', origin: '郑州', destination: '扬州',
  startDate: '2026-09-25', endDate: '2026-09-27',
  days: [
    { dayNo: 1, date: '2026-09-25', weatherTemp: 24, weatherDesc: '晴', note: null, activities: [
      { type: '住宿', name: '东关街商圈酒店', bookStatus: '待预订', cost: 350, address: '江苏省扬州市广陵区东关街', time: null, note: null, sortOrder: 0 },
      { type: '交通', name: '高铁 郑州东→扬州东', bookStatus: '待预订', cost: 200, time: '08:00-12:30', note: '郑州东→扬州东(参考08:00-12:30)', sortOrder: 1 },
      { type: '景点', name: '东关街历史街区', bookStatus: '待预订', cost: null, address: '江苏省扬州市广陵区东关街', sortOrder: 2 },
      { type: '备注', name: '第一天不安排景点，让宝宝适应节奏。', bookStatus: '待预订', cost: null, sortOrder: 3 },
    ]},
    { dayNo: 2, date: '2026-09-26', weatherTemp: 24, weatherDesc: '多云', note: null, activities: [
      { type: '住宿', name: '东关街商圈酒店', bookStatus: '待预订', cost: null, sortOrder: 0 },
      { type: '景点', name: '瘦西湖风景区', bookStatus: '待预订', cost: 145, address: '江苏省扬州市邗江区大虹桥路28号', sortOrder: 1 },
      { type: '景点', name: '大明寺(平山堂)', bookStatus: '待预订', cost: null, address: '江苏省扬州市邗江区平山堂东路8号', sortOrder: 2 },
      { type: '备注', name: '瘦西湖日：8:00入园', bookStatus: '待预订', cost: null, sortOrder: 3 },
    ]},
    { dayNo: 3, date: '2026-09-27', weatherTemp: 26, weatherDesc: '晴', note: null, activities: [
      { type: '住宿', name: '东关街商圈酒店', bookStatus: '待预订', cost: null, sortOrder: 0 },
      { type: '景点', name: '何园(寄啸山庄)', bookStatus: '待预订', cost: null, address: '江苏省扬州市广陵区徐凝门街66号', sortOrder: 1 },
      { type: '交通', name: '高铁 扬州东→郑州东', bookStatus: '待预订', cost: null, sortOrder: 2 },
    ]},
  ],
};

const md = tripToMd(sample);
console.log('=== 生成的 Markdown（前 500 字） ===');
console.log(md.slice(0, 500));
console.log('...\n');

const back = parseMd(md);
const checks = [
  ['标题', back.title === sample.title],
  ['出发地', back.origin === sample.origin],
  ['目的地', back.destination === sample.destination],
  ['开始日期', back.startDate === sample.startDate],
  ['结束日期', back.endDate === sample.endDate],
  ['天数', back.days.length === 3],
];
const totalBack = back.days.reduce((s, d) => s + d.activities.length, 0);
console.log('实际节点数:', totalBack);
for (const d of back.days) {
  console.log(`  ${d.date}: ${d.activities.map(a => `${a.type}/${a.name.slice(0,12)}`).join(' | ')}`);
}
checks.push(['节点总数', totalBack === 11]);
const d1 = back.days.find(d => d.date === '2026-09-25');
checks.push(['第1天天气', d1.weatherTemp === 24 && d1.weatherDesc === '晴']);
const firstAct = d1.activities.find(a => a.name.includes('东关街商圈酒店'));
checks.push(['住宿节点', firstAct && firstAct.type === '住宿' && firstAct.cost === 350 && firstAct.bookStatus === '待预订']);
const train = d1.activities.find(a => a.name.includes('高铁'));
checks.push(['交通节点', train && train.time === '08:00-12:30' && train.note.includes('参考')]);

let pass = true;
for (const [name, cond] of checks) {
  if (!cond) pass = false;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
}
console.log(pass ? '\n=== MD 往返测试 PASS ===' : '\n=== MD 往返测试 FAIL ===');

// ============ 测试 2：手写模板（中文冒号/半角冒号/已预订等）解析 ============
const manual = `# 苏州周末游

- 出发地: 郑州
- 目的地: 苏州
- 开始日期：2026-10-01
- 结束日期：2026-10-02

## 第1天 · 2026-10-01（周四）

天气：22°多云

### 住宿
- [已预订] 平江路客栈 ¥280

### 景点
- 拙政园
  - 地址：江苏省苏州市姑苏区东北街178号
  - 备注：提前网上订票

## 第2天 · 2026-10-02（周五）

### 计划
- 上午逛博物馆，下午返程
`;
const p2 = parseMd(manual);
console.log('\n=== 手写模板解析 ===');
console.log('标题:', p2.title, '| 出发:', p2.origin, '| 目的:', p2.destination, '| 日期:', p2.startDate, '~', p2.endDate);
console.log('天数:', p2.days.length, '| 第1天天气:', p2.days[0].weatherTemp, p2.days[0].weatherDesc);
console.log('第1天节点:', p2.days[0].activities.map(a => `${a.type}:${a.name}(${a.bookStatus})¥${a.cost}`).join(' | '));
const zzy = p2.days[0].activities.find(a => a.name === '拙政园');
console.log('拙政园地址:', zzy && zzy.address, '| 备注:', zzy && zzy.note);
const ok2 = p2.title === '苏州周末游' && p2.origin === '郑州' && p2.days.length === 2 &&
  p2.days[0].weatherTemp === 22 && p2.days[0].weatherDesc === '多云' &&
  p2.days[0].activities[0].bookStatus === '已预订' && p2.days[0].activities[0].cost === 280 &&
  zzy && zzy.address.includes('东北街') && zzy.note.includes('网上订票');
console.log(ok2 ? '=== 手写模板解析 PASS ===' : '=== 手写模板解析 FAIL ===');
process.exit(pass && ok2 ? 0 : 1);
