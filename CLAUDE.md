# NachoNya! - 猫羽雫的 AI 电脑管家

> 超级可爱的智能电脑维护助手，用 AI 的力量守护你的电脑

## 角色设定

**猫羽雫 (Shizuku)** - 住在电脑里的 AI 猫娘管家
- 头像：粉色系可爱猫耳少女
- 性格：温柔、可靠、有点小迷糊但很能干
- 使命：守护主人电脑、清理垃圾、整理文件、监测健康

## 项目状态

**当前阶段**：界面设计完成 (UI Mockup)

## 设计规范

### 配色方案
| 变量 | 色值 | 用途 |
|-----|------|------|
| `--bg-dark` | `#0a0a0a` | 主背景 |
| `--bg-darker` | `#050505` | 标题栏/侧边栏 |
| `--bg-card` | `#111111` | 卡片背景 |
| `--accent-pink` | `#ff9a9e` | 主题粉（樱花粉） |
| `--accent-pink-light` | `#ffc4c7` | 浅粉 |
| `--text-primary` | `#ffffff` | 主文字 |
| `--text-secondary` | `#666666` | 次要文字 |

### 字体
- **UI 文字**：Inter (400/500/600/700)
- **终端/代码**：JetBrains Mono (400/500)

### 图标
- 使用内联 SVG 图标，完全离线可用
- 图标风格：简约线性，stroke-based
- 主题色图标使用 `--accent-pink`

## 界面布局

```
┌─────────────────────────────────────────────────────────────┐
│ [Logo] 仪表盘 进程 端口 环境变量 工具    [头像] [窗口控制] │  <- 标题栏 36px
├────┬────────────────────────────────────────────┬──────────┤
│ 📊 │  [雫头像] 雫的电脑管家                    │ 设备信息  │
│ 📋 │  ┌─────────────────────────────────────┐  │ 快捷操作  │
│ 🌐 │  │        AI 对话区域                   │  │ 快速命令  │
│ ⚙️ │  │                                     │  │          │
│ 🔧 │  └─────────────────────────────────────┘  │          │
│    │  ┌───────────┐ ┌─────────────────────┐  │          │
│ 🤖 │  │ 实时占用  │ │    手动终端          │  │          │
│ 🐱 │  │ CPU/GPU   │ │ PowerShell / CMD    │  │          │
├────┴──┴───────────┴─┴─────────────────────┴──┴──────────┤
│ 进程          │ 端口            │ 环境变量              │  <- 底部 200px
├─────────────────────────────────────────────────────────────┤
│ 🐱 雫在线 │ 病毒防护 │ WiFi │ C:68GB D:820GB │ 15:30 │  <- 状态栏 24px
└─────────────────────────────────────────────────────────────┘
```

## 已完成功能 (UI)

- [x] **VS Code 风格布局**
  - 标题栏 + 活动栏 + 主内容区 + 右侧面板 + 状态栏
  - 深色主题 + 樱花粉点缀

- [x] **猫羽雫头像** - 所有头像位置使用本地图片
  - `assets/images/shizuku.png`

- [x] **AI 对话区域** - 左侧主区域
  - 消息列表 + 输入框 + 发送按钮
  - 支持自然语言交互

- [x] **手动终端** - PowerShell / CMD 切换
  - 实时输入输出
  - 光标闪烁动画

- [x] **实时监控面板**
  - CPU 使用率 + 进度条
  - GPU 使用率 + 进度条
  - 内存使用率 + 进度条
  - 磁盘使用率 + 进度条

- [x] **硬件规格展示**
  - CPU 型号
  - GPU 型号
  - 内存大小
  - 主机名/用户名

- [x] **进程管理** - 进程名/PID/内存

- [x] **网络端口** - 地址/协议/进程

- [x] **环境变量** - PATH/TEMP/JAVA_HOME 等

- [x] **设备信息** - 主板/显示器/硬盘/电池

- [x] **快捷操作按钮**
  - 清理垃圾
  - 查找重复
  - 磁盘分析

- [x] **快速命令** - systeminfo/tasklist/netstat 等

- [x] **状态栏**
  - 樱花粉渐变背景
  - 雫在线指示
  - 网络/存储状态
  - 时间

## TODO

### 高优先级
- [ ] **Electron 项目结构搭建**
  - main process (Node.js)
  - preload scripts
  - renderer process (React)

- [ ] **系统信息获取**
  - `systeminformation` npm 包获取真实硬件数据
  - CPU/GPU/RAM/Disk 实时监控

- [ ] **进程管理**
  - 实时进程列表
  - 结束进程功能

- [ ] **网络端口监控**
  - `netstat` 解析
  - 端口占用分析

- [ ] **环境变量读取**
  - 用户环境变量
  - 系统环境变量

### 中优先级
- [ ] **终端功能**
  - PowerShell/CMD 集成
  - 命令执行与输出流

- [ ] **AI 对话功能**
  - MiniMax API 集成
  - MCP 工具调用

- [ ] **快捷操作实现**
  - 垃圾清理
  - 重复文件查找
  - 磁盘分析

### 低优先级
- [ ] **数据持久化**
  - electron-store 配置存储
  - 聊天历史

- [ ] **系统托盘**
  - 最小化到托盘
  - 托盘菜单

- [ ] **设置页面**
  - 开机启动
  - 主题定制
  - API 配置

## 技术栈

| 用途 | 技术 |
|-----|------|
| 框架 | Electron |
| UI | HTML + CSS + Vanilla JS |
| 字体 | Inter + JetBrains Mono (Google Fonts) |
| 图标 | 内联 SVG |
| 系统信息 | Node.js child_process / systeminformation |
| AI | MiniMax API / MCP |
| 状态管理 | electron-store |
| 打包 | electron-builder |

## 文件结构

```
NachoNya/
├── CLAUDE.md           # 本文件
├── index_v3.html       # 主界面 (当前设计稿)
├── assets/
│   └── images/
│       └── shizuku.png # 猫羽雫头像
└── README.md           # 项目说明
```

## 参考资料

- [VS Code 界面布局](https://code.visualstudio.com/api/getstarted/settings)
- [Electron 文档](https://www.electronjs.org/docs)
- [Lucide 图标库](https://lucide.dev/) (SVG 图标参考)
- [Spotify 深色主题配色](https://developer.spotify.com/documentation/design)

---

**Made with love by 猫羽雫狂热爱好者**

**Powered by MiniMax MCP & Claude**
