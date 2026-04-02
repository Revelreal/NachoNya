/**
 * NachoNya! CLI - 命令行调试工具
 * 直接调用 ServiceManager 测试各个服务
 *
 * 用法:
 *   npx ts-node src/main/cli.ts <service> <action> [params]
 *
 * 示例:
 *   npx ts-node src/main/cli.ts SystemInfoService getAll
 *   npx ts-node src/main/cli.ts ProcessService listProcesses
 *   npx ts-node src/main/cli.ts FileService getDrives
 *   npx ts-node src/main/cli.ts -l                    # 列出所有服务
 *   npx ts-node src/main/cli.ts -i                    # 交互模式
 */

import { systemInfoService } from './services/SystemInfoService';
import { processService } from './services/ProcessService';
import { fileService } from './services/FileService';
import { agentService } from './services/AgentService';
import { serviceManager } from './core/ServiceManager';

// 注册所有服务
serviceManager.register(systemInfoService);
serviceManager.register(processService);
serviceManager.register(fileService);
serviceManager.register(agentService);

// 彩色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function log(...args: unknown[]) {
  console.log(colors.cyan, '[CLI]', colors.reset, ...args);
}

function success(...args: unknown[]) {
  console.log(colors.green, '[OK]', colors.reset, ...args);
}

function error(...args: unknown[]) {
  console.log(colors.red, '[ERROR]', colors.reset, ...args);
}

function info(...args: unknown[]) {
  console.log(colors.blue, '[INFO]', colors.reset, ...args);
}

// 格式化输出
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatResult(data: unknown, indent = 0): void {
  const spaces = '  '.repeat(indent);

  if (data === null) {
    console.log(spaces + colors.dim + 'null' + colors.reset);
  } else if (data === undefined) {
    console.log(spaces + colors.dim + 'undefined' + colors.reset);
  } else if (typeof data === 'string') {
    console.log(spaces + data);
  } else if (typeof data === 'number' || typeof data === 'boolean') {
    console.log(spaces + colors.yellow + String(data) + colors.reset);
  } else if (Array.isArray(data)) {
    console.log(spaces + colors.magenta + '[' + colors.reset);
    data.forEach((item, i) => {
      console.log(spaces + '  ' + colors.dim + `#${i}:` + colors.reset);
      formatResult(item, indent + 2);
    });
    console.log(spaces + colors.reset + ']' + colors.reset);
  } else if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    console.log(spaces + colors.magenta + '{' + colors.reset);
    for (const [key, value] of Object.entries(obj)) {
      const keyColor = colors.cyan;
      const valueType = typeof value;
      if (valueType === 'object' && value !== null) {
        console.log(spaces + '  ' + keyColor + key + colors.reset + ':');
        formatResult(value, indent + 2);
      } else if (valueType === 'string') {
        console.log(spaces + '  ' + keyColor + key + colors.reset + ': ' + colors.white + `"${value}"` + colors.reset);
      } else if (valueType === 'number') {
        console.log(spaces + '  ' + keyColor + key + colors.reset + ': ' + colors.yellow + value + colors.reset);
      } else if (valueType === 'boolean') {
        console.log(spaces + '  ' + keyColor + key + colors.reset + ': ' + (value ? colors.green : colors.red) + value + colors.reset);
      } else {
        console.log(spaces + '  ' + keyColor + key + colors.reset + ':');
        formatResult(value, indent + 2);
      }
    }
    console.log(spaces + colors.reset + '}' + colors.reset);
  }
}

// 交互模式
async function interactiveMode(): Promise<void> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => new Promise<string>((resolve) => rl.question('nacho> ', resolve));

  log('进入交互模式，输入 "help" 查看命令，输入 "exit" 退出');
  log('可用服务:', serviceManager.getServiceNames().join(', '));
  console.log();

  while (true) {
    const input = await prompt();

    if (input.trim() === 'exit') {
      break;
    }

    if (input.trim() === 'help') {
      console.log(`
可用命令:
  help           - 显示帮助
  services       - 列出所有服务
  <svc> <act>   - 调用服务
  exit           - 退出

示例:
  SystemInfoService getAll
  ProcessService listProcesses --limit 10
  FileService getDrives
`);
      continue;
    }

    if (input.trim() === 'services') {
      const services = serviceManager.listServices();
      console.log();
      for (const svc of services) {
        console.log(`  ${colors.cyan}${svc.name}${colors.reset} v${svc.version} [${colors.green}${svc.status}${colors.reset}]`);
        console.log(`    ${colors.dim}能力: ${svc.capabilities.join(', ')}${colors.reset}`);
      }
      console.log();
      continue;
    }

    const parts = input.trim().split(/\s+/);
    if (parts.length < 2) {
      error('用法: <service> <action> [params]');
      continue;
    }

    const [service, action, ...args] = parts;
    const params = args.length > 0 ? parseParams(args) : undefined;

    try {
      const result = await serviceManager.execute(service, action, params);
      if (result.success) {
        console.log();
        formatResult(result.data);
        console.log();
      } else {
        error(`服务调用失败: ${result.error?.message}`);
      }
    } catch (e) {
      error('异常:', (e as Error).message);
    }
  }

  rl.close();
}

// 解析简单参数
function parseParams(args: string[]): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const arg of args) {
    const [key, value] = arg.split('=');
    if (value === undefined) {
      // 纯数字
      if (/^\d+$/.test(key)) {
        params[`arg${Object.keys(params).length}`] = parseInt(key, 10);
      } else {
        params[key] = true;
      }
    } else {
      // key=value
      if (/^\d+$/.test(value)) {
        params[key] = parseInt(value, 10);
      } else if (/^\d+\.\d+$/.test(value)) {
        params[key] = parseFloat(value);
      } else if (value === 'true') {
        params[key] = true;
      } else if (value === 'false') {
        params[key] = false;
      } else {
        params[key] = value.replace(/^["']|["']$/g, '');
      }
    }
  }
  return params;
}

// 主入口
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    console.log(`
${colors.bright}NachoNya! CLI${colors.reset} - 命令行调试工具

${colors.yellow}用法:${colors.reset}
  ${colors.cyan}npx ts-node src/main/cli.ts <service> <action> [params]${colors.reset}

${colors.yellow}选项:${colors.reset}
  ${colors.cyan}-l${colors.reset}, --list      列出所有服务
  ${colors.cyan}-i${colors.reset}, --interactive  交互模式
  ${colors.cyan}-h${colors.reset}, --help     显示帮助

${colors.yellow}示例:${colors.reset}
  ${colors.dim}# 列出所有服务${colors.reset}
  npx ts-node src/main/cli.ts -l

  ${colors.dim}# 获取系统信息${colors.reset}
  npx ts-node src/main/cli.ts SystemInfoService getAll

  ${colors.dim}# 获取进程列表${colors.reset}
  npx ts-node src/main/cli.ts ProcessService listProcesses limit=10

  ${colors.dim}# 获取驱动器列表${colors.reset}
  npx ts-node src/main/cli.ts FileService getDrives

  ${colors.dim}# 交互模式${colors.reset}
  npx ts-node src/main/cli.ts -i
`);
    return;
  }

  if (args[0] === '-l' || args[0] === '--list') {
    const services = serviceManager.listServices();
    console.log();
    log('已注册服务:');
    for (const svc of services) {
      console.log(`  ${colors.cyan}${svc.name}${colors.reset} v${svc.version} [${colors.green}${svc.status}${colors.reset}]`);
      console.log(`    ${colors.dim}${svc.capabilities.join(', ')}${colors.reset}`);
    }
    console.log();
    return;
  }

  if (args[0] === '-i' || args[0] === '--interactive') {
    await interactiveMode();
    return;
  }

  // 执行服务调用
  const [service, action, ...paramArgs] = args;
  const params = paramArgs.length > 0 ? parseParams(paramArgs) : undefined;

  log(`调用: ${colors.yellow}${service}${colors.reset}.${colors.yellow}${action}${colors.reset}${params ? ' ' + JSON.stringify(params) : ''}`);

  try {
    const start = Date.now();
    const result = await serviceManager.execute(service, action, params);
    const elapsed = Date.now() - start;

    if (result.success) {
      success(`耗时 ${elapsed}ms`);
      console.log();
      formatResult(result.data);
      console.log();
    } else {
      error(`调用失败 [${result.error?.code}]: ${result.error?.message}`);
    }
  } catch (e) {
    error('异常:', (e as Error).message);
    console.log();
  }
}

main().catch(console.error);
