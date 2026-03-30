/**
 * NachoNya! - Main Process Entry
 * 猫羽雫的 AI 电脑管家 - 主进程入口
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';

import { serviceManager } from './core/ServiceManager';
import { systemInfoService } from './services/SystemInfoService';
import { processService } from './services/ProcessService';
import { logger } from './utils/Logger';
import { IpcMessage, IpcResponse } from '../shared/interfaces/ipc/message.interface';

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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    frame: true,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: './dist/preload/index.js',
      contextIsolation: true,
      nodeIntegration: false,
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

  logger.info('[Main] IPC handlers registered');
}

// ========== 服务注册 ==========

function registerServices(): void {
  // 注册系统信息服务
  serviceManager.register(systemInfoService);

  // 注册进程管理服务
  serviceManager.register(processService);

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
