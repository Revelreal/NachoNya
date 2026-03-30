/**
 * 结构化日志系统
 * 车规级追溯支持
 */

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

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
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

    console.log(`${prefix} ${context} ${fullEntry.message}`, fullEntry.data || '');
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
}

export const logger = Logger.getInstance();
