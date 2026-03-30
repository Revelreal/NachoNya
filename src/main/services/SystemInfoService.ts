/**
 * 系统信息服务
 * 提供 CPU、内存、磁盘、GPU 等硬件信息
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as si from 'systeminformation';

import { IService, IServiceResponse, ServiceInfo } from '../../shared/interfaces/service.interface';
import { logger } from '../utils/Logger';

const execAsync = promisify(exec);

// ========== 类型定义 ==========

export interface CpuInfo {
  manufacturer: string;
  brand: string;
  speed: number;
  cores: number;
  physicalCores: number;
  usage: number;
  temperature?: number;
}

export interface MemoryInfo {
  total: number;
  used: number;
  free: number;
  usedPercent: number;
}

export interface DiskInfo {
  name: string;
  mount: string;
  total: number;
  used: number;
  free: number;
  usedPercent: number;
}

export interface GpuInfo {
  name: string;
  vendor: string;
  memoryTotal: number;
  memoryUsed: number;
  utilization: number;
  temperature?: number;
}

export interface SystemInfo {
  cpu: CpuInfo;
  memory: MemoryInfo;
  disks: DiskInfo[];
  gpus: GpuInfo[];
  os: {
    hostname: string;
    platform: string;
    distro: string;
    release: string;
    arch: string;
    username: string;
  };
}

class SystemInfoService implements IService {
  readonly name = 'SystemInfoService';
  readonly version = '1.0.0';

  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 2000; // 2秒缓存

  async getInfo(): Promise<IServiceResponse<ServiceInfo>> {
    return {
      success: true,
      data: {
        name: this.name,
        version: this.version,
        capabilities: ['getCpu', 'getMemory', 'getDisks', 'getGpus', 'getAll', 'getOsInfo'],
        status: 'running',
      },
      requestId: '',
    };
  }

  async execute<T>(action: string, params?: T): Promise<IServiceResponse> {
    try {
      switch (action) {
        case 'getCpu':
          return this.wrapResponse(await this.getCpu());
        case 'getMemory':
          return this.wrapResponse(await this.getMemory());
        case 'getDisks':
          return this.wrapResponse(await this.getDisks());
        case 'getGpus':
          return this.wrapResponse(await this.getGpus());
        case 'getAll':
          return this.wrapResponse(await this.getAll());
        case 'getOsInfo':
          return this.wrapResponse(await this.getOsInfo());
        default:
          return { success: false, error: { code: 'S0001', message: `Unknown action: ${action}` }, requestId: '' };
      }
    } catch (error) {
      logger.error(`[SystemInfoService] execute ${action} failed`, error as Error);
      return {
        success: false,
        error: { code: 'S0005', message: (error as Error).message },
        requestId: '',
      };
    }
  }

  // ========== CPU 获取 ==========

  private async getCpu(): Promise<CpuInfo> {
    const cached = this.getCache('cpu');
    if (cached) return cached as CpuInfo;

    const [load, cpuData] = await Promise.all([
      si.currentLoad(),
      si.cpu(),
    ]);

    const result: CpuInfo = {
      manufacturer: cpuData.manufacturer,
      brand: cpuData.brand,
      speed: cpuData.speed,
      cores: cpuData.cores,
      physicalCores: cpuData.physicalCores,
      usage: load.currentLoad,
      temperature: await this.getCpuTemperature(),
    };

    this.setCache('cpu', result);
    return result;
  }

  private async getCpuTemperature(): Promise<number | undefined> {
    try {
      // 尝试 WMI 获取温度
      const { stdout } = await execAsync(
        'powershell -Command "Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace root/wmi -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty CurrentTemperature"',
        { timeout: 3000 }
      );

      const tempKelvin = parseInt(stdout.trim(), 10);
      if (isNaN(tempKelvin)) return undefined;

      // WMI 返回十分之一开尔文
      return (tempKelvin / 10) - 273.15;
    } catch {
      // 温度获取失败不影响主功能
      return undefined;
    }
  }

  // ========== 内存获取 ==========

  private async getMemory(): Promise<MemoryInfo> {
    const cached = this.getCache('memory');
    if (cached) return cached as MemoryInfo;

    const data = await si.mem();
    const result: MemoryInfo = {
      total: data.total,
      used: data.used,
      free: data.free,
      usedPercent: (data.used / data.total) * 100,
    };

    this.setCache('memory', result);
    return result;
  }

  // ========== 磁盘获取 ==========

  private async getDisks(): Promise<DiskInfo[]> {
    const cached = this.getCache('disks');
    if (cached) return cached as DiskInfo[];

    const data = await si.fsSize();
    const result: DiskInfo[] = data.map(disk => ({
      name: disk.fs,
      mount: disk.mount,
      total: disk.size,
      used: disk.used,
      free: disk.available,
      usedPercent: disk.use,
    }));

    this.setCache('disks', result);
    return result;
  }

  // ========== GPU 获取 ==========

  private async getGpus(): Promise<GpuInfo[]> {
    const cached = this.getCache('gpus');
    if (cached) return cached as GpuInfo[];

    const data = await si.graphics();
    const result: GpuInfo[] = data.controllers.map(gpu => ({
      name: gpu.model || 'Unknown',
      vendor: gpu.vendor || 'Unknown',
      memoryTotal: gpu.memoryTotal || 0,
      memoryUsed: gpu.memoryUsed || 0,
      utilization: gpu.utilizationGpu || 0,
      temperature: gpu.temperatureGpu,
    }));

    this.setCache('gpus', result);
    return result;
  }

  // ========== 操作系统信息 ==========

  private async getOsInfo(): Promise<SystemInfo['os']> {
    const cached = this.getCache('os');
    if (cached) return cached as SystemInfo['os'];

    const [osInfo, users] = await Promise.all([
      si.osInfo(),
      si.users(),
    ]);

    const result: SystemInfo['os'] = {
      hostname: osInfo.hostname,
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      arch: osInfo.arch,
      username: users[0]?.user || 'unknown',
    };

    this.setCache('os', result);
    return result;
  }

  // ========== 获取全部 ==========

  private async getAll(): Promise<SystemInfo> {
    const [cpu, memory, disks, gpus, os] = await Promise.all([
      this.getCpu(),
      this.getMemory(),
      this.getDisks(),
      this.getGpus(),
      this.getOsInfo(),
    ]);

    return { cpu, memory, disks, gpus, os };
  }

  // ========== 缓存工具 ==========

  private getCache(key: string): unknown | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private wrapResponse<T>(data: T): IServiceResponse<T> {
    return { success: true, data, requestId: '' };
  }

  on(event: string, callback: (data: unknown) => void): void {
    // TODO: Implement event subscription
  }

  off(event: string, callback: (data: unknown) => void): void {
    // TODO: Implement event unsubscription
  }
}

export const systemInfoService = new SystemInfoService();
