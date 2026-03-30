/**
 * NachoNya! - Main Process Entry
 * 猫羽雫的 AI 电脑管家 - 主进程入口
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import { exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

import { serviceManager } from './core/ServiceManager';
import { systemInfoService } from './services/SystemInfoService';
import { processService } from './services/ProcessService';
import { terminalService } from './services/TerminalService';
import { logger } from './utils/Logger';
import { IpcMessage, IpcResponse } from '../shared/interfaces/ipc/message.interface';

// 获取应用根目录（兼容开发/生产模式）
const getAppPath = (relativePath: string): string => {
  // app.getAppPath() 在开发时返回项目根目录，生产时返回安装目录
  return path.join(app.getAppPath(), relativePath);
};

// ========== 全局异常处理 ==========

process.on('uncaughtException', (error) => {
  logger.error('[Main] Uncaught exception', error);
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('[Main] Unhandled rejection', reason as Error);
});

// ========== 窗口管理 ==========

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const preloadPath = getAppPath('dist/preload/index.js');
  logger.info('[Main] Preload path:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    frame: false, // 无边框窗口，使用自定义标题栏
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hidden', // macOS 风格
    webPreferences: {
      preload: getAppPath('dist/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 加载 UI
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile('./dist/renderer/index.html');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  logger.info('[Main] Window created');
}

// ========== IPC 处理 ==========

function setupIpcHandlers(): void {
  // 服务执行处理器
  ipcMain.handle('service:execute', async (_event, message: IpcMessage): Promise<IpcResponse> => {
    const startTime = Date.now();
    const { requestId } = message.header;
    const { payload } = message;

    logger.debug(`[IpcMain] ${requestId} -> ${payload.service}.${payload.action}`);

    try {
      const response = await serviceManager.execute(
        payload.service,
        payload.action,
        payload.params
      );

      const processingTime = Date.now() - startTime;

      logger.info(`[IpcMain] ${requestId} completed in ${processingTime}ms`);

      return {
        header: {
          requestId,
          timestamp: Date.now(),
          version: '1.0.0',
          source: 'main' as const,
        },
        payload: response,
        diagnostic: {
          processingTime,
          serviceVersion: '1.0.0',
        },
      };
    } catch (error) {
      logger.error(`[IpcMain] ${requestId} failed`, error as Error);
      return {
        header: {
          requestId,
          timestamp: Date.now(),
          version: '1.0.0',
          source: 'main',
        },
        payload: {
          success: false,
          error: {
            code: 'S0005',
            message: (error as Error).message,
          },
        },
        diagnostic: {
          processingTime: Date.now() - startTime,
          serviceVersion: '1.0.0',
        },
      };
    }
  });

  // 服务列表处理器
  ipcMain.handle('service:list', async (): Promise<{ success: boolean; data: string[] }> => {
    return {
      success: true,
      data: serviceManager.getServiceNames(),
    };
  });

  // 窗口控制处理器
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() || false;
  });

  // Shell 执行处理器 - 使用 Worker Thread + node-pty
  ipcMain.handle('shell:start', async (_event, shellType: string = 'powershell') => {
    try {
      terminalService.setMainWindow(mainWindow);
      return await terminalService.start(shellType as 'powershell' | 'cmd');
    } catch (error) {
      logger.error('[Main] Failed to start shell:', error as Error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('shell:write', async (_event, data: string) => {
    return await terminalService.write(data);
  });

  ipcMain.handle('shell:execute', async (_event, command: string) => {
    return await terminalService.write(command + '\r');
  });

  ipcMain.handle('shell:resize', async (_event, cols: number, rows: number) => {
    return await terminalService.resize(cols, rows);
  });

  ipcMain.handle('shell:stop', async () => {
    return await terminalService.kill();
  });

  logger.info('[Main] IPC handlers registered');
}

// ========== 服务注册 ==========

function registerServices(): void {
  // 注册系统信息服务
  serviceManager.register(systemInfoService);

  // 注册进程管理服务
  serviceManager.register(processService);

  // 注册终端服务
  terminalService.setMainWindow(mainWindow);

  logger.info('[Main] All services registered');
}

// ========== 应用生命周期 ==========

app.whenReady().then(() => {
  logger.info('[Main] App ready, starting initialization...');

  registerServices();
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logger.info('[Main] All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  logger.info('[Main] App quit');
});
