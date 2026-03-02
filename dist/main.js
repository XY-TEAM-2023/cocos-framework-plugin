"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unload = exports.load = exports.methods = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// ==================== Git 工具函数 ====================
/**
 * 执行 shell 命令并返回输出
 */
function runCommand(cmd, cwd) {
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)(cmd, { cwd, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            }
            else {
                resolve(stdout.trim());
            }
        });
    });
}
/**
 * 获取项目根目录
 */
function getProjectPath() {
    return Editor.Project.path;
}
/**
 * 获取框架子模块路径
 */
function getFrameworkPath() {
    return path.join(getProjectPath(), 'assets', 'framework');
}
/**
 * 获取插件路径
 */
function getPluginPath() {
    return path.join(getProjectPath(), 'extensions', 'framework-plugin');
}
/**
 * 判断是否为 dev 项目
 */
function isDevProject() {
    const projectDir = path.basename(getProjectPath());
    return projectDir === 'cocos-framework-dev';
}
/**
 * 检查框架子模块是否存在
 */
function frameworkExists() {
    const fwPath = getFrameworkPath();
    return fs.existsSync(path.join(fwPath, '.git'));
}
/**
 * 获取当前版本（Tag 或 commit hash）
 */
async function getCurrentVersion(repoPath) {
    try {
        return await runCommand('git describe --tags --exact-match 2>/dev/null', repoPath);
    }
    catch (_a) {
        try {
            const hash = await runCommand('git rev-parse --short HEAD', repoPath);
            return `${hash} (未标记版本)`;
        }
        catch (_b) {
            return '未知';
        }
    }
}
/**
 * 获取远程最新稳定版本 Tag
 */
async function getLatestTag(repoPath) {
    try {
        await runCommand('git fetch --tags', repoPath);
        const tags = await runCommand("git tag -l 'v*' --sort=-version:refname", repoPath);
        const stableTags = tags.split('\n').filter(t => /^v\d+\.\d+\.\d+$/.test(t));
        return stableTags.length > 0 ? stableTags[0] : null;
    }
    catch (_a) {
        return null;
    }
}
/**
 * 获取所有可用版本 Tag
 */
async function getAllTags(repoPath) {
    try {
        await runCommand('git fetch --tags', repoPath);
        const tags = await runCommand("git tag -l 'v*' --sort=-version:refname", repoPath);
        return tags.split('\n').filter(t => t.trim() !== '');
    }
    catch (_a) {
        return [];
    }
}
// ==================== 日志面板控制 ====================
/**
 * 打开日志面板并追加日志
 */
async function log(message, type = 'info') {
    const prefix = '[框架管理]';
    switch (type) {
        case 'success':
            console.log(`${prefix} ✅ ${message}`);
            break;
        case 'warn':
            console.warn(`${prefix} ⚠️ ${message}`);
            break;
        case 'error':
            console.error(`${prefix} ❌ ${message}`);
            break;
        default:
            console.log(`${prefix} ${message}`);
    }
    try {
        Editor.Message.send('framework-plugin', 'append-log', JSON.stringify({ message, type, time: new Date().toLocaleTimeString() }));
    }
    catch (e) {
        // 面板可能未打开，忽略
    }
}
// ==================== 插件入口 ====================
exports.methods = {
    /**
     * 打开日志面板
     */
    openLogPanel() {
        Editor.Panel.open('framework-plugin.log');
    },
    /**
     * 更新框架（同时更新框架和插件）
     */
    async updateFramework() {
        Editor.Panel.open('framework-plugin.log');
        await log('========== 更新框架和插件 ==========');
        const projectPath = getProjectPath();
        const fwPath = getFrameworkPath();
        const pluginPath = getPluginPath();
        // --- 更新框架 ---
        if (frameworkExists()) {
            try {
                const currentVersion = await getCurrentVersion(fwPath);
                await log(`当前框架版本：${currentVersion}`);
                await log('正在拉取框架最新数据...');
                const latestTag = await getLatestTag(fwPath);
                if (latestTag) {
                    const currentTag = currentVersion.startsWith('v') ? currentVersion : null;
                    if (currentTag === latestTag) {
                        await log(`框架已是最新版本 ${latestTag} ✅`, 'success');
                    }
                    else {
                        await runCommand(`git checkout ${latestTag}`, fwPath);
                        await log(`框架已更新：${currentVersion} → ${latestTag}`, 'success');
                    }
                }
                else {
                    await runCommand('git pull origin main', fwPath).catch(() => { });
                    await log('框架已拉取最新代码（无稳定版本 Tag）', 'warn');
                }
            }
            catch (e) {
                await log(`框架更新失败：${e.message}`, 'error');
            }
        }
        else {
            await log('框架子模块不存在，跳过框架更新', 'warn');
        }
        // --- 更新插件 ---
        try {
            const pluginVersion = await getCurrentVersion(pluginPath);
            await log(`当前插件版本：${pluginVersion}`);
            await log('正在拉取插件最新数据...');
            const pluginLatest = await getLatestTag(pluginPath);
            if (pluginLatest) {
                const currentTag = pluginVersion.startsWith('v') ? pluginVersion : null;
                if (currentTag === pluginLatest) {
                    await log(`插件已是最新版本 ${pluginLatest} ✅`, 'success');
                }
                else {
                    await runCommand(`git checkout ${pluginLatest}`, pluginPath);
                    await log(`插件已更新：${pluginVersion} → ${pluginLatest}`, 'success');
                    await log('⚠️ 插件已更新，请重启编辑器使更新生效', 'warn');
                }
            }
            else {
                await runCommand('git pull origin main', pluginPath).catch(() => { });
                await log('插件已拉取最新代码', 'success');
            }
        }
        catch (e) {
            await log(`插件更新失败：${e.message}`, 'error');
        }
        // --- 刷新资源 ---
        if (frameworkExists()) {
            await log('正在刷新资源数据库...');
            Editor.Message.send('asset-db', 'refresh-asset', 'db://assets/framework');
        }
        await log('========== 更新完成 ✅ ==========', 'success');
    },
    /**
     * 切换框架版本
     */
    async switchVersion() {
        Editor.Panel.open('framework-plugin.log');
        await log('========== 切换框架版本 ==========');
        if (!frameworkExists()) {
            await log('框架子模块不存在', 'error');
            Editor.Dialog.error('框架子模块不存在\n请先通过安装脚本引入框架。');
            return;
        }
        const fwPath = getFrameworkPath();
        try {
            const tags = await getAllTags(fwPath);
            if (tags.length === 0) {
                await log('未找到可用的版本 Tag', 'warn');
                Editor.Dialog.info('未找到可用的版本 Tag');
                return;
            }
            const currentVersion = await getCurrentVersion(fwPath);
            await log(`当前版本：${currentVersion}`);
            await log(`可用版本：${tags.join(', ')}`);
            // 弹出对话框，每个版本一个按钮（最多显示 5 个）
            const displayTags = tags.slice(0, 5);
            const buttons = [...displayTags, '取消'];
            const result = await Editor.Dialog.info(`切换框架版本\n\n当前版本：${currentVersion}\n\n请选择要切换的版本：`, {
                buttons,
                default: 0,
                cancel: buttons.length - 1,
            });
            const selectedIndex = result.response;
            if (selectedIndex < displayTags.length) {
                const targetVersion = displayTags[selectedIndex];
                await log(`正在切换到 ${targetVersion}...`);
                await runCommand(`git checkout ${targetVersion}`, fwPath);
                await log(`已切换到 ${targetVersion}`, 'success');
                await log('正在刷新资源数据库...');
                Editor.Message.send('asset-db', 'refresh-asset', 'db://assets/framework');
                await log(`========== 切换完成 ✅ ==========`, 'success');
                Editor.Dialog.info(`已切换到 ${targetVersion}`);
            }
            else {
                await log('已取消', 'warn');
            }
        }
        catch (e) {
            await log(`切换版本失败：${e.message}`, 'error');
            Editor.Dialog.error(`切换版本失败\n${e.message}`);
        }
    },
    /**
     * 推送框架版本（仅 dev 项目可用）
     */
    async publishFramework() {
        if (!isDevProject()) {
            Editor.Dialog.warn('此功能仅在 cocos-framework-dev 项目中可用');
            return;
        }
        Editor.Panel.open('framework-plugin.log');
        await log('========== 推送框架版本 🚀 ==========');
        if (!frameworkExists()) {
            await log('框架子模块不存在', 'error');
            return;
        }
        const fwPath = getFrameworkPath();
        try {
            // 检查是否有未提交的变更
            const status = await runCommand('git status --porcelain', fwPath);
            if (!status) {
                await log('没有可推送的变更', 'warn');
                Editor.Dialog.info('没有可推送的变更\n框架代码没有修改。');
                return;
            }
            await log('检测到以下变更：');
            const changes = status.split('\n');
            for (const change of changes) {
                await log(`  ${change}`);
            }
            // 获取当前版本
            const currentVersion = await getCurrentVersion(fwPath);
            await log(`当前版本：${currentVersion}`);
            // 弹出确认对话框
            const result = await Editor.Dialog.info(`推送框架版本\n\n当前版本：${currentVersion}\n变更文件：${changes.length} 个\n\n请在提交前确认所有变更已测试通过。\n\n注意：推送后所有引入框架的项目都可以更新到此版本。`, {
                buttons: ['确认推送', '取消'],
                default: 0,
                cancel: 1,
            });
            if (result.response !== 0) {
                await log('已取消推送', 'warn');
                return;
            }
            // 执行推送
            await log('正在提交变更...');
            await runCommand('git add .', fwPath);
            await runCommand('git commit -m "feat: 更新框架"', fwPath);
            await log('变更已提交', 'success');
            await log('正在推送到远程...');
            await runCommand('git push origin main', fwPath);
            await log('推送完成', 'success');
            // 更新宿主项目的子模块指针
            await log('正在更新项目子模块指针...');
            await runCommand('git add assets/framework', getProjectPath());
            await runCommand('git commit -m "chore: 更新 framework"', getProjectPath());
            await log('项目子模块指针已更新', 'success');
            await log('========== 推送完成 ✅ ==========', 'success');
            Editor.Dialog.info('框架推送完成！\n其他项目可以通过「更新框架」获取最新版本。');
        }
        catch (e) {
            await log(`推送失败：${e.message}`, 'error');
            Editor.Dialog.error(`推送失败\n${e.message}`);
        }
    },
    /**
     * 关于（显示版本信息）
     */
    async showAbout() {
        Editor.Panel.open('framework-plugin.log');
        await log('========== 关于 ==========');
        try {
            // 框架版本
            if (frameworkExists()) {
                const fwVersion = await getCurrentVersion(getFrameworkPath());
                const lastCommit = await runCommand('git log -1 --format="%h %s (%ci)"', getFrameworkPath());
                await log(`框架版本：${fwVersion}`);
                await log(`框架路径：${getFrameworkPath()}`);
                await log(`最近提交：${lastCommit}`);
            }
            else {
                await log('框架：未安装', 'warn');
            }
            // 插件版本
            const pluginVersion = await getCurrentVersion(getPluginPath());
            await log(`插件版本：${pluginVersion}`);
            // 项目信息
            await log(`项目路径：${getProjectPath()}`);
            await log(`开发模式：${isDevProject() ? '是（推送功能已启用）' : '否'}`);
            const fwVer = frameworkExists() ? await getCurrentVersion(getFrameworkPath()) : '未安装';
            Editor.Dialog.info(`关于 - 框架管理插件\n\n框架版本：${fwVer}\n插件版本：${pluginVersion}\n开发模式：${isDevProject() ? '是' : '否'}`);
        }
        catch (e) {
            await log(`获取信息失败：${e.message}`, 'error');
        }
    },
};
/**
 * 扩展加载完成后触发
 */
const load = function () {
    console.log('[框架管理] 插件已加载');
    if (isDevProject()) {
        console.log('[框架管理] 当前为开发项目，已启用「推送框架版本」功能');
    }
};
exports.load = load;
/**
 * 扩展卸载完成后触发
 */
const unload = function () {
    console.log('[框架管理] 插件已卸载');
};
exports.unload = unload;
//# sourceMappingURL=main.js.map