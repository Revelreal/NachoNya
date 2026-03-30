# NachoNya! - 猫羽雫的 AI 电脑管家

> 超级可爱的智能电脑维护助手，用 AI 的力量守护你的电脑

## 角色设定

**猫羽雫 (Shizuku)** - 住在电脑里的 AI 猫娘管家
- 头像：粉色系可爱猫耳少女 (shizuku.png)
- 性格：温柔、可靠、有点小迷糊但很能干
- 使命：守护主人电脑、清理垃圾、整理文件、监测健康

## 项目状态

**当前阶段**：核心框架完成，功能开发中

---

## 已完成 ✅

### 1. 项目骨架
- [x] Electron 主进程 / Preload / Renderer 三层架构
- [x] TypeScript 编译配置 (tsconfig.json)
- [x] npm 依赖安装 (electron, systeminformation, uuid 等)
- [x] electron-builder 打包配置

### 2. 服务层 (AUTOSAR 风格)
- [x] `IService` 标准接口定义
- [x] `ServiceManager` 服务管理器
- [x] `SystemInfoService` - CPU/内存/磁盘/GPU 信息获取
- [x] `ProcessService` - 进程列表/结束/端口管理
- [x] `Logger` 结构化日志系统
- [x] 错误码体系 (ISO 14229 风格)

### 3. IPC 通信层
- [x] 统一消息格式 (IpcMessage / IpcResponse)
- [x] `service:execute` 通用服务调用
- [x] `service:list` 服务列表查询
- [x] `window:minimize/maximize/close` 窗口控制
- [x] preload 路径问题修复 (使用 app.getAppPath)
- [x] sandbox 模式关闭确保 contextBridge 正常工作

### 4. UI 界面 (index_v3.html)
- [x] macOS 风格三色窗口控制按钮 (红黄绿圆点)
- [x] 无边框窗口 + 可拖拽标题栏
- [x] 樱花粉主题配色
- [x] 左侧活动栏 (图标导航)
- [x] 顶栏 - 猫羽雫头像 + 硬件规格
- [x] 中间 - AI 对话区域 + 手动终端
- [x] 底边栏 - 渐变粉色状态栏 (加厚到 32px)
- [x] 所有图标使用内联 SVG (离线可用)
- [x] Lucide 图标内联化

### 5. 系统监控 UI
- [x] CPU/内存/GPU/磁盘 进度条
- [x] 史莱姆弹跳动画效果 (cubic-bezier 弹性曲线)
- [x] 颜色警告机制 (绿→黄→70%→红→90%)
- [x] 每 3 秒自动更新数据
- [x] 调用 SystemInfoService 获取实时数据

### 6. 窗口控制
- [x] 红/黄/绿三色按钮正常工作
- [x] 关闭、最小化、最大化功能正常

---

## 进行中 🔄

### 系统监控
- [ ] GPU 温度显示
- [ ] 进程列表展示
- [ ] 端口监控展示

### AI 对话功能
- [ ] MiniMax API 集成
- [ ] MCP (Model Context Protocol) 工具调用
- [ ] AI 回复展示

---

## 待开发 TODO

### 核心功能
- [ ] TerminalService - 终端命令执行
- [ ] FileService - 文件扫描/清理
- [ ] PortService - 端口监控
- [ ] AiService - AI 对话服务

### UI 功能
- [ ] 进程管理面板 (列表/详情/结束进程)
- [ ] 端口监控面板 (列表/占用端口/结束)
- [ ] 环境变量查看
- [ ] 快捷操作面板 (垃圾清理/一键加速)
- [ ] 设置页面 (MCP 配置/主题切换)

### AI 功能
- [ ] MiniMax TTS 文字转语音 (雫会说话)
- [ ] MiniMax 图片生成 (生成雫的新头像/壁纸)
- [ ] 视频生成集成
- [ ] 音乐生成集成

### 系统功能
- [ ] 系统托盘图标
- [ ] 开机自启
- [ ] 通知推送
- [ ] 自动更新

---

## 设计规范

### 配色方案

| 变量 | 色值 | 用途 |
|-----|------|------|
| `--bg-dark` | `#0a0a0a` | 主背景 |
| `--bg-darker` | `#050505` | 标题栏/侧边栏 |
| `--bg-card` | `#111111` | 卡片背景 |
| `--bg-input` | `#1a1a1a` | 输入框背景 |
| `--accent-pink` | `#ff9a9e` | 主题粉（樱花粉） |
| `--accent-pink-light` | `#ffc4c7` | 浅粉 |
| `--accent-pink-glow` | `rgba(255,154,158,0.2)` | 发光效果 |
| `--text-primary` | `#ffffff` | 主文字 |
| `--text-secondary` | `#666666` | 次要文字 |
| `--text-muted` | `#3a3a3a` | 弱化文字 |
| `--terminal-green` | `#4ade80` | 终端成功 |
| `--terminal-blue` | `#60a5fa` | 终端信息 |
| `--terminal-red` | `#f87171` | 终端错误 |
| `--terminal-yellow` | `#fbbf24` | 终端警告 |

### 字体
- **UI 文字**：Inter (400/500/600/700)
- **终端/代码**：JetBrains Mono (400/500)

### 界面布局

```
┌─────────────────────────────────────────────────────────────────┐
│ 🐱 NachoNya! │ 仪表盘 │ 进程 │ 端口 │ ... │ [雫头像] ●●● │
├────┬──────────────────────────────────────────────────────┬──────┤
│ 🏠 │  [雫头像] 雫的电脑管家                   CPU ████░░ 45% │
│ 🧹 │  你好主人，雫在这里守护你的电脑           内存 ██████ 68% │
│ 🔍 │                                                GPU ███░░ 32% │
│ ⚙️ │  ┌─────────────────────────────────────────┐ 磁盘 ██░░░ 23% │
│    │  │           AI 对话区域                    │           │
│    │  │                                              │           │
│    │  │                                              │           │
│    │  └─────────────────────────────────────────┘           │
│    │  ┌─────────────────────────────────────────────────────┐ │
│    │  │              手动终端                               │ │
│    │  └─────────────────────────────────────────────────────┘ │
├────┴──────────────────────────────────────────────────────────┤
│ ● 雫在线 │ 🛡️ 病毒防护 │ 🌐 已连接 │ C:68GB D:820GB │ 15:30 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技术栈

| 用途 | 技术 |
|-----|------|
| 框架 | Electron 32.x |
| 语言 | TypeScript (strict mode) |
| 系统信息 | systeminformation |
| UUID | uuid v4 |
| 打包 | electron-builder |
| AI | MiniMax API / MCP |

---

## 目录结构

```
src/
├── main/
│   ├── index.ts              # 主进程入口 (~180行)
│   ├── core/
│   │   └── ServiceManager.ts # 服务管理器
│   ├── services/
│   │   ├── SystemInfoService.ts  # 系统信息 (~280行)
│   │   └── ProcessService.ts     # 进程管理 (~270行)
│   └── utils/
│       └── Logger.ts         # 结构化日志
├── preload/
│   └── index.ts             # 预加载脚本，暴露 nachoApi
├── shared/
│   ├── interfaces/
│   │   ├── service.interface.ts   # IService 接口
│   │   └── ipc/
│   │       └── message.interface.ts  # IPC 消息格式
│   └── constants/
│       └── error-codes.ts   # 错误码定义
└── renderer/ (HTML/CSS/JS)
    └── index_v3.html        # 主界面 (含内联 CSS/JS)
```

---

## API 服务清单

| 服务名 | 动作 | 说明 |
|-------|------|------|
| `SystemInfoService` | `getCpu` | CPU 信息 |
| | `getMemory` | 内存信息 |
| | `getDisks` | 磁盘信息 |
| | `getGpus` | GPU 信息 |
| | `getAll` | 全部信息 |
| | `getOsInfo` | 操作系统信息 |
| `ProcessService` | `listProcesses` | 进程列表 |
| | `getProcess` | 单个进程 |
| | `killProcess` | 结束进程 |
| | `listPorts` | 端口列表 |
| | `killPort` | 结束端口占用 |
| `WindowService` | `minimize` | 最小化 |
| | `maximize` | 最大化/还原 |
| | `close` | 关闭窗口 |

---

## 已知问题 / 坑

1. **npm 安装问题** - node_modules/electron 可能被进程锁住，需先 kill 进程后删目录
2. **cnpm 不稳定** - 推荐用 npm + 国内镜像
3. **preload 路径** - 使用 `app.getAppPath()` 而不是 `__dirname`
4. **sandbox 模式** - 必须设为 `false` 否则 contextBridge 不工作
5. **Vite 未集成** - 目前 dev 用 `electron .` 直接启动，无热更新

---

## 分支信息

- 当前分支：`master`
- 主分支：`master`

---

**Made with love by 猫羽雫狂热爱好者**

**Powered by MiniMax MCP & Claude**
