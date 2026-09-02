/**
 * 轻量 12306 代理客户端（MCP 转发）
 *
 * miniTrek 的 MCP Server 通过本客户端调用外部的 12306-mcp 服务
 * （https://github.com/Joooook/12306-mcp），把车票查询能力转发给 AI 客户端。
 * 只实现工具调用所需的 JSON-RPC 子集，兼容 JSON 与 SSE 两种响应。
 */
interface JsonRpcResponse {
  jsonrpc: string;
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export class TrainClient {
  private base: string;
  private initialized = false;

  constructor(base?: string) {
    this.base = base || process.env.MINITREK_12306_MCP_URL || 'http://127.0.0.1:9999/mcp';
  }

  private async rpc(method: string, params?: unknown): Promise<unknown> {
    const res = await fetch(this.base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      throw new Error(`12306-mcp HTTP ${res.status}: ${await res.text()}`);
    }
    const raw = await res.text();
    const data = this.parseResponse(raw);
    if (data.error) {
      throw new Error(`12306-mcp 错误: ${data.error.message || data.error.code}`);
    }
    return data.result;
  }

  /** 解析 JSON 或 SSE 响应 */
  private parseResponse(raw: string): JsonRpcResponse {
    const text = raw.trim();
    if (text.startsWith('{')) {
      return JSON.parse(text) as JsonRpcResponse;
    }
    // SSE：取最后一条 data:
    let last: JsonRpcResponse | null = null;
    for (const line of text.split('\n')) {
      if (line.startsWith('data:')) {
        last = JSON.parse(line.slice(5).trim()) as JsonRpcResponse;
      }
    }
    if (!last) throw new Error(`12306-mcp 响应无法解析: ${text.slice(0, 200)}`);
    return last;
  }

  /** 首次调用前完成 initialize 握手（stateless 服务） */
  private async ensureInit(): Promise<void> {
    if (this.initialized) return;
    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'miniTrek', version: '0.1.0' },
    });
    // 发送 initialized 通知（无响应 body，单独请求）
    await fetch(this.base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    }).catch(() => undefined);
    this.initialized = true;
  }

  /** 调用 12306-mcp 的工具，返回文本结果 */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.ensureInit();
    const result = (await this.rpc('tools/call', { name, arguments: args })) as {
      content?: { type: string; text?: string }[];
    };
    const content = result?.content ?? [];
    return content.map((c) => c.text ?? '').join('\n').trim();
  }

  async listTools(): Promise<string[]> {
    await this.ensureInit();
    const result = (await this.rpc('tools/list')) as { tools?: { name: string }[] };
    return (result?.tools ?? []).map((t) => t.name);
  }
}

export const trainClient = new TrainClient();
