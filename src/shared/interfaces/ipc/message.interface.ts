/**
 * IPC 消息格式定义
 * 车规级通信标准
 */

export type MessageSource = 'renderer' | 'main';

/**
 * IPC 请求消息
 */
export interface IpcMessage<T = unknown> {
  header: {
    requestId: string;
    timestamp: number;
    version: string;
    source: MessageSource;
  };
  payload: {
    service: string;
    action: string;
    params?: T;
  };
  security: {
    retryCount: number;
    timeout: number;
  };
}

/**
 * IPC 响应消息
 */
export interface IpcResponse<T = unknown> {
  header: {
    requestId: string;
    timestamp: number;
    version: string;
    source: MessageSource;
  };
  payload: {
    success: boolean;
    data?: T;
    error?: {
      code: string;
      message: string;
      details?: unknown;
    };
  };
  diagnostic: {
    processingTime: number;
    serviceVersion: string;
  };
}

/**
 * 心跳消息
 */
export interface HeartbeatMessage {
  service: string;
  timestamp: number;
  status: 'healthy' | 'degraded' | 'failed';
}
