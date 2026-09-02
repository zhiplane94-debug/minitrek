"""重建样例行程数据：扬州中秋亲子游（郑州出发），3天"""
import json
import urllib.request

BASE = "http://127.0.0.1:8288/api"


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read())


# 1. 清空所有行程
trips = req("GET", "/trips")
for t in trips:
    req("DELETE", f"/trips/{t['id']}")

# 2. 新建行程
trip = req("POST", "/trips", {
    "title": "扬州中秋亲子游",
    "origin": "郑州",
    "destination": "扬州",
    "startDate": "2026-09-25",
    "endDate": "2026-09-27",
})
days = sorted(trip["days"], key=lambda d: d["dayNo"])
d1, d2, d3 = days[0]["id"], days[1]["id"], days[2]["id"]

# 3. 每天天气
for day_id, temp, desc in [(d1, 24, "晴"), (d2, 24, "多云"), (d3, 26, "晴")]:
    req("PATCH", f"/days/{day_id}", {"weatherTemp": temp, "weatherDesc": desc})

# 4. 第1天
req("POST", f"/days/{d1}/activities", {"type": "住宿", "name": "东关街商圈酒店", "bookStatus": "待预订", "cost": 350, "lat": 32.397, "lng": 119.4415})
req("POST", f"/days/{d1}/activities", {"type": "交通", "name": "高铁 郑州东→扬州东",
    "note": "郑州东→扬州东(参考08:00-12:30)→酒店入住休整→傍晚东关街+晚餐", "cost": 200, "lat": 32.391, "lng": 119.476})
req("POST", f"/days/{d1}/activities", {"type": "景点", "name": "东关街历史街区", "address": "江苏省扬州市广陵区东关街", "lat": 32.3965, "lng": 119.441})
req("POST", f"/days/{d1}/activities", {"type": "备注", "name": "第一天不安排景点，让宝宝适应节奏。"})

# 5. 第2天
req("POST", f"/days/{d2}/activities", {"type": "住宿", "name": "东关街商圈酒店", "bookStatus": "待预订", "lat": 32.397, "lng": 119.4415})
req("POST", f"/days/{d2}/activities", {"type": "景点", "name": "瘦西湖风景区", "address": "江苏省扬州市邗江区大虹桥路28号", "cost": 145, "lat": 32.3958, "lng": 119.4192})
req("POST", f"/days/{d2}/activities", {"type": "景点", "name": "大明寺(平山堂)", "address": "江苏省扬州市邗江区平山堂东路8号", "lat": 32.400, "lng": 119.4108})
req("POST", f"/days/{d2}/activities", {"type": "备注", "name": "瘦西湖日：8:00入园(摇橹船/电瓶车代步)→午餐+回酒店午休→下午大明寺。晚上早点休息。"})

# 6. 第3天
req("POST", f"/days/{d3}/activities", {"type": "住宿", "name": "东关街商圈酒店", "bookStatus": "待预订", "lat": 32.397, "lng": 119.4415})
req("POST", f"/days/{d3}/activities", {"type": "景点", "name": "何园(寄啸山庄)", "address": "江苏省扬州市广陵区徐凝门街66号", "lat": 32.386, "lng": 119.4395})
req("POST", f"/days/{d3}/activities", {"type": "交通", "name": "高铁 扬州东→郑州东", "note": "下午返程回郑州", "lat": 32.391, "lng": 119.476})
req("POST", f"/days/{d3}/activities", {"type": "备注", "name": "上午慢游何园，午后返程。"})

# 7. 打印确认
trip = req("GET", f"/trips/{trip['id']}")
for day in sorted(trip["days"], key=lambda d: d["dayNo"]):
    acts = day["activities"]
    cost = sum(a.get("cost") or 0 for a in acts)
    print(f"第{day['dayNo']}天 {day['date']} | 天气:{day.get('weatherTemp')}°{day.get('weatherDesc')} | 节点{len(acts)}个 | 费用¥{cost}")
    for a in acts:
        print(f"   [{a['type']}] {a['name']}")
print("\nSEED DONE, trip id =", trip["id"])
