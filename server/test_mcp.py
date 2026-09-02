"""miniTrek MCP Server 完整测试（含 12306 车票查询）"""
import json
import urllib.request

BASE = 'http://127.0.0.1:8288/mcp'
TOKEN = 'test-token-123'


def post(body, session_id=None, token=True):
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
    }
    if token:
        headers['Authorization'] = f'Bearer {TOKEN}'
    if session_id:
        headers['mcp-session-id'] = session_id
    r = urllib.request.Request(BASE, data=json.dumps(body).encode(), method='POST', headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            sid = resp.headers.get('mcp-session-id')
            raw = resp.read()
            data = json.loads(raw) if raw else {}
            return resp.status, sid, data
    except urllib.error.HTTPError as e:
        return e.code, None, json.loads(e.read() or b'{}')


# initialize
s, sid, b = post({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize',
                  'params': {'protocolVersion': '2024-11-05', 'capabilities': {},
                             'clientInfo': {'name': 'test', 'version': '1.0'}}})
assert s == 200 and sid, 'initialize 失败'
post({'jsonrpc': '2.0', 'method': 'notifications/initialized'}, sid)

# tools/list
s, _, b = post({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'}, sid)
tools = [t['name'] for t in b['result']['tools']]
print('[工具]', len(tools), tools)

# search_station 上海
s, _, b = post({'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call',
                'params': {'name': 'search_station', 'arguments': {'city': '上海'}}}, sid)
print('[search_station 上海]')
print(b['result']['content'][0]['text'][:200])

# query_train 郑州 -> 扬州
s, _, b = post({'jsonrpc': '2.0', 'id': 4, 'method': 'tools/call',
                'params': {'name': 'query_train', 'arguments': {
                    'date': '2026-09-02', 'from': '郑州', 'to': '扬州',
                    'trainType': 'G', 'limitedNum': 3}}}, sid)
text = b['result']['content'][0]['text']
print('[query_train 郑州→扬州 G车次 前3趟]')
print(text)

print('\nMINITREK MCP TEST PASS')
