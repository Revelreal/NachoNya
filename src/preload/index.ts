/**
 * Preload Script
 * 桥接主进程和渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IpcMessage, IpcResponse } from '../shared/interfaces/ipc/message.interface';
import { v4 as uuidv4 } from 'uuid';

// ========== 工具函数 ==========

function createRequest<T>(service: string, action: string, params?: T): IpcMessage {
  return {
    header: {
      requestId: uuidv4(),
      timestamp: Date.now(),
      version: '1.0.0',
      source: 'renderer',
    },
    payload: {
      service,
      action,
      params,
    },
    security: {
      retryCount: 3,
      timeout: 30000,
    },
  };
}

// ========== API 暴露给渲染进程 ==========

const api = {
  /**
   * 调用服务
   */
  service: {
    execute: <T = unknown, R = unknown>(service: string, action: string, params?: T): Promise<IpcResponse<R>> => {
      const request = createRequest(service, action, params);
      return ipcRenderer.invoke('service:execute', request) as Promise<IpcResponse<R>>;
    },

    list: (): Promise<{ success: boolean; data: string[] }> => {
      return ipcRenderer.invoke('service:list');
    },
  },

  /**
   * 窗口控制
   */
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  },

  /**
   * 系统信息服务快捷方法
   */
  system: {
    getCpu: () => api.service.execute('SystemInfoService', 'getCpu'),
    getMemory: () => api.service.execute('SystemInfoService', 'getMemory'),
    getDisks: () => api.service.execute('SystemInfoService', 'getDisks'),
    getGpus: () => api.service.execute('SystemInfoService', 'getGpus'),
    getAll: () => api.service.execute('SystemInfoService', 'getAll'),
    getOsInfo: () => api.service.execute('SystemInfoService', 'getOsInfo'),
  },

  /**
   * 进程服务快捷方法
   */
  process: {
    list: (options?: { sortBy?: string; limit?: number }) =>
      api.service.execute('ProcessService', 'listProcesses', options),
    get: (pid: number) => api.service.execute('ProcessService', 'getProcess', { pid }),
    kill: (pid: number) => api.service.execute('ProcessService', 'killProcess', { pid }),
    listPorts: () => api.service.execute('ProcessService', 'listPorts'),
    killPort: (port: number) => api.service.execute('ProcessService', 'killPort', { port }),
    listEnvVars: () => api.service.execute('ProcessService', 'listEnvVars'),
    getIcons: () => api.service.execute<unknown, { name: string; iconBase64: string }[]>('ProcessService', 'getProcessIcons'),
  },

  /**
   * Shell 终端交互
   */
  shell: {
    start: (shellType: 'powershell' | 'cmd' = 'powershell') =>
      ipcRenderer.invoke('shell:start', shellType),
    execute: (command: string) =>
      ipcRenderer.invoke('shell:execute', command),
    write: (data: string) =>
      ipcRenderer.invoke('shell:write', data),
    resize: (cols: number, rows: number) =>
      ipcRenderer.invoke('shell:resize', cols, rows),
    stop: () => ipcRenderer.invoke('shell:stop'),
    onData: (callback: (data: string) => void) => {
      ipcRenderer.on('shell:data', (_event, data) => callback(data));
    },
    onExit: (callback: (exitCode: number) => void) => {
      ipcRenderer.on('shell:exit', (_event, exitCode) => callback(exitCode));
    },
  },

  /**
   * AI 对话服务
   */
  agent: {
    chat: (message: string) =>
      api.service.execute('AgentService', 'chat', { message }),
    setConfig: (config: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      enableToolCalls?: boolean;
    }) => api.service.execute('AgentService', 'setConfig', config),
    testConnection: (config: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    }) => api.service.execute('AgentService', 'testConnection', config),
    clearHistory: () =>
      api.service.execute('AgentService', 'clearHistory'),
    getHistory: () =>
      api.service.execute<unknown, { role: string; content: string }[]>('AgentService', 'getHistory'),
    onStreaming: (callback: (text: string) => void) => {
      ipcRenderer.on('agent:streaming', (_event, text) => callback(text));
    },
    onComplete: (callback: () => void) => {
      ipcRenderer.on('agent:complete', () => callback());
    },
    onError: (callback: (err: string) => void) => {
      ipcRenderer.on('agent:error', (_event, err) => callback(err));
    },
    onToolCallStart: (callback: (toolName: string) => void) => {
      ipcRenderer.on('agent:toolCallStart', (_event, toolName) => callback(toolName));
    },
    onToolCallComplete: (callback: () => void) => {
      ipcRenderer.on('agent:toolCallComplete', () => callback());
    },
  },

  /**
   * 设置窗口
   */
  settings: {
    open: () => ipcRenderer.invoke('settings:open'),
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings: Record<string, unknown>) => ipcRenderer.invoke('settings:save', settings),
  },

  /**
   * 设置窗口控制 (仅设置窗口内使用)
   */
  settingsWindow: {
    minimize: () => ipcRenderer.invoke('settings:window:minimize'),
    maximize: () => ipcRenderer.invoke('settings:window:maximize'),
    close: () => ipcRenderer.invoke('settings:window:close'),
  },
};

// ========== 暴露 API ==========

// eslint-disable-next-line no-console
console.log('Preload script loading, contextBridge:', typeof contextBridge !== 'undefined');

contextBridge.exposeInMainWorld('nachoApi', api);

// eslint-disable-next-line no-console
console.log('nachoApi exposed');

// ========== 类型声明 ==========

declare global {
  interface Window {
    nachoApi: typeof api;
  }
}
