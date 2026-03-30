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
  private readonly CACHE_TTL = 10000; // 10秒缓存，减少频繁调用

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

    const [load, cpuData, cpuTemp] = await Promise.all([
      si.currentLoad(),
      si.cpu(),
      this.getCpuTemperature(),  // 并行获取温度
    ]);

    const result: CpuInfo = {
      manufacturer: cpuData.manufacturer,
      brand: cpuData.brand,
      speed: cpuData.speed,
      cores: cpuData.cores,
      physicalCores: cpuData.physicalCores,
      usage: load.currentLoad,
      temperature: cpuTemp,
    };

    this.setCache('cpu', result);
    return result;
  }

  private async getCpuTemperature(): Promise<number | undefined> {
    // 方案1: 尝试 MSAcpi_ThermalZoneTemperature (最常用)
    const temp = await this.getCpuTempViaMsAcpi();
    if (temp !== undefined) return temp;

    // 方案2: 尝试注册表 (部分 OEM 电脑有效)
    const temp2 = await this.getCpuTempViaRegistry();
    if (temp2 !== undefined) return temp2;

    return undefined;
  }

  // MSAcpi 方案 (最可靠)
  private async getCpuTempViaMsAcpi(): Promise<number | undefined> {
    try {
      const { stdout } = await execAsync(
        'powershell -Command "(Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace root/wmi -ErrorAction SilentlyContinue | Select-Object -First 1).CurrentTemperature"',
        { timeout: 800 }  // 降低超时到 800ms
      );
      const tempKelvin = parseInt(stdout.trim(), 10);
      if (isNaN(tempKelvin) || tempKelvin <= 0 || tempKelvin > 500) return undefined;
      return Math.round((tempKelvin / 10) - 273.15);
    } catch {
      return undefined;
    }
  }

  // 注册表方案 (部分 OEM 电脑有效)
  private async getCpuTempViaRegistry(): Promise<number | undefined> {
    try {
      const { stdout } = await execAsync(
        'powershell -Command "$temp = Get-ItemProperty -Path \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Thermal\\Zone\\*\' -Name Temperature -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Temperature; if ($temp) { $temp / 10 - 273.15 } else { $null }"',
        { timeout: 800 }  // 降低超时到 800ms
      );
      const temp = parseFloat(stdout.trim());
      if (isNaN(temp) || temp <= 0 || temp > 150) return undefined;
      return Math.round(temp);
    } catch {
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
    // 并行获取 nvidia-smi 数据
    const [nvidiaTemps, nvidiaUtilizations] = await Promise.all([
      this.getNvidiaGpuTemperatures(),
      this.getNvidiaGpuUtilizations(),
    ]);

    const result: GpuInfo[] = data.controllers.map((gpu, index) => {
      const isNvidia = gpu.vendor?.toLowerCase().includes('nvidia') ||
                       gpu.model?.toLowerCase().includes('nvidia') ||
                       gpu.model?.toLowerCase().includes('geforce');

      // 优先使用 nvidia-smi 数据，否则用 systeminformation
      let temperature: number | undefined = gpu.temperatureGpu;
      let utilization: number = gpu.utilizationGpu ?? 0;

      if (isNvidia) {
        if (nvidiaTemps[index] !== undefined) {
          temperature = nvidiaTemps[index];
        }
        if (nvidiaUtilizations[index] !== undefined) {
          utilization = nvidiaUtilizations[index];
        }
      }

      return {
        name: gpu.model || 'Unknown',
        vendor: gpu.vendor || 'Unknown',
        memoryTotal: gpu.memoryTotal || 0,
        memoryUsed: gpu.memoryUsed || 0,
        utilization,
        temperature,
      };
    });

    this.setCache('gpus', result);
    return result;
  }

  // 通过 nvidia-smi 获取 NVIDIA GPU 温度列表
  private async getNvidiaGpuTemperatures(): Promise<number[]> {
    try {
      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits',
        { timeout: 1000 }  // 降低超时到 1 秒
      );
      // 每行一个温度值
      const temps = stdout.trim().split('\n').map(t => parseInt(t.trim(), 10));
      return temps.filter(t => !isNaN(t) && t >= 0 && t <= 120);
    } catch {
      return [];
    }
  }

  // 通过 nvidia-smi 获取 NVIDIA GPU 利用率列表
  private async getNvidiaGpuUtilizations(): Promise<number[]> {
    try {
      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits',
        { timeout: 1000 }  // 降低超时到 1 秒
      );
      const utils = stdout.trim().split('\n').map(t => parseInt(t.trim(), 10));
      return utils.filter(t => !isNaN(t) && t >= 0 && t <= 100);
    } catch {
      return [];
    }
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
    const start = Date.now();
    logger.info('[SystemInfoService] getAll started');

    // 并行获取所有数据
    const [cpu, memory, disks, gpus, os] = await Promise.all([
      this.getCpu().then(r => { logger.info(`[SystemInfoService] getCpu done: ${Date.now() - start}ms`); return r; }),
      this.getMemory().then(r => { logger.info(`[SystemInfoService] getMemory done: ${Date.now() - start}ms`); return r; }),
      this.getDisks().then(r => { logger.info(`[SystemInfoService] getDisks done: ${Date.now() - start}ms`); return r; }),
      this.getGpus().then(r => { logger.info(`[SystemInfoService] getGpus done: ${Date.now() - start}ms`); return r; }),
      this.getOsInfo().then(r => { logger.info(`[SystemInfoService] getOsInfo done: ${Date.now() - start}ms`); return r; }),
    ]);

    logger.info(`[SystemInfoService] getAll completed in ${Date.now() - start}ms`);
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
