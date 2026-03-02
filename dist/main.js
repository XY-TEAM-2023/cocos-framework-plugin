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
    const fs = require('fs-extra');
    const fwPath = getFrameworkPath();
    return fs.existsSync(path.join(fwPath, '.git')) || fs.existsSync(fwPath + '/.git');
}
/**
 * 获取当前框架版本（Tag 或 commit）
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
    // 同时在控制台输出
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
    // 发送到日志面板
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
     * 初始化框架
     */
    async initFramework() {
        Editor.Panel.open('framework-plugin.log');
        await log('========== 初始化框架 ==========');
        if (frameworkExists()) {
            const version = await getCurrentVersion(getFrameworkPath());
            await log(`框架已初始化，当前版本：${version}`, 'warn');
            Editor.Dialog.info(`框架已初始化\n当前版本：${version}`);
            return;
        }
        const projectPath = getProjectPath();
        try {
            await log('正在添加框架子模块...');
            await runCommand('git submodule add git@github.com:XY-TEAM-2023/cocos-framework.git assets/framework', projectPath);
            await log('框架子模块添加成功', 'success');
            // 切换到最新稳定版本
            await log('正在获取最新稳定版本...');
            const latestTag = await getLatestTag(getFrameworkPath());
            if (latestTag) {
                await runCommand(`git checkout ${latestTag}`, getFrameworkPath());
                await log(`已切换到版本 ${latestTag}`, 'success');
            }
            else {
                await log('未找到稳定版本 Tag，保持在默认分支', 'warn');
            }
            // 刷新资源数据库
            await log('正在刷新资源数据库...');
            Editor.Message.send('asset-db', 'refresh-asset', 'db://assets/framework');
            await log('========== 初始化完成 ✅ ==========', 'success');
            Editor.Dialog.info('框架初始化完成！\n请在编辑器中查看 assets/framework 目录。');
        }
        catch (e) {
            await log(`初始化失败：${e.message}`, 'error');
            Editor.Dialog.error(`框架初始化失败\n${e.message}`);
        }
    },
    /**
     * 检查更新
     */
    async checkUpdate() {
        Editor.Panel.open('framework-plugin.log');
        await log('========== 检查框架更新 ==========');
        if (!frameworkExists()) {
            await log('框架未初始化，请先执行「初始化框架」', 'error');
            return;
        }
        try {
            const currentVersion = await getCurrentVersion(getFrameworkPath());
            await log(`当前版本：${currentVersion}`);
            const latestTag = await getLatestTag(getFrameworkPath());
            if (!latestTag) {
                await log('远程仓库未找到稳定版本 Tag', 'warn');
                return;
            }
            await log(`最新版本：${latestTag}`);
            const currentTag = currentVersion.startsWith('v') ? currentVersion : null;
            if (currentTag === latestTag) {
                await log(`当前已是最新版本 ${latestTag} ✅`, 'success');
                Editor.Dialog.info(`当前已是最新版本\n${latestTag}`);
            }
            else {
                await log(`发现新版本：${latestTag}（当前：${currentVersion}）`, 'warn');
                const result = await Editor.Dialog.info(`发现新版本！\n\n当前版本：${currentVersion}\n最新版本：${latestTag}\n\n是否立即更新？`, {
                    buttons: ['立即更新', '暂不更新'],
                    default: 0,
                    cancel: 1,
                });
                if (result.response === 0) {
                    await exports.methods.doUpdateFramework(latestTag);
                }
            }
        }
        catch (e) {
            await log(`检查更新失败：${e.message}`, 'error');
        }
    },
    /**
     * 更新框架
     */
    async updateFramework() {
        Editor.Panel.open('framework-plugin.log');
        await log('========== 更新框架 ==========');
        if (!frameworkExists()) {
            await log('框架未初始化，请先执行「初始化框架」', 'error');
            return;
        }
        try {
            const tags = await getAllTags(getFrameworkPath());
            if (tags.length === 0) {
                await log('未找到可用的版本 Tag', 'warn');
                return;
            }
            const currentVersion = await getCurrentVersion(getFrameworkPath());
            await log(`当前版本：${currentVersion}`);
            await log(`可用版本：${tags.slice(0, 10).join(', ')}${tags.length > 10 ? '...' : ''}`);
            // 默认选择最新版本
            const targetVersion = tags[0];
            const result = await Editor.Dialog.info(`更新框架\n\n当前版本：${currentVersion}\n目标版本：${targetVersion}\n\n是否更新？`, {
                buttons: ['确认更新', '取消'],
                default: 0,
                cancel: 1,
            });
            if (result.response === 0) {
                await exports.methods.doUpdateFramework(targetVersion);
            }
        }
        catch (e) {
            await log(`更新框架失败：${e.message}`, 'error');
        }
    },
    /**
     * 执行框架更新
     */
    async doUpdateFramework(targetVersion) {
        try {
            await log(`正在更新到 ${targetVersion}...`);
            await runCommand('git fetch --tags', getFrameworkPath());
            await runCommand(`git checkout ${targetVersion}`, getFrameworkPath());
            await log(`已切换到 ${targetVersion}`, 'success');
            await log('正在刷新资源数据库...');
            Editor.Message.send('asset-db', 'refresh-asset', 'db://assets/framework');
            await log(`========== 更新完成 ✅ 已更新到 ${targetVersion} ==========`, 'success');
            Editor.Dialog.info(`更新完成！\n已更新到 ${targetVersion}`);
        }
        catch (e) {
            await log(`更新失败：${e.message}`, 'error');
            Editor.Dialog.error(`更新失败\n${e.message}`);
        }
    },
    /**
     * 切换版本
     */
    async switchVersion() {
        Editor.Panel.open('framework-plugin.log');
        await log('========== 切换框架版本 ==========');
        if (!frameworkExists()) {
            await log('框架未初始化，请先执行「初始化框架」', 'error');
            return;
        }
        try {
            const tags = await getAllTags(getFrameworkPath());
            if (tags.length === 0) {
                await log('未找到可用的版本 Tag', 'warn');
                return;
            }
            const currentVersion = await getCurrentVersion(getFrameworkPath());
            await log(`当前版本：${currentVersion}`);
            const tagList = tags.map(t => `  ${t === currentVersion ? '● ' : '  '}${t}${t === tags[0] ? ' (latest)' : ''}`).join('\n');
            await log(`可用版本：\n${tagList}`);
            // 弹出对话框让用户选择
            const result = await Editor.Dialog.info(`切换框架版本\n\n当前版本：${currentVersion}\n\n可用版本：\n${tags.slice(0, 10).join('\n')}\n\n请在控制台输入要切换的版本号`, {
                buttons: ['确定', '取消'],
                default: 0,
                cancel: 1,
            });
            if (result.response === 0 && tags.length > 0) {
                // 默认切换到最新版本
                await exports.methods.doUpdateFramework(tags[0]);
            }
        }
        catch (e) {
            await log(`切换版本失败：${e.message}`, 'error');
        }
    },
    /**
     * 显示当前版本信息
     */
    async showVersion() {
        Editor.Panel.open('framework-plugin.log');
        await log('========== 版本信息 ==========');
        if (!frameworkExists()) {
            await log('框架未安装', 'warn');
            Editor.Dialog.info('框架未安装\n请先执行「初始化框架」');
            return;
        }
        try {
            const version = await getCurrentVersion(getFrameworkPath());
            const fwPath = getFrameworkPath();
            const lastCommit = await runCommand('git log -1 --format="%h %s (%ci)"', fwPath);
            await log(`框架版本：${version}`);
            await log(`框架路径：${fwPath}`);
            await log(`最近提交：${lastCommit}`);
            await log(`是否为开发项目：${isDevProject() ? '是' : '否'}`);
            // 插件版本
            try {
                const pluginVersion = await getCurrentVersion(getPluginPath());
                await log(`插件版本：${pluginVersion}`);
            }
            catch (_a) {
                await log(`插件版本：未知`);
            }
            Editor.Dialog.info(`框架版本信息\n\n版本：${version}\n最近提交：${lastCommit}\n开发模式：${isDevProject() ? '是' : '否'}`);
        }
        catch (e) {
            await log(`获取版本信息失败：${e.message}`, 'error');
        }
    },
    /**
     * 更新插件自身
     */
    async updatePlugin() {
        Editor.Panel.open('framework-plugin.log');
        await log('========== 更新插件 ==========');
        const pluginPath = getPluginPath();
        try {
            const currentVersion = await getCurrentVersion(pluginPath);
            await log(`当前插件版本：${currentVersion}`);
            await log('正在拉取最新代码...');
            await runCommand('git fetch --tags', pluginPath);
            const latestTag = await getLatestTag(pluginPath);
            if (latestTag) {
                const currentTag = currentVersion.startsWith('v') ? currentVersion : null;
                if (currentTag === latestTag) {
                    await log(`插件已是最新版本 ${latestTag} ✅`, 'success');
                    Editor.Dialog.info(`插件已是最新版本\n${latestTag}`);
                    return;
                }
                await runCommand(`git checkout ${latestTag}`, pluginPath);
                await log(`插件已更新到 ${latestTag}`, 'success');
            }
            else {
                await runCommand('git pull origin main', pluginPath);
                await log('插件已更新到最新代码', 'success');
            }
            await log('========== 插件更新完成 ✅ 请重启编辑器生效 ==========', 'success');
            Editor.Dialog.info('插件更新完成！\n请重启 Cocos Creator 使更新生效。');
        }
        catch (e) {
            await log(`插件更新失败：${e.message}`, 'error');
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
            await log('框架未初始化', 'error');
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
};
/**
 * 扩展加载完成后触发
 */
const load = function () {
    console.log('[框架管理] 插件已加载');
    // 检查是否为 dev 项目，在控制台输出提示
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