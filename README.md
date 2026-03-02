# Cocos Framework Plugin

> Cocos Creator 基础框架管理插件 —— 在编辑器内管理 [cocos-framework](../cocos-framework) 的初始化、版本更新和发布。

---

## 📌 简介

本仓库是 **Cocos Creator 编辑器扩展插件**，为所有引入 `cocos-framework` 的项目提供可视化的框架管理能力。

插件以 **Git Submodule** 的方式安装到各项目的 `extensions/framework-plugin/` 目录下。

```
三个独立 Git 仓库的关系：

┌─────────────────────────┐
│  cocos-framework        │  ← 纯框架代码
│  (脚本/组件/预制体/资源) │
└────────────┬────────────┘
             │ Submodule → assets/framework/
             │
┌────────────┼─────────────────────────────────┐
│            ▼                                  │
│  各项目 (平台大厅 / 子游戏 / framework-dev)   │
│  ├── assets/framework/  → Submodule           │
│  └── extensions/framework-plugin/ → Submodule │
│                                               │
└────────────┬──────────────────────────────────┘
             │ Submodule → extensions/framework-plugin/
┌────────────┴────────────┐
│  cocos-framework-plugin │  ← 本仓库：编辑器插件
└─────────────────────────┘
```

---

## 🚀 安装方式

### 一键安装（推荐）

在项目根目录执行安装脚本，自动完成框架和插件的引入：

```bash
curl -fsSL https://raw.githubusercontent.com/XY-TEAM-2023/cocos-framework-plugin/main/install.sh | bash
```

### 手动安装

```bash
# 1. 将插件作为子模块添加到项目的 extensions 目录
git submodule add git@github.com:XY-TEAM-2023/cocos-framework-plugin.git extensions/framework-plugin

# 2. 提交
git add .gitmodules extensions/framework-plugin
git commit -m "feat: 添加 framework 编辑器插件"
```

安装完成后，重新打开 Cocos Creator，插件会自动加载。

---

## 🧩 功能菜单

插件安装后，在 Cocos Creator 菜单栏会出现 **Framework** 菜单：

```
┌─────────────────────────────────────────────┐
│  文件  编辑  节点  面板  [Framework ▼]  ...  │
│                          │                  │
│                          ├── 初始化框架       │  ← 所有项目
│                          ├── 检查更新         │
│                          ├── 更新框架         │
│                          ├── 切换版本         │
│                          ├── 当前版本信息      │
│                          ├── 更新插件         │
│                          ├── ──────────────  │
│                          └── 推送框架版本 🚀   │  ← 仅 dev 项目
└─────────────────────────────────────────────┘
```

### 功能详情

| 菜单项          | 功能说明                                    | 可见范围    |
| --------------- | ------------------------------------------- | ----------- |
| 初始化框架      | 为新项目添加 framework 子模块（含版本选择） | 所有项目    |
| 检查更新        | 对比本地框架版本与远程最新 Tag              | 所有项目    |
| 更新框架        | 拉取远程并切换到指定版本                    | 所有项目    |
| 切换版本        | 在可用的 Tag 版本间切换                     | 所有项目    |
| 当前版本信息    | 查看当前使用的框架版本                      | 所有项目    |
| 更新插件        | 拉取插件仓库最新代码，更新自身              | 所有项目    |
| 推送框架版本 🚀 | 提交变更、打 Tag、推送到远程仓库            | 仅 dev 项目 |

---

## 📋 功能说明

### 初始化框架

> 面向尚未引入框架的新项目。

```
点击 [Framework] → [初始化框架]
    │
    ▼
插件检查项目是否已有 framework 子模块
    │
    ├── 已存在 → 提示 "框架已初始化，当前版本：v1.2.0"
    │
    └── 不存在 → 弹出配置面板
          ┌───────────────────────────────────┐
          │  Framework 初始化                   │
          │                                   │
          │  仓库地址：[git@xxx/framework.git] │  ← 可配置，有默认值
          │  安装路径：[assets/framework     ] │  ← 默认值
          │  选择版本：[▼ v1.3.0 (latest)    ] │  ← 列出所有 Tag
          │                                   │
          │          [取消]  [确认初始化]       │
          └───────────────────────────────────┘
              │
              ▼ 确认
          插件执行：
          ├── 1. git submodule add 到指定路径
          ├── 2. 切换到选定的版本 Tag
          ├── 3. 刷新 Cocos 编辑器资源数据库
          └── 4. 提示 "初始化完成 ✅ 框架 v1.3.0 已就绪"
```

### 检查更新

```
点击 [Framework] → [检查更新]
    │
    ▼
插件自动执行：
    │
    ├── 读取当前子模块指向的 tag → 当前版本：v1.2.0
    ├── 从远程仓库获取最新 tag   → 最新版本：v1.3.1
    │
    ▼
对比版本
    │
    ├── 已是最新 → 提示 "当前已是最新版本 v1.3.1 ✅"
    │
    └── 有新版本 → 弹出更新信息面板
          ┌──────────────────────────────────┐
          │  发现新版本！                       │
          │                                  │
          │  当前版本：v1.2.0                  │
          │  最新版本：v1.3.1                  │
          │                                  │
          │  更新日志：                        │
          │  ├── v1.3.1 - 修复弹窗组件 bug     │
          │  ├── v1.3.0 - 新增支付模块         │
          │  └── v1.2.1 - 优化网络层性能        │
          │                                  │
          │      [暂不更新]  [立即更新]         │
          └──────────────────────────────────┘
```

### 更新框架

```
点击 [立即更新] 或 [Framework] → [更新框架]
    │
    ▼
选择目标版本
┌──────────────────────────────┐
│  更新到：                     │
│  ○ 最新版本 v1.3.1            │
│  ○ 选择版本 [▼ v1.3.0      ] │
│                              │
│       [取消]  [开始更新]      │
└──────────────────────────────┘
    │
    ▼ 开始更新
插件执行：
    ├── 1. git fetch 拉取远程最新数据
    ├── 2. git checkout 切换子模块到目标版本 Tag
    ├── 3. 刷新 Cocos 编辑器资源数据库
    └── 4. 提示 "更新完成 ✅ 已更新到 v1.3.1"
```

### 更新插件

```
点击 [Framework] → [更新插件]
    │
    ▼
插件执行：
    ├── 1. cd extensions/framework-plugin
    ├── 2. git fetch origin
    ├── 3. git checkout latest tag / main
    ├── 4. 回到项目根目录
    ├── 5. git add extensions/framework-plugin
    └── 6. 提示 "插件已更新到最新版本 ✅ 重启编辑器生效"
```

### 推送框架版本 🚀

> 仅当项目目录名为 `cocos-framework-dev` 时显示。

```
点击 [Framework] → [推送框架版本 🚀]
    │
    ▼
插件检查 assets/framework/ 子模块状态
    │
    ├── 没有未提交的变更 → 提示 "没有可推送的变更"
    │
    └── 有变更 → 弹出发版面板
          ┌──────────────────────────────────────┐
          │  推送框架版本                           │
          │                                      │
          │  当前版本：v1.2.0                      │
          │                                      │
          │  变更文件：                             │
          │  ├── M  scripts/managers/UIManager.ts │
          │  ├── A  scripts/managers/PayManager.ts │
          │  └── M  prefabs/BasePopup.prefab      │
          │                                      │
          │  版本类型：                             │
          │  ○ 补丁版本 (patch) - 修 bug           │
          │  ● 次版本 (minor) - 新功能             │
          │  ○ 主版本 (major) - 破坏性变更          │
          │                                      │
          │  新版本号：[v1.3.0            ]       │
          │  (自动建议，可手动修改)                  │
          │                                      │
          │  更新说明：                             │
          │  ┌──────────────────────────────────┐ │
          │  │ feat: 新增支付模块                 │ │
          │  │ fix: 修复弹窗动画卡顿              │ │
          │  └──────────────────────────────────┘ │
          │                                      │
          │         [取消]  [推送发布]             │
          └──────────────────────────────────────┘
              │
              ▼ 确认推送
          插件自动执行：
              ├── 1. cd assets/framework
              ├── 2. git add .
              ├── 3. git commit -m "<更新说明>"
              ├── 4. git tag -a <版本号> -m "<更新说明>"
              ├── 5. git push origin main --tags
              ├── 6. 回到项目根目录
              ├── 7. git add assets/framework
              └── 8. git commit -m "chore: 更新 framework 到 <版本号>"
              │
              ▼
          提示 "框架 <版本号> 已发布 ✅"
```

---

## 🔧 插件目录结构

```
cocos-framework-plugin/ (本仓库)
├── package.json               ← Cocos 插件描述文件
├── src/
│   ├── main.ts                ← 插件入口
│   ├── panels/                ← 面板 UI
│   │   ├── init-panel.ts      ← 初始化面板
│   │   ├── update-panel.ts    ← 更新面板
│   │   └── publish-panel.ts   ← 推送发版面板
│   ├── commands/              ← 命令实现
│   │   ├── init.ts            ← 初始化框架
│   │   ├── check-update.ts    ← 检查更新
│   │   ├── update.ts          ← 更新框架
│   │   ├── switch-version.ts  ← 切换版本
│   │   ├── update-plugin.ts   ← 更新插件自身
│   │   └── publish.ts         ← 推送框架版本
│   └── utils/
│       ├── git.ts             ← Git 操作封装
│       ├── version.ts         ← 版本号解析和比较
│       └── config.ts          ← 配置管理
├── i18n/
│   ├── zh.ts                  ← 中文
│   └── en.ts                  ← 英文
├── install.sh                 ← 一键安装脚本
└── README.md                  ← 本文件
```

---

## 📝 插件配置

插件支持通过项目根目录的 `.framework.json` 配置文件自定义行为：

```json
{
  "frameworkRepo": "git@github.com:XY-TEAM-2023/cocos-framework.git",
  "frameworkPath": "assets/framework",
  "pluginRepo": "git@github.com:XY-TEAM-2023/cocos-framework-plugin.git",
  "pluginPath": "extensions/framework-plugin"
}
```

> 如不存在此文件，插件使用内置默认值。

---

## 🛠 插件开发指南

### 开发环境

1. 在 `cocos-framework-dev` 项目中，本插件已作为 Submodule 存在于 `extensions/framework-plugin/`
2. 直接在该目录下修改代码，Cocos Creator 会自动检测变更
3. 重新加载插件：**扩展 → 扩展管理器 → 刷新**

### 构建

```bash
cd extensions/framework-plugin
npm install
npm run build
```

### 调试

在 Cocos Creator 中，打开 **开发者工具**（Ctrl+Shift+I / Cmd+Option+I）查看控制台输出。

### 发版

```bash
cd extensions/framework-plugin
git add .
git commit -m "feat: 新增 xxx 功能"
git tag -a v1.1.0 -m "feat: 新增 xxx 功能"
git push origin main --tags
```

各项目通过菜单 **Framework → 更新插件** 即可获取最新版本。

---

## 📎 相关仓库

| 仓库                                              | 说明                       |
| ------------------------------------------------- | -------------------------- |
| **[cocos-framework](../cocos-framework)**         | 基础框架代码               |
| **[cocos-framework-dev](../cocos-framework-dev)** | 框架开发专用 Cocos 项目    |
| **cocos-framework-plugin** (本仓库)               | 编辑器插件（框架管理工具） |

---

## 📄 License

本项目为公司内部项目，未经授权不得对外公开或分发。
