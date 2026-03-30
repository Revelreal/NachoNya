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
  },
};

// ========== 暴露 API ==========

contextBridge.exposeInMainWorld('nachoApi', api);

// ========== 类型声明 ==========

declare global {
  interface Window {
    nachoApi: typeof api;
  }
}
