/**
 * 文件管理服务
 * 提供文件列表、文件信息、文件搜索、驱动器列表等功能
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

import { IService, IServiceResponse, ServiceInfo } from '../../shared/interfaces/service.interface';
import { logger } from '../utils/Logger';

const execAsync = promisify(exec);

// ========== 类型定义 ==========

export interface FileInfo {
  name: string;
  path: string;
  size: number;           // bytes
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
  createdTime: number;    // timestamp
  modifiedTime: number;   // timestamp
  accessedTime: number;   // timestamp
  extension: string;
  permissions: string;
}

export interface DriveInfo {
  name: string;
  path: string;
  type: string;           // Fixed / Removable / Network
  filesystem: string;
  totalSize: number;      // bytes
  freeSize: number;       // bytes
  usedSize: number;       // bytes
  usedPercent: number;    // %
}

export interface SearchResult {
  files: FileInfo[];
  totalCount: number;
  searchTime: number;     // ms
}

export interface DirectoryListing {
  files: FileInfo[];
  directories: FileInfo[];
  totalCount: number;
}

class FileService implements IService {
  readonly name = 'FileService';
  readonly version = '1.0.0';

  async getInfo(): Promise<IServiceResponse<ServiceInfo>> {
    return {
      success: true,
      data: {
        name: this.name,
        version: this.version,
        capabilities: ['listFiles', 'getFileInfo', 'searchFiles', 'getDrives', 'deleteFile', 'createDirectory'],
        status: 'running',
      },
      requestId: '',
    };
  }

  async execute<T>(action: string, params?: T): Promise<IServiceResponse> {
    try {
      switch (action) {
        case 'listFiles':
          return this.wrapResponse(await this.listFiles(params as { dir: string; includeHidden?: boolean }));
        case 'getFileInfo':
          return this.wrapResponse(await this.getFileInfo(params as { path: string }));
        case 'searchFiles':
          return this.wrapResponse(await this.searchFiles(params as { pattern: string; rootDir?: string; maxResults?: number }));
        case 'getDrives':
          return this.wrapResponse(await this.getDrives());
        case 'deleteFile':
          return this.wrapResponse(await this.deleteFile(params as { path: string }));
        case 'createDirectory':
          return this.wrapResponse(await this.createDirectory(params as { path: string }));
        default:
          return { success: false, error: { code: 'F0001', message: `Unknown action: ${action}` }, requestId: '' };
      }
    } catch (error) {
      logger.error(`[FileService] execute ${action} failed`, error as Error);
      return {
        success: false,
        error: { code: 'F0005', message: (error as Error).message },
        requestId: '',
      };
    }
  }

  // ========== 列出目录文件 ==========

  private async listFiles(options: { dir: string; includeHidden?: boolean } = { dir: '' }): Promise<DirectoryListing> {
    const { dir, includeHidden = false } = options;

    // 默认用户目录
    const targetDir = dir || process.env.USERPROFILE || process.cwd();

    // 验证目录存在
    if (!fs.existsSync(targetDir)) {
      throw new Error(`Directory not found: ${targetDir}`);
    }

    const stats = fs.statSync(targetDir);
    if (!stats.isDirectory()) {
      throw new Error(`Not a directory: ${targetDir}`);
    }

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const files: FileInfo[] = [];
    const directories: FileInfo[] = [];

    for (const entry of entries) {
      // 跳过隐藏文件（可选）
      if (!includeHidden && entry.name.startsWith('.')) {
        continue;
      }

      try {
        const fullPath = path.join(targetDir, entry.name);
        const entryStats = fs.statSync(fullPath);

        const fileInfo: FileInfo = {
          name: entry.name,
          path: fullPath,
          size: entryStats.size,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          isSymbolicLink: entry.isSymbolicLink(),
          createdTime: entryStats.birthtime.getTime(),
          modifiedTime: entryStats.mtime.getTime(),
          accessedTime: entryStats.atime.getTime(),
          extension: entry.isFile() ? path.extname(entry.name).toLowerCase() : '',
          permissions: this.getPermissionsString(entryStats.mode),
        };

        if (entry.isDirectory()) {
          directories.push(fileInfo);
        } else {
          files.push(fileInfo);
        }
      } catch (error) {
        // 跳过无法访问的文件
        logger.warn(`[FileService] Cannot access: ${entry.name}`, error as Error);
      }
    }

    // 排序：目录优先，然后按名称排序
    directories.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return {
      files,
      directories,
      totalCount: files.length + directories.length,
    };
  }

  // ========== 获取文件信息 ==========

  private async getFileInfo(params: { path: string }): Promise<FileInfo | null> {
    const { path: filePath } = params;

    if (!fs.existsSync(filePath)) {
      throw new Error(`Path not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    const name = path.basename(filePath);

    return {
      name,
      path: filePath,
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      isSymbolicLink: stats.isSymbolicLink(),
      createdTime: stats.birthtime.getTime(),
      modifiedTime: stats.mtime.getTime(),
      accessedTime: stats.atime.getTime(),
      extension: stats.isFile() ? path.extname(name).toLowerCase() : '',
      permissions: this.getPermissionsString(stats.mode),
    };
  }

  // ========== 搜索文件 ==========

  private async searchFiles(options: { pattern: string; rootDir?: string; maxResults?: number }): Promise<SearchResult> {
    const { pattern, rootDir, maxResults = 1000 } = options;
    const startTime = Date.now();
    const searchRoot = rootDir || process.env.USERPROFILE || process.cwd();

    const foundFiles: FileInfo[] = [];
    const patternLower = pattern.toLowerCase();

    // 使用 PowerShell 进行递归搜索
    const psCode = `
      Get-ChildItem -Path '${searchRoot.replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like '*${pattern.replace(/'/g, "''")}*' } |
        Select-Object -First ${maxResults} |
        ForEach-Object {
          $_.FullName + '|' + $_.Length + '|' + $_.CreationTime.Ticks + '|' + $_.LastWriteTime.Ticks + '|' + $_.Extension
        }
    `;

    const encoded = Buffer.from(psCode, 'utf16le').toString('base64');

    try {
      const { stdout } = await execAsync(
        `powershell -NoProfile -EncodedCommand ${encoded}`,
        { encoding: 'utf8', timeout: 60000 }
      );

      const lines = stdout.trim().split('\n').filter(l => l.includes('|'));

      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length < 5) continue;

        const [filePath, sizeStr, createdTicks, modifiedTicks, ext] = parts;
        const size = parseInt(sizeStr, 10) || 0;
        const createdTime = parseInt(createdTicks, 10) / 10000; // Convert from ticks
        const modifiedTime = parseInt(modifiedTicks, 10) / 10000;

        if (!fs.existsSync(filePath.trim())) continue;

        foundFiles.push({
          name: path.basename(filePath.trim()),
          path: filePath.trim(),
          size,
          isDirectory: false,
          isFile: true,
          isSymbolicLink: false,
          createdTime,
          modifiedTime,
          accessedTime: 0,
          extension: ext.trim().toLowerCase(),
          permissions: '',
        });
      }
    } catch (error) {
      logger.warn(`[FileService] Search error:`, error as Error);
    }

    return {
      files: foundFiles,
      totalCount: foundFiles.length,
      searchTime: Date.now() - startTime,
    };
  }

  // ========== 获取驱动器列表 ==========

  private async getDrives(): Promise<DriveInfo[]> {
    const psCode = `
      Get-WmiObject -Class Win32_LogicalDisk |
        ForEach-Object {
          $type = switch ($_.DriveType) { 2 { 'Removable' } 3 { 'Fixed' } 4 { 'Network' } 5 { 'CDROM' } default { 'Unknown' } }
          $total = [math]::Round($_.Size / 1GB, 2)
          $free = [math]::Round($_.FreeSpace / 1GB, 2)
          $used = $total - $free
          $usedPct = if ($total -gt 0) { [math]::Round(($used / $total) * 100, 1) } else { 0 }
          $_.DeviceID + '|' + $type + '|' + $_.FileSystem + '|' + ($total * 1024 * 1024 * 1024) + '|' + ($free * 1024 * 1024 * 1024) + '|' + ($used * 1024 * 1024 * 1024) + '|' + $usedPct
        }
    `;

    const encoded = Buffer.from(psCode, 'utf16le').toString('base64');

    const { stdout } = await execAsync(
      `powershell -NoProfile -EncodedCommand ${encoded}`,
      { encoding: 'utf8', timeout: 15000 }
    );

    const drives: DriveInfo[] = [];
    const lines = stdout.trim().split('\n').filter(l => l.includes('|'));

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 7) continue;

      const [deviceId, type, filesystem, totalStr, freeStr, usedStr, usedPctStr] = parts;

      drives.push({
        name: deviceId,
        path: deviceId,
        type: type.trim(),
        filesystem: filesystem.trim(),
        totalSize: parseInt(totalStr, 10) || 0,
        freeSize: parseInt(freeStr, 10) || 0,
        usedSize: parseInt(usedStr, 10) || 0,
        usedPercent: parseFloat(usedPctStr) || 0,
      });
    }

    return drives;
  }

  // ========== 删除文件 ==========

  private async deleteFile(params: { path: string }): Promise<{ success: boolean; message: string }> {
    const { path: filePath } = params;

    if (!fs.existsSync(filePath)) {
      return { success: false, message: `File not found: ${filePath}` };
    }

    const stats = fs.statSync(filePath);

    // 不允许删除系统关键目录
    const protectedPaths = [
      process.env.WINDIR || '',
      process.env.SYSTEMROOT || '',
      process.env.PROGRAMDATA || '',
      process.env.PROGRAMFILES || '',
      process.env['PROGRAMFILES(X86)'] || '',
    ].filter(p => p);

    for (const protectedPath of protectedPaths) {
      if (filePath.toLowerCase().startsWith(protectedPath.toLowerCase())) {
        return { success: false, message: 'Cannot delete system files' };
      }
    }

    try {
      if (stats.isDirectory()) {
        fs.rmdirSync(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
      logger.info(`[FileService] Deleted: ${filePath}`);
      return { success: true, message: `Deleted: ${filePath}` };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  // ========== 创建目录 ==========

  private async createDirectory(params: { path: string }): Promise<{ success: boolean; message: string }> {
    const { path: dirPath } = params;

    if (fs.existsSync(dirPath)) {
      return { success: false, message: `Path already exists: ${dirPath}` };
    }

    try {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.info(`[FileService] Created directory: ${dirPath}`);
      return { success: true, message: `Created: ${dirPath}` };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  // ========== 工具方法 ==========

  private getPermissionsString(mode: number): string {
    const permissions = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];

    const owner = permissions[(mode >> 6) & 0x7];
    const group = permissions[(mode >> 3) & 0x7];
    const other = permissions[mode & 0x7];

    return owner + group + other;
  }

  private wrapResponse<T>(data: T): IServiceResponse<T> {
    return { success: true, data, requestId: '' };
  }

  on(event: string, callback: (data: unknown) => void): void { }
  off(event: string, callback: (data: unknown) => void): void { }
}

export const fileService = new FileService();
