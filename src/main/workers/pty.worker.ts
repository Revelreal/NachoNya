/**
 * PTY Worker - 在 Worker Thread 中运行 node-pty
 * 避免阻塞主进程
 *
 * node-pty 在 Worker Thread 中加载和运行，不会阻塞主线程
 */

import { parentPort } from 'worker_threads';
import * as os from 'os';

// 懒加载 node-pty - 只在需要时才 require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pty = require('node-pty');

interface SpawnOptions {
  shell: string;
  args?: string[];
  cwd?: string;
  env?: { [key: string]: string };
  cols?: number;
  rows?: number;
}

interface PtyInstance {
  write: (data: string) => void;
  kill: () => void;
  resize: (cols: number, rows: number) => void;
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (exitInfo: { exitCode: number }) => void) => void;
}

let currentPty: PtyInstance | null = null;

parentPort?.on('message', (message: { type: string; id: string; data?: unknown }) => {
  const { type, id, data } = message;

  try {
    switch (type) {
      case 'spawn': {
        const options = data as SpawnOptions;

        // 关闭现有 PTY
        if (currentPty) {
          currentPty.kill();
          currentPty = null;
        }

        let shellPath: string;
        let shellArgs: string[];

        if (options.shell === 'powershell') {
          shellPath = 'powershell.exe';
          shellArgs = ['-NoLogo', '-NoExit'];
        } else if (options.shell === 'cmd') {
          shellPath = 'C:\\Windows\\System32\\cmd.exe';
          shellArgs = [];
        } else {
          shellPath = options.shell;
          shellArgs = options.args || [];
        }

        currentPty = pty.spawn(shellPath, shellArgs, {
          name: 'xterm-256color',
          cols: options.cols || 120,
          rows: options.rows || 30,
          cwd: options.cwd || os.homedir(),
          env: options.env || process.env as { [key: string]: string },
        }) as PtyInstance;

        currentPty.onData((chunk: string) => {
          // 过滤 ANSI 转义序列
          const cleanData = chunk
            .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')  // CSI sequences like [?1004h, [K, [m, [2J, [H
            .replace(/\x1b[()][AB012]/g, '')          // ESC ( sequences
            .replace(/\x1b[>=]?/g, '')                 // Other ESC sequences
            .replace(/\x1b\][0-9];[^\x07]*\x07/g, '')  // OSC sequences with ST terminator
            .replace(/\x1b\]0;.*?(?:\x07|$)/g, '')     // OSC sequences (title bar) alternate
            .replace(/\x07/g, '')                      // Bell character
            .replace(/\[K/g, '')                       // Erase line
            .replace(/\[m/g, '')                       // SGR (color)
            .replace(/\[2J/g, '')                      // Clear screen
            .replace(/\[H/g, '');                      // Cursor home
          parentPort?.postMessage({ type: 'data', id: 'pty_data', data: cleanData });
        });

        currentPty.onExit(({ exitCode }) => {
          parentPort?.postMessage({ type: 'exit', id: 'pty_exit', data: exitCode });
          currentPty = null;
        });

        parentPort?.postMessage({ type: 'spawned', id, data: { success: true } });
        break;
      }

      case 'write': {
        const text = data as string;
        if (currentPty) {
          currentPty.write(text);
          parentPort?.postMessage({ type: 'write-ack', id, data: { success: true } });
        } else {
          parentPort?.postMessage({ type: 'write-ack', id, data: { success: false, error: 'No PTY' } });
        }
        break;
      }

      case 'resize': {
        const { cols, rows } = data as { cols: number; rows: number };
        if (currentPty) {
          currentPty.resize(cols, rows);
          parentPort?.postMessage({ type: 'resize-ack', id, data: { success: true } });
        } else {
          parentPort?.postMessage({ type: 'resize-ack', id, data: { success: false, error: 'No PTY' } });
        }
        break;
      }

      case 'kill': {
        if (currentPty) {
          currentPty.kill();
          currentPty = null;
        }
        parentPort?.postMessage({ type: 'killed', id, data: { success: true } });
        break;
      }

      default:
        parentPort?.postMessage({ type: 'error', id, data: { error: `Unknown message type: ${type}` } });
    }
  } catch (error) {
    parentPort?.postMessage({ type: 'error', id, data: { error: (error as Error).message } });
  }
});

// 通知主线程 worker 已就绪
parentPort?.postMessage({ type: 'ready', id: 'init' });
