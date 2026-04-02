/**
 * 结构化日志系统
 * 支持文件输出，方便调试
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  requestId?: string;
  service?: string;
  action?: string;
  message: string;
  data?: unknown;
  stack?: string;
  processingTime?: number;
}

class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private readonly maxLogs = 10000;
  private logFilePath: string = '';

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
      Logger.instance.initLogFile();
    }
    return Logger.instance;
  }

  private initLogFile(): void {
    try {
      const userDataPath = app?.getPath?.('userData') || '.';
      const logDir = path.join(userDataPath, 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.logFilePath = path.join(logDir, `nachonya-${timestamp}.log`);
      this.info('Log file initialized', { path: this.logFilePath });
    } catch (e) {
      console.error('Failed to init log file:', e);
    }
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private writeToFile(text: string): void {
    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, text + '\n');
      } catch (e) {
        console.error('Failed to write log:', e);
      }
    }
  }

  private log(entry: Omit<LogEntry, 'timestamp'>): void {
    const fullEntry: LogEntry = {
      ...entry,
      timestamp: this.formatTimestamp(),
    };

    this.logs.push(fullEntry);

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    const prefix = `[${fullEntry.timestamp}] [${fullEntry.level}]`;
    const context = fullEntry.requestId
      ? `[${fullEntry.requestId}]${fullEntry.service ? `[${fullEntry.service}]` : ''}`
      : '';

    const logText = `${prefix} ${context} ${fullEntry.message}`;
    console.log(logText, fullEntry.data || '');
    this.writeToFile(logText + (fullEntry.data ? ` ${JSON.stringify(fullEntry.data)}` : ''));
  }

  debug(message: string, data?: unknown): void {
    this.log({ level: 'DEBUG', message, data });
  }

  info(message: string, data?: unknown): void {
    this.log({ level: 'INFO', message, data });
  }

  warn(message: string, data?: unknown): void {
    this.log({ level: 'WARN', message, data });
  }

  error(message: string, error?: Error, requestId?: string): void {
    this.log({
      level: 'ERROR',
      message,
      requestId,
      stack: error?.stack,
      data: { errorMessage: error?.message },
    });
  }

  query(options: {
    startTime?: string;
    endTime?: string;
    level?: LogLevel;
    requestId?: string;
    service?: string;
  }): LogEntry[] {
    return this.logs.filter(log => {
      if (options.level && log.level !== options.level) return false;
      if (options.requestId && log.requestId !== options.requestId) return false;
      if (options.service && log.service !== options.service) return false;
      if (options.startTime && log.timestamp < options.startTime) return false;
      if (options.endTime && log.timestamp > options.endTime) return false;
      return true;
    });
  }

  clear(): void {
    this.logs = [];
  }

  getLogFilePath(): string {
    return this.logFilePath;
  }
}

export const logger = Logger.getInstance();
