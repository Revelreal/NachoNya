/**
 * 服务管理器
 * 统一注册和管理所有服务
 */

import { IService, IServiceResponse, ServiceInfo } from '../../shared/interfaces/service.interface';
import { logger } from '../utils/Logger';

class ServiceManager {
  private static instance: ServiceManager;
  private services: Map<string, IService> = new Map();

  private constructor() {}

  static getInstance(): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager();
    }
    return ServiceManager.instance;
  }

  register(service: IService): void {
    if (this.services.has(service.name)) {
      throw new Error(`Service ${service.name} already registered`);
    }

    this.services.set(service.name, service);
    logger.info(`[ServiceManager] Service registered: ${service.name} v${service.version}`);
  }

  get(name: string): IService | undefined {
    return this.services.get(name);
  }

  has(name: string): boolean {
    return this.services.has(name);
  }

  async execute(
    serviceName: string,
    action: string,
    params?: unknown
  ): Promise<IServiceResponse> {
    const service = this.services.get(serviceName);

    if (!service) {
      return {
        success: false,
        error: { code: 'S0001', message: `Service ${serviceName} not found` },
        requestId: '',
      };
    }

    try {
      return await service.execute(action, params);
    } catch (error) {
      logger.error(`[ServiceManager] Service execution failed: ${serviceName}.${action}`, error as Error);
      return {
        success: false,
        error: {
          code: 'S0005',
          message: `Service internal error: ${(error as Error).message}`,
        },
        requestId: '',
      };
    }
  }

  listServices(): ServiceInfo[] {
    return Array.from(this.services.values()).map(s => ({
      name: s.name,
      version: s.version,
      capabilities: [],
      status: 'running' as const,
    }));
  }

  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }
}

export const serviceManager = ServiceManager.getInstance();
