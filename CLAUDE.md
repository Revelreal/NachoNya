# NachoNya! - 猫羽雫的 AI 电脑管家

> 超级可爱的智能电脑维护助手，用 AI 的力量守护你的电脑

## 角色设定

**猫羽雫 (Shizuku)** - 住在电脑里的 AI 猫娘管家
- 头像：粉色系可爱猫耳少女
- 性格：温柔、可靠、有点小迷糊但很能干
- 使命：守护主人电脑、清理垃圾、整理文件、监测健康

## 项目状态

**当前阶段**：架构设计完成

---

# 设计哲学与原则

## 1. 代码分层原则

**核心思想**：代码必须分结构、分层次、分逻辑，拒绝"几千行单文件"。

### 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process (UI)                      │
│  - 纯展示组件                                                │
│  - 无业务逻辑                                                 │
│  - 通过 Hooks 调用 Services                                   │
├─────────────────────────────────────────────────────────────┤
│                      Preload (桥接层)                        │
│  - 仅做 IPC 转发                                             │
│  - 不承载业务逻辑                                             │
├─────────────────────────────────────────────────────────────┤
│                    Main Process (服务)                        │
│  - 所有业务逻辑                                               │
│  - 按职责划分 Services                                        │
└─────────────────────────────────────────────────────────────┘
```

### 文件行数规范

| 文件类型 | 最大行数 | 违规信号 |
|---------|---------|---------|
| Component (组件) | 100-150 行 | 需要滚动查看 |
| Service (服务) | 150-200 行 | 方法超过 10 个 |
| Handler (处理器) | 100-150 行 | 嵌套超过 3 层 |
| Utils (工具) | 100 行以内 | 工具函数超过 8 个 |

**超标 = 需要拆分** → 单一职责原则

### 目录结构

```
src/
├── main/                      # 主进程
│   ├── index.ts             # 入口 (~50行)
│   ├── core/                # 核心
│   │   ├── ServiceManager.ts    # 服务管理器
│   │   ├── IpcDispatcher.ts     # IPC 调度器
│   │   └── ServiceHealthMonitor.ts  # 健康监控
│   ├── services/            # 服务层 (核心业务)
│   │   ├── SystemInfoService.ts
│   │   ├── ProcessService.ts
│   │   ├── TerminalService.ts
│   │   ├── AiService.ts
│   │   └── CleanupService.ts
│   └── utils/               # 工具函数
│       └── Logger.ts
│
├── preload/                  # 预加载
│   └── index.ts
│
├── renderer/                 # 渲染进程
│   ├── App.tsx
│   ├── components/          # UI 组件
│   │   ├── layout/
│   │   ├── monitoring/
│   │   ├── terminal/
│   │   └── ai-chat/
│   ├── hooks/               # 自定义 Hooks
│   ├── stores/              # 状态管理
│   └── styles/
│
└── shared/                  # 共享
    ├── interfaces/           # 接口定义
    │   ├── service.interface.ts
    │   └── ipc/
    │       ├── message.interface.ts
    │       └── error.interface.ts
    └── constants/
        └── error-codes.ts
```

---

## 2. API 服务化原则 (AUTOSAR 风格)

**核心思想**：接口标准化，实现可替换。就像 AUTOSAR 做的软硬件解耦一样，服务层统一接口，具体实现可插拔。

### 设计参考

> AUTOSAR (Automotive Open System Architecture) 的核心价值：
> - 软硬件解耦
> - 接口统一
> - 实现可替换
> - 便于协作开发

### 标准服务接口

```typescript
// shared/interfaces/service.interface.ts

interface IServiceRequest<T = unknown> {
  action: string;           // 操作名称
  params?: T;              // 参数
  requestId: string;       // 请求ID (追踪用)
}

interface IServiceResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  requestId: string;
}

interface IService {
  readonly name: string;
  readonly version: string;

  getInfo(): Promise<IServiceResponse<ServiceInfo>>;
  execute<T>(action: string, params?: T): Promise<IServiceResponse<unknown>>;

  on(event: string, callback: (data: unknown) => void): void;
  off(event: string, callback: (data: unknown) => void): void;
}

interface ServiceInfo {
  name: string;
  version: string;
  capabilities: string[];
  status: 'running' | 'stopped' | 'error';
}
```

### 服务注册机制

```typescript
// main/core/ServiceManager.ts

class ServiceManager {
  private services: Map<string, IService> = new Map();

  register(service: IService): void {
    if (this.services.has(service.name)) {
      throw new Error(`Service ${service.name} already registered`);
    }
    this.services.set(service.name, service);
  }

  get(name: string): IService | undefined {
    return this.services.get(name);
  }

  async execute(serviceName: string, action: string, params?: unknown): Promise<IServiceResponse> {
    const service = this.services.get(serviceName);
    if (!service) {
      return {
        success: false,
        error: { code: 'S0001', message: `Service ${serviceName} not found` },
        requestId: ''
      };
    }
    return service.execute(action, params);
  }

  listServices(): ServiceInfo[] {
    return Array.from(this.services.values()).map(s => ({
      name: s.name,
      version: s.version,
      capabilities: [],
      status: 'running'
    }));
  }
}
```

### 规划服务清单

| 服务名 | 职责 | 核心能力 |
|-------|------|---------|
| `SystemInfoService` | 系统信息 | cpu, memory, disk, gpu |
| `ProcessService` | 进程管理 | list, kill, detail |
| `TerminalService` | 终端执行 | execute, history |
| `AiService` | AI对话 | chat, tools |
| `FileService` | 文件操作 | scan, clean, organize |
| `PortService` | 端口监控 | list, kill |

---

## 3. IPC 通信规范

### 设计目标

| 车规级要求 | 实现 |
|-----------|------|
| 功能安全 (ISO 26262) | 超时 + 重试 + 死循环检测 |
| 确定性 (Determinism) | 统一消息格式 + 幂等操作 |
| 可追溯性 (Traceability) | Request ID + 结构化日志 |
| 故障检测 (Diagnostic) | 心跳机制 + 服务状态监控 |
| 向后兼容 | 接口版本管理 |

### 统一消息格式

```typescript
// shared/interfaces/ipc/message.interface.ts

interface IpcMessage<T = unknown> {
  header: {
    requestId: string;      // 请求唯一ID (UUID v4)
    timestamp: number;       // 时间戳 (毫秒)
    version: string;         // 接口版本 (语义化版本)
    source: 'renderer' | 'main';
  };
  payload: {
    service: string;         // 服务名称
    action: string;          // 操作名称
    params?: T;              // 参数
  };
  security: {
    retryCount: number;     // 重试次数
    timeout: number;        // 超时时间(ms)
  };
}

interface IpcResponse<T = unknown> {
  header: {
    requestId: string;
    timestamp: number;
    version: string;
    source: 'renderer' | 'main';
  };
  payload: {
    success: boolean;
    data?: T;
    error?: {
      code: string;
      message: string;
      details?: unknown;
    };
  };
  diagnostic: {
    processingTime: number;
    serviceVersion: string;
  };
}
```

### 超时与重试机制

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `timeout` | 30000ms | 单次请求最大耗时 |
| `retries` | 3 | 最多重试次数 |
| `backoff` | 指数退避 | 1s → 2s → 4s |

---

## 4. 错误处理规范

### 错误码体系 (参考 ISO 14229)

**格式**: `[类别][序号]`

| 类别 | 范围 | 说明 |
|------|------|------|
| Sxxxx | S0001-S0999 | 系统级错误 |
| Pxxxx | P0001-P0999 | 进程错误 |
| Txxxx | T0001-T0999 | 终端错误 |
| Axxxx | A0001-A0999 | AI 错误 |
| Fxxxx | F0001-F0999 | 文件错误 |

### 错误码定义

```typescript
// shared/constants/error-codes.ts

export const ErrorCodes = {
  // 系统级 (Sxxxx)
  S0001: { message: '服务未找到', level: 'error' },
  S0002: { message: '服务不可用', level: 'error' },
  S0003: { message: '请求超时', level: 'warning' },
  S0004: { message: '版本不兼容', level: 'error' },
  S0005: { message: '服务内部错误', level: 'error' },
  S0006: { message: '消息格式错误', level: 'error' },

  // 进程级 (Pxxxx)
  P0001: { message: '进程不存在', level: 'warning' },
  P0002: { message: '进程权限不足', level: 'error' },
  P0003: { message: '进程已挂起', level: 'warning' },
  P0004: { message: '无法结束系统进程', level: 'error' },

  // 终端级 (Txxxx)
  T0001: { message: '命令执行超时', level: 'warning' },
  T0002: { message: '命令不存在', level: 'error' },
  T0003: { message: '命令执行被拒绝', level: 'error' },

  // AI级 (Axxxx)
  A0001: { message: 'AI 服务不可用', level: 'error' },
  A0002: { message: 'AI 请求超时', level: 'warning' },
  A0003: { message: 'AI 响应格式错误', level: 'error' },

  // 文件级 (Fxxxx)
  F0001: { message: '文件不存在', level: 'info' },
  F0002: { message: '文件权限不足', level: 'error' },
  F0003: { message: '磁盘空间不足', level: 'error' },
} as const;
```

### 错误级别

| 级别 | 说明 | 处理方式 |
|------|------|---------|
| `info` | 提示信息 | 记录日志，用户告知 |
| `warning` | 警告 | 记录日志，可能需要处理 |
| `error` | 错误 | 记录日志，必须处理 |

---

## 5. 日志规范

### 结构化日志格式

```typescript
// main/utils/Logger.ts

interface LogEntry {
  timestamp: string;         // ISO 8601 格式
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  requestId?: string;        // 请求追踪ID
  service?: string;         // 服务名称
  action?: string;           // 操作名称
  message: string;
  data?: unknown;
  stack?: string;
  processingTime?: number;
}
```

### 日志级别

| 级别 | 用途 | 示例 |
|------|------|------|
| DEBUG | 调试信息 | 函数入口、参数 |
| INFO | 正常流程 | 服务启动、请求完成 |
| WARN | 警告信息 | 超时重试、非致命错误 |
| ERROR | 错误信息 | 服务异常、请求失败 |

### 日志保留

- 内存中保留最近 **10000 条**
- 生产环境应写入文件

---

## 6. 健康监控规范

### 服务健康状态

| 状态 | 说明 | 触发条件 |
|------|------|---------|
| `healthy` | 健康 | 错误率 < 5% |
| `degraded` | 降级 | 5% < 错误率 < 10% |
| `failed` | 失败 | 错误率 > 10% 或 15s 无心跳 |

### 心跳机制

| 参数 | 值 | 说明 |
|------|-----|------|
| `heartbeatInterval` | 5000ms | 心跳检测间隔 |
| `staleThreshold` | 15000ms | 无心跳判定为 stale |

---

# 设计规范

## 配色方案

| 变量 | 色值 | 用途 |
|-----|------|------|
| `--bg-dark` | `#0a0a0a` | 主背景 |
| `--bg-darker` | `#050505` | 标题栏/侧边栏 |
| `--bg-card` | `#111111` | 卡片背景 |
| `--accent-pink` | `#ff9a9e` | 主题粉（樱花粉） |
| `--accent-pink-light` | `#ffc4c7` | 浅粉 |
| `--text-primary` | `#ffffff` | 主文字 |
| `--text-secondary` | `#666666` | 次要文字 |

## 字体

- **UI 文字**：Inter (400/500/600/700)
- **终端/代码**：JetBrains Mono (400/500)

## 图标

- 使用内联 SVG 图标，完全离线可用
- 图标风格：简约线性，stroke-based

## 界面布局

```
┌─────────────────────────────────────────────────────────────┐
│ [Logo] 仪表盘 进程 端口 环境变量 工具    [头像] [窗口控制] │
├────┬────────────────────────────────────────────┬──────────┤
│    │  [雫头像] 雫的电脑管家                    │ 设备信息  │
│    │  ┌─────────────────────────────────────┐  │ 快捷操作  │
│    │  │        AI 对话区域                   │  │ 快速命令  │
│    │  └─────────────────────────────────────┘  │          │
│    │  ┌───────────┐ ┌─────────────────────┐  │          │
│    │  │ 实时占用  │ │    手动终端          │  │          │
│    │  │ CPU/GPU   │ │ PowerShell / CMD    │  │          │
├────┴──┴───────────┴─┴─────────────────────┴──┴──────────┤
│ 进程          │ 端口            │ 环境变量              │
├─────────────────────────────────────────────────────────────┤
│ 雫在线 │ 病毒防护 │ WiFi │ C:68GB D:820GB │ 15:30 │
└─────────────────────────────────────────────────────────────┘
```

---

# 已完成

- [x] **UI 设计稿** (index_v3.html)
- [x] **架构设计** (分层 + 服务化 + IPC)
- [x] **设计哲学文档化**

# 下一步

- [ ] 初始化 Electron 项目
- [ ] 实现核心模块 (ServiceManager, IpcDispatcher)
- [ ] 实现服务接口

---

# 技术栈

| 用途 | 技术 |
|-----|------|
| 框架 | Electron |
| UI | React + TypeScript |
| 系统信息 | systeminformation |
| AI | MiniMax API / MCP |
| 状态管理 | Zustand |
| 打包 | electron-builder |

---

**Made with love by 猫羽雫狂热爱好者**

**Powered by MiniMax MCP & Claude**
