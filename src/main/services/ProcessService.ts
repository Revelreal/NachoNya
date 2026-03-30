/**
 * 进程管理服务
 * 提供进程列表、进程详情、结束进程等功能
 */

import { exec } from 'child_process';
import { promisify } from 'util';

import { IService, IServiceResponse, ServiceInfo } from '../../shared/interfaces/service.interface';
import { logger } from '../utils/Logger';

const execAsync = promisify(exec);

// ========== 类型定义 ==========

export interface ProcessInfo {
  pid: number;
  name: string;
  memory: number; // KB
  cpu: number; // %
  session: string;
  sessionNum: number;
}

export interface PortInfo {
  localAddress: string;
  port: number;
  protocol: 'TCP' | 'UDP';
  pid: number;
  state: string;
}

export interface WinServiceInfo {
  name: string;
  displayName: string;
  status: string;
  startType: string;
}

class ProcessService implements IService {
  readonly name = 'ProcessService';
  readonly version = '1.0.0';

  async getInfo(): Promise<IServiceResponse<ServiceInfo>> {
    return {
      success: true,
      data: {
        name: this.name,
        version: this.version,
        capabilities: ['listProcesses', 'getProcess', 'killProcess', 'listPorts', 'killPort', 'listServices', 'getService'],
        status: 'running',
      },
      requestId: '',
    };
  }

  async execute<T>(action: string, params?: T): Promise<IServiceResponse> {
    try {
      switch (action) {
        case 'listProcesses':
          return this.wrapResponse(await this.listProcesses(params as { sortBy?: string; limit?: number }));
        case 'getProcess':
          return this.wrapResponse(await this.getProcess(params as { pid: number }));
        case 'killProcess':
          return this.wrapResponse(await this.killProcess(params as { pid: number }));
        case 'listPorts':
          return this.wrapResponse(await this.listPorts());
        case 'killPort':
          return this.wrapResponse(await this.killPort(params as { port: number }));
        case 'listServices':
          return this.wrapResponse(await this.listServices());
        default:
          return { success: false, error: { code: 'S0001', message: `Unknown action: ${action}` }, requestId: '' };
      }
    } catch (error) {
      logger.error(`[ProcessService] execute ${action} failed`, error as Error);
      return {
        success: false,
        error: { code: 'S0005', message: (error as Error).message },
        requestId: '',
      };
    }
  }

  // ========== 进程列表 ==========

  private async listProcesses(options: { sortBy?: string; limit?: number } = {}): Promise<ProcessInfo[]> {
    // 使用 tasklist 获取进程列表
    const { stdout } = await execAsync('tasklist /FO CSV /NH', { encoding: 'utf8' });

    const lines = stdout.trim().split('\n');
    let processes: ProcessInfo[] = lines
      .map(line => this.parseTasklistLine(line))
      .filter(p => p !== null) as ProcessInfo[];

    // 排序
    if (options.sortBy === 'memory') {
      processes.sort((a, b) => b.memory - a.memory);
    } else if (options.sortBy === 'cpu') {
      processes.sort((a, b) => b.cpu - a.cpu);
    } else if (options.sortBy === 'name') {
      processes.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // 默认按 PID 排序
      processes.sort((a, b) => a.pid - b.pid);
    }

    // 限制数量
    if (options.limit) {
      processes = processes.slice(0, options.limit);
    }

    return processes;
  }

  private parseTasklistLine(line: string): ProcessInfo | null {
    const parts = this.parseCSV(line);
    if (parts.length < 5) return null;

    const [name, pid, session, sessionNum, memory] = parts;
    const pidNum = parseInt(pid.replace(/"/g, ''), 10);

    if (isNaN(pidNum)) return null;

    return {
      name: name.replace(/"/g, ''),
      pid: pidNum,
      session: session.replace(/"/g, ''),
      sessionNum: parseInt(sessionNum.replace(/"/g, ''), 10),
      memory: parseInt(memory.replace(/[^0-9]/g, ''), 10),
      cpu: 0, // tasklist 不提供 CPU
    };
  }

  // ========== 获取单个进程 ==========

  private async getProcess(params: { pid: number }): Promise<ProcessInfo | null> {
    const processes = await this.listProcesses();
    return processes.find(p => p.pid === params.pid) || null;
  }

  // ========== 结束进程 ==========

  private async killProcess(params: { pid: number }): Promise<{ success: boolean; message: string }> {
    // 检查是否是系统进程
    const systemPids = [0, 4]; // System and System Idle Process
    if (systemPids.includes(params.pid)) {
      return { success: false, message: 'Cannot terminate system process' };
    }

    try {
      await execAsync(`taskkill /PID ${params.pid} /F`, { timeout: 5000 });
      logger.info(`[ProcessService] Process ${params.pid} terminated`);
      return { success: true, message: `Process ${params.pid} terminated` };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  // ========== 端口列表 ==========

  private async listPorts(): Promise<PortInfo[]> {
    const { stdout } = await execAsync('netstat -ano', { encoding: 'utf8' });
    return this.parseNetstat(stdout);
  }

  private parseNetstat(output: string): PortInfo[] {
    const lines = output.trim().split('\n');
    const ports: PortInfo[] = [];

    for (const line of lines.slice(4)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length < 5) continue;

      const protocol = parts[0] as 'TCP' | 'UDP';
      if (!['TCP', 'UDP'].includes(protocol)) continue;

      const localAddress = parts[1];
      const [addr, portStr] = localAddress.split(':');
      const port = parseInt(portStr, 10);

      if (isNaN(port)) continue;

      const state = protocol === 'TCP' ? (parts[3] || 'UNKNOWN') : 'N/A';
      const pid = parseInt(parts[parts.length - 1], 10);

      ports.push({
        protocol,
        localAddress: addr,
        port,
        pid,
        state,
      });
    }

    return ports;
  }

  // ========== 结束端口 ==========

  private async killPort(params: { port: number }): Promise<{ success: boolean; message: string }> {
    const ports = await this.listPorts();
    const port = ports.find(p => p.port === params.port && p.protocol === 'TCP');

    if (!port) {
      return { success: false, message: `Port ${params.port} not found or not in use` };
    }

    return this.killProcess({ pid: port.pid });
  }

  // ========== 服务列表 ==========

  private async listServices(): Promise<WinServiceInfo[]> {
    const { stdout } = await execAsync('sc query state= all', { encoding: 'utf8' });
    return this.parseServicesList(stdout);
  }

  private parseServicesList(output: string): WinServiceInfo[] {
    const services: WinServiceInfo[] = [];
    const blocks = output.split('SERVICE_NAME:');

    for (const block of blocks.slice(1)) {
      const lines = block.split('\n');
      const name = lines[0]?.trim() || '';

      const displayNameMatch = block.match(/DISPLAY_NAME:\s*(.+)/);
      const displayName = displayNameMatch ? displayNameMatch[1].trim() : name;

      const stateMatch = block.match(/STATE\s*:\s*\d+\s+(\w+)/);
      const status = stateMatch ? stateMatch[1] : 'UNKNOWN';

      const startTypeMatch = block.match(/START_TYPE\s*:\s*\d+\s+(\w+)/);
      const startType = startTypeMatch ? startTypeMatch[1] : 'UNKNOWN';

      services.push({ name, displayName, status, startType });
    }

    return services;
  }

  // ========== 工具方法 ==========

  private parseCSV(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  private wrapResponse<T>(data: T): IServiceResponse<T> {
    return { success: true, data, requestId: '' };
  }

  on(event: string, callback: (data: unknown) => void): void { }
  off(event: string, callback: (data: unknown) => void): void { }
}

export const processService = new ProcessService();
