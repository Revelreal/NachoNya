# 🐱 NachoNya! - 猫羽雫的 AI 电脑管家

> 超级可爱的智能电脑维护助手，用 AI 的力量守护你的电脑

## 雫的承诺

- 🧹 定期清理电脑垃圾，拯救 C盘
- 📁 整理桌面文件，让桌面井井有条
- 🌡️ 监测电脑温度，健康使用
- 🔍 查找重复文件，节省空间
- 🤖 AI 加持，智能又可爱

## 功能规划

### 核心功能（v1.0）
- [ ] **垃圾清理** - 临时文件、缓存文件、日志文件
- [ ] **C盘空间分析** - 可视化展示空间占用
- [ ] **桌面文件整理** - 按类型/日期自动分类
- [ ] **重复文件查找** - 按 hash 比对

### 监控功能（v1.0）
- [ ] **温度监测** - CPU/GPU/硬盘温度
- [ ] **空间看板** - 磁盘使用饼图
- [ ] **开机时间** - 分析启动项

### AI 功能（v2.0）
- [ ] **MCP 服务** - 图片理解、联网搜索
- [ ] **自然语言控制** - "帮我清理C盘"
- [ ] **智能建议** - AI 自动推荐维护操作

## 技术栈

| 用途 | 技术 |
|-----|------|
| 框架 | Electron + React + TypeScript |
| UI | Tailwind CSS + Framer Motion |
| 打包 | electron-builder |
| MCP | @modelcontextprotocol/sdk |
| 状态管理 | Zustand |

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 打包
npm run build
```

## 界面风格

- 参考 Spotify 深色主题
- 猫羽雫主题粉色系点缀
- 可爱的动画效果

## 项目结构

```
nacho-nya/
├── electron/
│   ├── main.ts          # 主进程
│   ├── preload.ts       # 预加载
│   └── services/        # 系统服务
├── src/
│   ├── components/      # React 组件
│   ├── pages/           # 页面
│   ├── stores/          # Zustand 状态
│   └── styles/          # 样式
└── package.json
```

---

**Made with 💕 by 猫羽雫狂热爱好者**

**Powered by MiniMax MCP & Claude**
