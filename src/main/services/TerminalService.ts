/**
 * TerminalService - 终端服务
 * 使用 Worker Thread + node-pty 避免阻塞主进程
 */

import { Worker } from 'worker_threads';
import { BrowserWindow, app } from 'electron';
import * as path from 'path';
import { logger } from '../utils/Logger';

interface WorkerMessage {
  type: string;
  id: string;
  data?: unknown;
}

type ShellType = 'powershell' | 'cmd';

export class TerminalService {
  private worker: Worker | null = null;
  private mainWindow: BrowserWindow | null = null;
  private pendingCallbacks: Map<string, (data: unknown) => void> = new Map();
  private messageId = 0;
  private isReady = false;

  constructor() {
    this.initWorker();
  }

  private getWorkerPath(): string {
    return path.join(app.getAppPath(), 'dist', 'main', 'workers', 'pty.worker.js');
  }

  private initWorker(): void {
    try {
      const workerPath = this.getWorkerPath();
      logger.info(`[TerminalService] Initializing worker from: ${workerPath}`);

      this.worker = new Worker(workerPath);

      this.worker.on('message', (msg: WorkerMessage) => {
        this.handleWorkerMessage(msg);
      });

      this.worker.on('error', (error) => {
        logger.error('[TerminalService] Worker error:', error);
        this.isReady = false;
      });

      this.worker.on('exit', (code: number) => {
        logger.info(`[TerminalService] Worker exited with code: ${code}`);
        this.isReady = false;
        if (code !== 0) {
          // Worker 非正常退出，自动重启
          setTimeout(() => this.initWorker(), 1000);
        }
      });

      // 等待 worker ready
      const timeout = setTimeout(() => {
        logger.error('[TerminalService] Worker initialization timeout');
      }, 5000);

      this.worker.once('message', (msg: WorkerMessage) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          this.isReady = true;
          logger.info('[TerminalService] Worker ready');
        }
      });
    } catch (error) {
      logger.error('[TerminalService] Failed to initialize worker:', error as Error);
    }
  }

  private handleWorkerMessage(msg: WorkerMessage): void {
    const { type, id, data } = msg;

    // 处理数据事件 - 转发到渲染进程
    if (type === 'data' && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('shell:data', data as string);
      return;
    }

    // 处理退出事件 - 转发到渲染进程
    if (type === 'exit' && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('shell:exit', data);
      return;
    }

    // 处理回调
    const callback = this.pendingCallbacks.get(id);
    if (callback) {
      callback(data);
      this.pendingCallbacks.delete(id);
    }
  }

  private sendToWorker(type: string, data?: unknown): Promise<unknown> {
    return new Promise((resolve) => {
      if (!this.worker || !this.isReady) {
        resolve({ success: false, error: 'Worker not ready' });
        return;
      }

      const msgId = `msg_${++this.messageId}`;
      this.pendingCallbacks.set(msgId, resolve);
      this.worker!.postMessage({ type, id: msgId, data });

      // 超时处理
      setTimeout(() => {
        if (this.pendingCallbacks.has(msgId)) {
          this.pendingCallbacks.delete(msgId);
          resolve({ success: false, error: 'Worker message timeout' });
        }
      }, 5000);
    });
  }

  public setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  public async start(shellType: ShellType = 'powershell'): Promise<{ success: boolean; error?: string }> {
    const result = await this.sendToWorker('spawn', {
      shell: shellType,
      cols: 120,
      rows: 30,
    }) as { success: boolean; error?: string };
    return result;
  }

  public async write(data: string): Promise<{ success: boolean; error?: string }> {
    return this.sendToWorker('write', data) as Promise<{ success: boolean; error?: string }>;
  }

  public async resize(cols: number, rows: number): Promise<{ success: boolean; error?: string }> {
    return this.sendToWorker('resize', { cols, rows }) as Promise<{ success: boolean; error?: string }>;
  }

  public async kill(): Promise<{ success: boolean }> {
    return this.sendToWorker('kill') as Promise<{ success: boolean }>;
  }

  public destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isReady = false;
    }
  }
}

// 导出单例
export const terminalService = new TerminalService();
