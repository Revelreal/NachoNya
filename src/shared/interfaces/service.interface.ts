/**
 * NachoNya! - 标准服务接口
 * 基于 AUTOSAR 风格设计的统一服务接口
 */

// ========== 基础类型 ==========

export interface IServiceRequest<T = unknown> {
  action: string;
  params?: T;
  requestId: string;
}

export interface IServiceResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}

export interface ServiceInfo {
  name: string;
  version: string;
  capabilities: string[];
  status: 'running' | 'stopped' | 'error';
}

// ========== 标准服务接口 ==========

export interface IService {
  readonly name: string;
  readonly version: string;

  getInfo(): Promise<IServiceResponse<ServiceInfo>>;
  execute<T>(action: string, params?: T): Promise<IServiceResponse<unknown>>;

  on(event: string, callback: (data: unknown) => void): void;
  off(event: string, callback: (data: unknown) => void): void;
}

// ========== 事件类型 ==========

export type ServiceEventType =
  | 'healthchanged'
  | 'dataupdated'
  | 'error'
  | 'statuschanged';

export interface ServiceEvent {
  type: ServiceEventType;
  service: string;
  timestamp: number;
  data?: unknown;
}
