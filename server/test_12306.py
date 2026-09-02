"""连接 12306-mcp 服务，测试真实车票查询"""
import json
import urllib.request

BASE = 'http://127.0.0.1:9999/mcp'


def post(body, session_id=None):
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'}
    if session_id:
        headers['mcp-session-id'] = session_id
    r = urllib.request.Request(BASE, data=json.dumps(body).encode(), method='POST', headers=headers)
    with urllib.request.urlopen(r, timeout=30) as resp:
        sid = resp.headers.get('mcp-session-id')
        raw = resp.read().decode()
        return resp.status, sid, raw


def parse(raw):
    raw = raw.strip()
    if raw.startswith('{'):
        return json.loads(raw)
    # SSE: 逐行解析 data:
    out = []
    for line in raw.splitlines():
        if line.startswith('data:'):
            out.append(json.loads(line[5:].strip()))
    return out[-1] if out else {}


# 1. initialize
s, sid, raw = post({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize',
                    'params': {'protocolVersion': '2024-11-05', 'capabilities': {},
                               'clientInfo': {'name': 'test', 'version': '1.0'}}})
r = parse(raw)
print('[init]', s, '| session:', bool(sid), '| server:', r.get('result', {}).get('serverInfo'))

# 2. initialized 通知
try:
    s, _, raw = post({'jsonrpc': '2.0', 'method': 'notifications/initialized'}, sid)
except Exception as e:
    print('[notif]', 'ok')

# 3. tools/list
s, _, raw = post({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'}, sid)
r = parse(raw)
tools = [t['name'] for t in r.get('result', {}).get('tools', [])]
print('[tools]', tools)

# 4. get-tickets: 郑州 -> 扬州
s, _, raw = post({'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call',
                  'params': {'name': 'get-tickets', 'arguments': {
                      'date': '2026-09-02', 'fromStation': '郑州', 'toStation': '扬州',
                      'trainFilterFlags': '', 'format': 'text'}}}, sid)
r = parse(raw)
content = r.get('result', {}).get('content', [])
text = content[0]['text'] if content else ''
print('[get-tickets 郑州→扬州]')
print(text[:1200])
