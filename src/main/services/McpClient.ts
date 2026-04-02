/**
 * McpClient - Model Context Protocol 客户端
 * 用于连接 MiniMax MCP 服务器，执行 AI 工具调用
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { IService, IServiceResponse, ServiceInfo } from '../../shared/interfaces/service.interface';
import { logger } from '../utils/Logger';

// ========== 类型定义 ==========

export interface McpClientConfig {
  apiKey: string;
  apiHost: string;
  mcpCommand: string;
  mcpArgs: string[];
  timeout: number;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ========== 默认配置 ==========

const DEFAULT_CONFIG: McpClientConfig = {
  apiKey: '',
  apiHost: 'https://api.minimaxi.com',
  mcpCommand: 'uvx',
  mcpArgs: ['minimax-coding-plan-mcp', '-y'],
  timeout: 60000, // 60 秒超时
};

// ========== McpClient 实现 ==========

class McpClient implements IService {
  readonly name = 'McpClient';
  readonly version = '1.0.0';

  private process: ChildProcess | null = null;
  private pendingRequests: Map<string | number, (result: unknown) => void> = new Map();
  private requestId = 1;
  private config: McpClientConfig;
  private isInitialized = false;
  private initializePromise: Promise<void> | null = null;

  // 事件回调
  private onStderr?: (data: string) => void;
  private onError?: (err: string) => void;

  constructor(config: Partial<McpClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ========== IService 实现 ==========

  async getInfo(): Promise<IServiceResponse<ServiceInfo>> {
    return {
      success: true,
      data: {
        name: this.name,
        version: this.version,
        capabilities: ['connect', 'disconnect', 'listTools', 'callTool'],
        status: this.isInitialized ? 'running' : 'stopped',
      },
      requestId: '',
    };
  }

  async execute<T = unknown>(action: string, params?: T): Promise<IServiceResponse> {
    try {
      switch (action) {
        case 'connect':
          return this.wrapResponse(await this.connect());

        case 'disconnect':
          this.disconnect();
          return this.wrapResponse({ success: true });

        case 'listTools':
          return this.wrapResponse(await this.listTools());

        case 'callTool':
          return this.wrapResponse(await this.callTool(
            (params as { name: string; arguments?: Record<string, unknown> }).name,
            (params as { name: string; arguments?: Record<string, unknown> }).arguments || {}
          ));

        case 'isConnected':
          return this.wrapResponse({ isConnected: this.isInitialized });

        case 'setConfig':
          this.setConfig(params as Partial<McpClientConfig>);
          return this.wrapResponse({ success: true });

        case 'setCallbacks':
          this.setCallbacks(params as { onStderr?: string; onError?: string });
          return this.wrapResponse({ success: true });

        default:
          return {
            success: false,
            error: { code: 'M0001', message: `Unknown action: ${action}` },
            requestId: '',
          };
      }
    } catch (error) {
      logger.error(`[McpClient] execute ${action} failed`, error as Error);
      return {
        success: false,
        error: { code: 'M0002', message: (error as Error).message },
        requestId: '',
      };
    }
  }

  // ========== 配置管理 ==========

  setConfig(partial: Partial<McpClientConfig>): void {
    this.config = { ...this.config, ...partial };
    logger.info(`[McpClient] config updated: apiHost=${this.config.apiHost}`);
  }

  getConfig(): McpClientConfig {
    return { ...this.config };
  }

  setCallbacks(callbacks: { onStderr?: string; onError?: string }): void {
    // 回调通过 IPC 事件转发，这里只做占位
    logger.info('[McpClient] callbacks set:', Object.keys(callbacks));
  }

  // ========== 连接管理 ==========

  /**
   * 连接到 MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.isInitialized && this.process) {
      logger.info('[McpClient] Already connected');
      return;
    }

    // 如果正在连接，等待现有连接完成
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this._doConnect();
    return this.initializePromise;
  }

  private async _doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('[McpClient] Starting MCP server...');

      // 设置环境变量
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        MINIMAX_API_KEY: this.config.apiKey,
        MINIMAX_API_HOST: this.config.apiHost,
      };

      // 查找 uvx 路径（Windows 上可能在用户目录）
      const userLocalBin = path.join(process.env.USERPROFILE || '', '.local', 'bin');
      const uvxPath = path.join(userLocalBin, 'uvx.exe');
      const uvxCommand = fs.existsSync(uvxPath) ? uvxPath : this.config.mcpCommand;

      logger.info(`[McpClient] Using uvx path: ${uvxCommand}`);

      this.process = spawn(uvxCommand, this.config.mcpArgs, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        windowsHide: true,
      });

      // 处理标准输出
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleOutput(data.toString());
      });

      // 处理标准错误
      this.process.stderr?.on('data', (data: Buffer) => {
        const stderrData = data.toString().trim();
        if (stderrData) {
          logger.warn('[McpClient] STDERR:', stderrData);
          this.onStderr?.(stderrData);
        }
      });

      // 处理进程错误
      this.process.on('error', (err) => {
        logger.error('[McpClient] Process error', err);
        this.isInitialized = false;
        this.initializePromise = null;
        this.onError?.(err.message);
        reject(err);
      });

      // 处理进程退出
      this.process.on('exit', (code, signal) => {
        logger.info(`[McpClient] Process exited: code=${code}, signal=${signal}`);
        this.isInitialized = false;
        this.initializePromise = null;
      });

      // 等待服务器启动后初始化
      setTimeout(async () => {
        try {
          await this.initialize();
          this.initializePromise = null;
          resolve();
        } catch (err) {
          this.initializePromise = null;
          reject(err);
        }
      }, 5000);
    });
  }

  /**
   * 断开 MCP 服务器连接
   */
  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.isInitialized = false;
    this.initializePromise = null;
    this.pendingRequests.clear();
    logger.info('[McpClient] Disconnected');
  }

  // ========== JSON-RPC 处理 ==========

  /**
   * 处理服务器输出
   */
  private handleOutput(data: string): void {
    const lines = data.split('\n').filter(line => line.trim());

    for (const line of lines) {
      logger.debug(`[McpClient] RECV: ${line}`);

      try {
        const response: JsonRpcResponse = JSON.parse(line);

        // 处理有 id 的响应
        if (response.id !== undefined) {
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            if (response.error) {
              const err = new Error(response.error.message);
              err.name = `McpClientRPCError`;
              logger.error(`[McpClient] RPC error: ${response.error.message}`, err);
            }
            pending(response.result);
            this.pendingRequests.delete(response.id);
          }
        }
      } catch (e) {
        // 非 JSON 行，忽略
        logger.debug(`[McpClient] Non-JSON line: ${line}`);
      }
    }
  }

  /**
   * 发送 JSON-RPC 请求并等待响应
   */
  private async sendRequest(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.process || !this.process.stdin) {
      throw new Error('MCP process not initialized');
    }

    const id = this.requestId++;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const json = JSON.stringify(request);
    logger.debug(`[McpClient] SEND: ${json}`);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, resolve);

      this.process!.stdin!.write(json + '\n', (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          reject(err);
        }
      });

      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timeout`));
        }
      }, this.config.timeout);
    });
  }

  // ========== MCP 协议方法 ==========

  /**
   * 初始化 MCP 连接
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info('[McpClient] Already initialized');
      return;
    }

    logger.info('[McpClient] Sending initialize request...');

    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'nachonya-mcp-client',
        version: '1.0.0',
      },
    });

    logger.info('[McpClient] Initialize response:', response);

    // 发送 initialized 通知
    await this.sendRequest('initialized', {});

    this.isInitialized = true;
    logger.info('[McpClient] MCP connection initialized!');
  }

  /**
   * 列出所有可用工具
   */
  async listTools(): Promise<{ tools: McpTool[] }> {
    if (!this.isInitialized) {
      throw new Error('MCP not connected');
    }

    const response = await this.sendRequest('tools/list', {}) as { tools?: McpTool[] };
    return { tools: response?.tools || [] };
  }

  /**
   * 调用指定工具
   */
  async callTool(name: string, arguments_: Record<string, unknown> = {}): Promise<McpToolCallResult> {
    if (!this.isInitialized) {
      throw new Error('MCP not connected');
    }

    logger.info(`[McpClient] Calling tool: ${name}`, arguments_);

    const response = await this.sendRequest('tools/call', {
      name,
      arguments: arguments_,
    }) as McpToolCallResult;

    logger.info(`[McpClient] Tool response:`, response);

    return response;
  }

  // ========== 事件处理 ==========

  on(event: string, callback: (data: unknown) => void): void {
    switch (event) {
      case 'stderr':
        this.onStderr = callback as (data: string) => void;
        break;
      case 'error':
        this.onError = callback as (err: string) => void;
        break;
    }
  }

  off(event: string, callback: (data: unknown) => void): void {
    switch (event) {
      case 'stderr':
        this.onStderr = undefined;
        break;
      case 'error':
        this.onError = undefined;
        break;
    }
  }

  // ========== 辅助方法 ==========

  private wrapResponse<T>(data: T): IServiceResponse<T> {
    return { success: true, data, requestId: '' };
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.isInitialized;
  }
}

// ========== 导出单例 ==========

export const mcpClient = new McpClient();
export { McpClient };
