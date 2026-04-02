/**
 * AgentService - AI 对话服务
 * 支持流式 SSE、函数调用、上下文管理
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as si from 'systeminformation';
import * as https from 'https';
import { URL } from 'url';
import { IService, IServiceResponse, ServiceInfo } from '../../shared/interfaces/service.interface';
import { logger } from '../utils/Logger';

const execAsync = promisify(exec);

// ========== 类型定义 ==========

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AgentConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  personaPrompt: string;
  systemPrompt: string;
  enableToolCalls: boolean;
  enableShellExecution: boolean;
}

const DEFAULT_CONFIG: AgentConfig = {
  apiKey: '',
  baseUrl: 'https://api.minimaxi.com/v1',
  model: 'MiniMax-M2.5',
  personaPrompt: '你是猫羽雫，一个可爱活泼的 AI 电脑管家。你能用温柔的语气回答用户的问题，帮助管理Windows系统。',
  systemPrompt: '你可以帮助用户执行系统管理任务，包括查看进程、管理端口、读取文件、执行命令等。',
  enableToolCalls: true,
  enableShellExecution: false,
};

class AgentService implements IService {
  readonly name = 'AgentService';
  readonly version = '1.0.0';

  private config: AgentConfig;
  private conversationHistory: ChatMessage[] = [];
  private totalTokens = 0;
  private readonly maxTokens = 80000;

  // 事件回调（通过 IPC 转发到渲染进程）
  private onStreaming?: (text: string) => void;
  private onComplete?: () => void;
  private onError?: (err: string) => void;
  private onToolCallStart?: (toolName: string) => void;
  private onToolCallComplete?: () => void;

  // 高危命令检测
  private readonly highRiskPatterns = [
    /rm\s+-rf/, /del\s+\/[fq]/, /format/i, /diskpart/i,
    /shutdown/i, /restart/i, /stop-computer/i,
    /remove-item\s+-recurse/i, /rmdir/i,
    /net\s+user/i, /net\s+localgroup/i,
    /powershell.*-enc/i, /invoke-expression/i,
    /set-executionpolicy/i, /new-service/i,
  ];

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  // ========== IService 实现 ==========

  async getInfo(): Promise<IServiceResponse<ServiceInfo>> {
    return {
      success: true,
      data: {
        name: this.name,
        version: this.version,
        capabilities: ['chat', 'setConfig', 'clearHistory', 'getHistory'],
        status: 'running',
      },
      requestId: '',
    };
  }

  async execute<T = unknown>(action: string, params?: T): Promise<IServiceResponse> {
    try {
      switch (action) {
        case 'chat':
          return this.wrapResponse(await this.chat(params as { message: string }));
        case 'setConfig':
          return this.wrapResponse(this.setConfig(params as Partial<AgentConfig>));
        case 'clearHistory':
          return this.wrapResponse(this.clearHistory());
        case 'getHistory':
          return this.wrapResponse(this.getHistory());
        case 'testConnection':
          return await this.testConnection(params as Partial<AgentConfig>);
        case 'setCallbacks':
          this.setCallbacks(params as Record<string, string>);
          return { success: true, data: {}, requestId: '' };
        default:
          return { success: false, error: { code: 'A0001', message: `Unknown action: ${action}` }, requestId: '' };
      }
    } catch (error) {
      logger.error(`[AgentService] execute ${action} failed`, error as Error);
      return { success: false, error: { code: 'A0002', message: (error as Error).message }, requestId: '' };
    }
  }

  // ========== 配置 ==========

  setConfig(partial: Partial<AgentConfig>): AgentConfig {
    this.config = { ...this.config, ...partial };
    logger.info(`[AgentService] config updated: model=${this.config.model}, toolCalls=${this.config.enableToolCalls}`);
    return { ...this.config };
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  // ========== 连接测试 ==========

  async testConnection(config: Partial<AgentConfig> = {}): Promise<IServiceResponse<{ success: boolean; message: string }>> {
    const testConfig = { ...this.config, ...config };
    const { apiKey, baseUrl, model } = testConfig;

    if (!apiKey) {
      return { success: false, error: { code: 'A0003', message: 'API Key 不能为空' }, requestId: '' };
    }
    if (!baseUrl) {
      return { success: false, error: { code: 'A0003', message: 'Base URL 不能为空' }, requestId: '' };
    }
    if (!model) {
      return { success: false, error: { code: 'A0003', message: '模型名称不能为空' }, requestId: '' };
    }

    // MiniMax API 使用 Bearer token 和正确的 endpoint
    const endpoint = '/chat/completions';
    const postData = JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Hi' }],
    });

    return new Promise((resolve) => {
      try {
        const parsedUrl = new URL(baseUrl);
        const fullPath = parsedUrl.pathname === '/' ? endpoint : `${parsedUrl.pathname}${endpoint}`;
        const options = {
          hostname: parsedUrl.hostname,
          path: fullPath,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'MM-API-Source': 'Minimax-MCP',
            'Content-Length': Buffer.byteLength(postData).toString(),
          },
          timeout: 10000,
        };

        const req = https.request(options, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString();
            if (res.statusCode === 200) {
              resolve({ success: true, data: { success: true, message: `连接成功 (${res.statusCode})` }, requestId: '' });
            } else {
              let errMsg = `HTTP ${res.statusCode}`;
              try {
                const obj = JSON.parse(raw);
                errMsg = obj.base_error?.message || obj.error?.message || errMsg;
              } catch { /* ignore */ }
              resolve({ success: false, error: { code: 'A0004', message: errMsg }, requestId: '' });
            }
          });
        });

        req.on('error', (e) => {
          resolve({ success: false, error: { code: 'A0004', message: `网络错误: ${e.message}` }, requestId: '' });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ success: false, error: { code: 'A0004', message: '连接超时' }, requestId: '' });
        });

        req.write(postData);
        req.end();
      } catch (e) {
        resolve({ success: false, error: { code: 'A0004', message: `请求失败: ${(e as Error).message}` }, requestId: '' });
      }
    });
  }

  // ========== 对话 ==========

  async chat(params: { message: string }): Promise<{ response: string; done: boolean }> {
    if (!this.config.apiKey) {
      throw new Error('请先配置 API Key');
    }

    const userMessage = params.message;

    // 添加用户消息
    this.conversationHistory.push({ role: 'user', content: userMessage });

    try {
      const tools = this.config.enableToolCalls ? this.getToolDefinitions() : undefined;
      const messages = this.buildMessages();

      const response = await this.sendStreamingRequest(messages, tools);

      // 添加助手消息
      this.conversationHistory.push({ role: 'assistant', content: response });

      // Token 估算
      this.updateTokenCount();

      // 检查是否需要清空
      if (this.totalTokens >= this.maxTokens) {
        logger.info('[AgentService] Token 超限，清空历史');
        this.conversationHistory = [];
        this.totalTokens = 0;
      }

      return { response, done: true };
    } catch (error) {
      // 移除失败的用户消息
      this.conversationHistory.pop();
      throw error;
    }
  }

  private async sendStreamingRequest(
    messages: ChatMessage[],
    tools?: unknown[]
  ): Promise<string> {
    // MiniMax API endpoint
    const endpoint = '/chat/completions';

    const requestBody = {
      model: this.config.model,
      max_tokens: 1024,
      temperature: 0.8,
      stream: true,
      messages: messages.map(m => {
        const msg: Record<string, unknown> = { role: m.role, content: m.content };
        // MiniMax API 需要 snake_case
        if (m.role === 'tool' && m.toolCallId) {
          msg['tool_call_id'] = m.toolCallId;
        }
        if (m.toolCalls) {
          msg['tool_calls'] = m.toolCalls;
        }
        return msg;
      }),
      ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
    };

    const postData = JSON.stringify(requestBody);

    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'MM-API-Source': 'Minimax-MCP',
        'Content-Length': Buffer.byteLength(postData).toString(),
      };

      const parsedUrl = new URL(this.config.baseUrl);
      const fullPath = parsedUrl.pathname === '/' ? endpoint : `${parsedUrl.pathname}${endpoint}`;
      const options = {
        hostname: parsedUrl.hostname,
        path: fullPath,
        method: 'POST',
        headers,
      };

      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => chunks.push(chunk));

        res.on('end', async () => {
          const raw = Buffer.concat(chunks).toString();

          // SSE 流式解析
          const lines = raw.split('\n');
          let fullText = '';
          let hasToolCall = false;
          const toolCallBuffers: Map<string, { name: string; args: string }> = new Map();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              const obj = JSON.parse(data);
              const choice = obj?.choices?.[0];
              if (!choice) continue;

              const delta = choice.delta || choice.message || {};
              const content = delta.content || delta.text || '';
              if (content) {
                fullText += content;
                this.onStreaming?.(content);
              }

              // 工具调用（MiniMax 可能用不同格式）
              const toolCalls = delta.tool_calls || [];
              for (const tc of toolCalls) {
                const fn = tc.function || tc;
                if (!fn) continue;
                const name = fn.name || '';
                const args = fn.arguments || '';

                if (name) {
                  if (!toolCallBuffers.has(tc.id || name)) {
                    toolCallBuffers.set(tc.id || name, { name, args: '' });
                  }
                  const existing = toolCallBuffers.get(tc.id || name)!;
                  existing.args += args;
                }
              }
            } catch {
              // 忽略解析错误
            }
          }

          // 如果有工具调用，执行它们
          if (toolCallBuffers.size > 0 && this.config.enableToolCalls) {
            hasToolCall = true;
            const toolResults: string[] = [];

            for (const [id, fn] of toolCallBuffers) {
              if (!fn.name) continue;
              logger.info(`[AgentService] 执行工具: ${fn.name}`);
              this.onToolCallStart?.(fn.name);
              try {
                const result = await this.executeTool(fn.name, fn.args);
                toolResults.push(result);
                this.onToolCallComplete?.();
              } catch (e) {
                const errMsg = (e as Error).message;
                toolResults.push(`错误: ${errMsg}`);
                this.onToolCallComplete?.();
              }
            }

            // 继续请求（带工具结果）
            this.conversationHistory.push({ role: 'assistant', content: fullText });
            for (let i = 0; i < toolCallBuffers.size; i++) {
              const [id, fn] = Array.from(toolCallBuffers.entries())[i];
              this.conversationHistory.push({
                role: 'tool',
                toolCallId: id,
                content: toolResults[i] || '',
              });
            }

            // 递归继续（避免无限循环，最多 2 层）
            const nested = await this.sendStreamingRequest(this.buildMessages(), tools);
            fullText += nested;
          }

          resolve(fullText);
          this.onComplete?.();
        });
      });

      req.on('error', (e) => {
        reject(new Error(`网络错误: ${e.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  // ========== 工具定义 ==========

  private getToolDefinitions(): unknown[] {
    return [
      {
        type: 'function',
        function: {
          name: 'list_processes',
          description: '列出当前运行的进程列表，支持按内存或名称排序',
          parameters: {
            type: 'object',
            properties: {
              sort_by: {
                type: 'string',
                enum: ['memory', 'name', 'pid'],
                description: '排序方式：memory（内存）、name（名称）、pid（PID）',
              },
              limit: {
                type: 'number',
                description: '最多返回多少条，默认为 20',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_system_info',
          description: '获取系统信息，包括 CPU、内存、GPU、操作系统等',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_ports',
          description: '列出当前占用端口的进程列表',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'execute_command',
          description: '在 Windows 上执行 PowerShell 或 CMD 命令（高危操作需用户确认）',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: '要执行的命令，例如：Get-Process、dir、ipconfig',
              },
              shell: {
                type: 'string',
                enum: ['powershell', 'cmd'],
                description: '使用哪个 shell 执行，默认 powershell',
              },
            },
            required: ['command'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_env_vars',
          description: '获取环境变量，支持 user（用户变量）或 system（系统变量）',
          parameters: {
            type: 'object',
            properties: {
              scope: {
                type: 'string',
                enum: ['user', 'system'],
                description: '环境变量范围',
              },
            },
            required: ['scope'],
          },
        },
      },
    ];
  }

  // ========== 工具执行 ==========

  private async executeTool(name: string, args: string): Promise<string> {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = JSON.parse(args || '{}');
    } catch {
      return '参数解析失败';
    }

    switch (name) {
      case 'list_processes': {
        const { stdout } = await execAsync('tasklist /FO CSV /NH', { encoding: 'utf8', timeout: 8000 });
        const lines = stdout.trim().split('\n');
        const sortBy = (parsedArgs.sort_by as string) || 'memory';
        const limit = (parsedArgs.limit as number) || 20;

        const processes = lines.map(line => {
          const parts = line.split('","').map(p => p.replace(/"/g, ''));
          if (parts.length < 5) return null;
          return {
            name: parts[0],
            pid: parseInt(parts[1], 10),
            memory: parseInt(parts[4].replace(/[^0-9]/g, ''), 10),
          };
        }).filter(Boolean) as { name: string; pid: number; memory: number }[];

        if (sortBy === 'memory') processes.sort((a, b) => b.memory - a.memory);
        else if (sortBy === 'name') processes.sort((a, b) => a.name.localeCompare(b.name));
        else processes.sort((a, b) => a.pid - b.pid);

        return '进程列表：\n' + processes.slice(0, limit)
          .map(p => `${p.name.padEnd(30)} PID: ${p.pid.toString().padStart(6)}  内存: ${(p.memory / 1024).toFixed(1)} MB`)
          .join('\n');
      }

      case 'get_system_info': {
        const [cpu, mem, gpus, os] = await Promise.all([
          si.cpu(),
          si.mem(),
          si.graphics().catch(() => ({ controllers: [] })),
          si.osInfo(),
        ]);

        const gpuInfo = gpus.controllers?.[0];
        const memUsed = (mem.used / 1024 / 1024 / 1024).toFixed(1);
        const memTotal = (mem.total / 1024 / 1024 / 1024).toFixed(1);

        return [
          `操作系统: ${os.distro} ${os.release}`,
          `CPU: ${cpu.brand} (${cpu.cores} 核)`,
          `内存: ${memUsed} GB / ${memTotal} GB`,
          gpuInfo?.memoryTotal ? `GPU: ${gpuInfo.model} (${(gpuInfo.memoryTotal / 1024 / 1024 / 1024).toFixed(0)} GB)` : 'GPU: 无',
        ].join('\n');
      }

      case 'list_ports': {
        const [netstatOut, tasklistOut] = await Promise.all([
          execAsync('netstat -ano', { encoding: 'utf8', timeout: 8000 }),
          execAsync('tasklist /FI "STATUS eq running" /FO CSV /NH', { encoding: 'utf8', timeout: 8000 }),
        ]);

        const pidMap: Record<number, string> = {};
        for (const line of tasklistOut.stdout.trim().split('\n')) {
          const parts = line.split('","').map(p => p.replace(/"/g, ''));
          if (parts.length >= 2) {
            pidMap[parseInt(parts[1], 10)] = parts[0];
          }
        }

        const tcpPorts: { addr: string; port: number; pid: number; state: string }[] = [];
        for (const line of netstatOut.stdout.trim().split('\n')) {
          const parts = line.trim().split(/\s+/);
          if (parts[0] === 'TCP' && parts.length >= 5) {
            const [addr, portStr] = parts[1].split(':');
            tcpPorts.push({
              addr,
              port: parseInt(portStr, 10),
              state: parts[3] || 'UNKNOWN',
              pid: parseInt(parts[parts.length - 1], 10),
            });
          }
        }

        const listening = tcpPorts.filter(p => p.state === 'LISTENING').slice(0, 20);
        return '监听端口：\n' + listening
          .map(p => `${p.addr}:${p.port.toString().padStart(6)}  PID: ${p.pid.toString().padStart(6)}  ${pidMap[p.pid] || '未知'}`)
          .join('\n');
      }

      case 'execute_command': {
        const command = parsedArgs.command as string;
        const shell = (parsedArgs.shell as string) || 'powershell';

        if (!command) return '命令不能为空';

        // 高危命令检测
        for (const pattern of this.highRiskPatterns) {
          if (pattern.test(command)) {
            return `⚠️ 高危命令已拦截：${command}\n该操作需要用户手动确认后才可执行。`;
          }
        }

        const shellCmd = shell === 'cmd' ? `cmd.exe /c` : `powershell.exe -NoProfile -Command`;
        const fullCmd = `${shellCmd} "${command.replace(/"/g, '\\"')}"`;

        const { stdout, stderr } = await execAsync(fullCmd, { encoding: 'utf8', timeout: 30000 });
        const output = stdout || stderr || '(无输出)';
        return `> ${command}\n${output}`.substring(0, 2000);
      }

      case 'get_env_vars': {
        const scope = parsedArgs.scope as string;
        const psScope = scope === 'system' ? 'Machine' : 'User';
        const { stdout } = await execAsync(
          `powershell -Command "[Environment]::GetEnvironmentVariables('${psScope}') | ConvertTo-Json -Compress"`,
          { encoding: 'utf8', timeout: 8000 }
        );
        const vars = JSON.parse(stdout || '{}') as Record<string, string>;
        const entries = Object.entries(vars).slice(0, 30);
        return `${scope === 'system' ? '系统' : '用户'}环境变量（前 30 条）：\n` +
          entries.map(([k, v]) => `${k}=${v}`).join('\n');
      }

      default:
        return `未知工具: ${name}`;
    }
  }

  // ========== 消息构建 ==========

  private buildMessages(): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // System prompt
    const systemParts: string[] = [];
    if (this.config.personaPrompt) systemParts.push(this.config.personaPrompt);
    if (this.config.systemPrompt) systemParts.push(this.config.systemPrompt);
    if (systemParts.length > 0) {
      messages.push({ role: 'system', content: systemParts.join('\n\n') });
    }

    messages.push(...this.conversationHistory);
    return messages;
  }

  private updateTokenCount(): void {
    let tokens = 0;
    for (const msg of this.conversationHistory) {
      tokens += Math.ceil(msg.content.length / 4);
    }
    this.totalTokens = tokens;
  }

  // ========== 历史记录 ==========

  clearHistory(): { success: boolean } {
    this.conversationHistory = [];
    this.totalTokens = 0;
    return { success: true };
  }

  getHistory(): ChatMessage[] {
    return [...this.conversationHistory];
  }

  // ========== 回调设置（从渲染进程传入） ==========

  setCallbacks(callbacks: Record<string, string>): void {
    // 回调通过 IPC 事件名称设置，这里只做占位
    // 实际回调在渲染进程通过 service.execute('setCallbacks', {callbackNames}) 注册
    logger.info('[AgentService] callbacks set:', Object.keys(callbacks));
  }

  // 内部触发器（供主进程调用）
  triggerStreaming(text: string): void {
    this.onStreaming?.(text);
  }

  triggerComplete(): void {
    this.onComplete?.();
  }

  triggerError(err: string): void {
    this.onError?.(err);
  }

  triggerToolCallStart(toolName: string): void {
    this.onToolCallStart?.(toolName);
  }

  triggerToolCallComplete(): void {
    this.onToolCallComplete?.();
  }

  setEventHandlers(handlers: {
    onStreaming?: (text: string) => void;
    onComplete?: () => void;
    onError?: (err: string) => void;
    onToolCallStart?: (toolName: string) => void;
    onToolCallComplete?: () => void;
  }): void {
    this.onStreaming = handlers.onStreaming;
    this.onComplete = handlers.onComplete;
    this.onError = handlers.onError;
    this.onToolCallStart = handlers.onToolCallStart;
    this.onToolCallComplete = handlers.onToolCallComplete;
  }

  // ========== 工具方法 ==========

  private wrapResponse<T>(data: T): IServiceResponse<T> {
    return { success: true, data, requestId: '' };
  }

  on(event: string, callback: (data: unknown) => void): void {
    // 暂不使用事件订阅
  }

  off(event: string, callback: (data: unknown) => void): void {
    // 暂不使用
  }
}

export const agentService = new AgentService();
