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
function getProjectPath() {
    return Editor.Project.path;
}
function getFrameworkPath() {
    return path.join(getProjectPath(), 'assets', 'framework');
}
function getPluginPath() {
    return path.join(getProjectPath(), 'extensions', 'framework-plugin');
}
function isDevProject() {
    return path.basename(getProjectPath()) === 'cocos-framework-dev';
}
function frameworkExists() {
    return fs.existsSync(path.join(getFrameworkPath(), '.git'));
}
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
 * 获取最新稳定 Tag（不做 fetch，假设已 fetch 过）
 */
async function getStableTag(repoPath) {
    try {
        const tags = await runCommand("git tag -l 'v*' --sort=-version:refname", repoPath);
        const stableTags = tags.split('\n').filter(t => /^v\d+\.\d+\.\d+$/.test(t));
        return stableTags.length > 0 ? stableTags[0] : null;
    }
    catch (_a) {
        return null;
    }
}
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
// ==================== 日志 ====================
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
        default: console.log(`${prefix} ${message}`);
    }
    try {
        Editor.Message.send('framework-plugin', 'append-log', JSON.stringify({ message, type, time: new Date().toLocaleTimeString() }));
    }
    catch (e) { }
}
/**
 * 打开日志面板并等待就绪
 */
async function openLog() {
    await Editor.Panel.open('framework-plugin.log');
}
function setTitle(title) {
    Editor.Message.send('framework-plugin', 'set-title', title);
}
// ==================== 插件入口 ====================
exports.methods = {
    openLogPanel() {
        Editor.Panel.open('framework-plugin.log');
    },
    /**
     * 显示 MD5 警告对话框（由 hooks 触发）
     */
    async showMd5Warning() {
        await log('警告：检测到远程包输出了带 MD5 的 config.json，不建议勾选 MD5缓存！', 'warn');
        Editor.Dialog.warn('【打包配置警告】\n\n检测到部分远程 Bundle 生成了带 MD5 的 config.json。\n\n由于目前的资源热更机制依赖自己生成的 Manifest，请在构建面板中**取消勾选对应 Bundle 或是全局的「MD5缓存」选项**，然后再重新构建！', {
            title: 'MD5 缓存警告'
        });
    },
    /**
     * 更新框架（同时更新框架和插件，不自动提交）
     */
    async updateFramework() {
        await openLog();
        setTitle('更新框架和插件');
        await log('========== 更新框架和插件 ==========');
        const fwPath = getFrameworkPath();
        const pluginPath = getPluginPath();
        // --- 更新框架（基于 main 分支，强制覆盖） ---
        if (frameworkExists()) {
            try {
                const beforeHash = await runCommand('git rev-parse --short HEAD', fwPath);
                await log(`[框架] 本地：${beforeHash}`);
                await runCommand('git fetch origin main', fwPath);
                const remoteHash = await runCommand('git rev-parse --short origin/main', fwPath);
                await log(`[框架] 远程：${remoteHash}`);
                if (beforeHash === remoteHash) {
                    await log('[框架] 已是最新', 'success');
                }
                else {
                    await runCommand('git checkout main', fwPath).catch(() => { });
                    await runCommand('git reset --hard origin/main', fwPath);
                    const afterHash = await runCommand('git rev-parse --short HEAD', fwPath);
                    await log(`[框架] 已更新 ${beforeHash} → ${afterHash}`, 'success');
                }
                Editor.Message.send('asset-db', 'refresh-asset', 'db://assets/framework');
            }
            catch (e) {
                await log(`[框架] 更新失败：${e.message}`, 'error');
            }
        }
        else {
            await log('[框架] 子模块不存在，跳过', 'warn');
        }
        await log('─────────────────────────────');
        // --- 更新插件（基于 main 分支，强制覆盖） ---
        try {
            const beforeHash = await runCommand('git rev-parse --short HEAD', pluginPath);
            await log(`[插件] 本地：${beforeHash}`);
            await runCommand('git fetch origin main', pluginPath);
            const remoteHash = await runCommand('git rev-parse --short origin/main', pluginPath);
            await log(`[插件] 远程：${remoteHash}`);
            if (beforeHash === remoteHash) {
                await log('[插件] 已是最新', 'success');
            }
            else {
                await runCommand('git checkout main', pluginPath).catch(() => { });
                await runCommand('git reset --hard origin/main', pluginPath);
                const afterHash = await runCommand('git rev-parse --short HEAD', pluginPath);
                await log(`[插件] 已更新 ${beforeHash} → ${afterHash}`, 'success');
                await log('[插件] 请在 扩展管理器 中关闭再开启本插件(framework-plugin)以生效', 'warn');
            }
        }
        catch (e) {
            await log(`[插件] 更新失败：${e.message}`, 'error');
        }
        await log('========== 更新完成 ✅ ==========', 'success');
    },
    /**
     * 切换框架版本（输入 commit hash）
     */
    async switchVersion() {
        await openLog();
        setTitle('切换框架版本');
        await log('========== 切换框架版本 ==========');
        if (!frameworkExists()) {
            await log('[框架] 子模块不存在', 'error');
            Editor.Dialog.error('框架子模块不存在\n请先通过安装脚本引入框架。');
            return;
        }
        const fwPath = getFrameworkPath();
        try {
            const currentHash = await runCommand('git rev-parse --short HEAD', fwPath);
            const currentMsg = await runCommand('git log -1 --format="%s"', fwPath);
            await log(`[框架] 当前版本：${currentHash}（${currentMsg}）`);
            // 拉取最新并显示最近提交供参考
            await runCommand('git fetch origin main', fwPath);
            await log('[框架] 最近提交记录：');
            const recentLogs = await runCommand('git log origin/main -10 --format="%h  %s  (%cr)"', fwPath).catch(() => '');
            if (recentLogs) {
                for (const line of recentLogs.split('\n')) {
                    await log(`[框架]   ${line}`);
                }
            }
            // 通过面板输入框获取hash
            Editor.Message.send('framework-plugin', 'show-hash-input', '');
            await log('[框架] 请在日志面板底部输入要切换的 commit hash', 'warn');
        }
        catch (e) {
            await log(`[框架] 切换版本失败：${e.message}`, 'error');
        }
    },
    /**
     * 执行版本切换（通过控制台或消息调用）
     */
    async doSwitchVersion(targetHash) {
        await openLog();
        if (!targetHash || typeof targetHash !== 'string') {
            await log('[框架] 请提供有效的 commit hash', 'error');
            return;
        }
        const fwPath = getFrameworkPath();
        try {
            const beforeHash = await runCommand('git rev-parse --short HEAD', fwPath);
            await log(`[框架] 正在切换 ${beforeHash} → ${targetHash}...`);
            await runCommand(`git checkout ${targetHash}`, fwPath);
            const afterHash = await runCommand('git rev-parse --short HEAD', fwPath);
            const msg = await runCommand('git log -1 --format="%s"', fwPath);
            await log(`[框架] 已切换到 ${afterHash}（${msg}）`, 'success');
            Editor.Message.send('asset-db', 'refresh-asset', 'db://assets/framework');
            await log('========== 切换完成 ✅ ==========', 'success');
        }
        catch (e) {
            await log(`[框架] 切换失败：${e.message}`, 'error');
        }
    },
    /**
     * 推送框架版本（仅 dev 项目）
     */
    async publishFramework() {
        if (!isDevProject()) {
            Editor.Dialog.warn('此功能仅在 cocos-framework-dev 项目中可用');
            return;
        }
        await openLog();
        setTitle('推送框架版本');
        await log('========== 推送框架版本 🚀 ==========');
        if (!frameworkExists()) {
            await log('[框架] 子模块不存在', 'error');
            return;
        }
        const fwPath = getFrameworkPath();
        try {
            const status = await runCommand('git status --porcelain', fwPath);
            if (!status) {
                await log('[框架] 没有可推送的变更', 'warn');
                Editor.Dialog.info('框架没有可推送的变更');
                return;
            }
            await log('[框架] 检测到以下变更：');
            const changes = status.split('\n');
            for (const change of changes) {
                await log(`[框架]   ${change}`);
            }
            const currentVersion = await getCurrentVersion(fwPath);
            await log(`[框架] 当前版本：${currentVersion}`);
            // 请求输入提交信息
            Editor.Panel.open('framework-plugin.log');
            Editor.Message.send('framework-plugin', 'show-commit-input', 'framework');
            await log('[框架] 请在日志面板底部输入提交信息后点击「推送」', 'warn');
        }
        catch (e) {
            await log(`[框架] 推送失败：${e.message}`, 'error');
            Editor.Dialog.error(`推送失败\n${e.message}`);
        }
    },
    /**
     * 执行框架推送（由面板输入触发）
     */
    async doPublishFramework(commitMsg) {
        const fwPath = getFrameworkPath();
        try {
            const msg = (commitMsg || 'feat: 更新框架').replace(/\n/g, ' ');
            // 输出变更内容
            const diff = await runCommand('git diff --stat', fwPath).catch(() => '');
            if (diff) {
                await log('[框架] 变更内容：');
                for (const line of diff.split('\n')) {
                    await log(`[框架]   ${line}`);
                }
            }
            await log(`[框架] 提交信息：${msg}`);
            await runCommand('git add .', fwPath);
            await runCommand(`git commit -m "${msg}"`, fwPath);
            await log('[框架] 变更已提交', 'success');
            await log('[框架] 正在推送到远程...');
            await runCommand('git push origin main', fwPath);
            await log('[框架] 推送完成', 'success');
            await log('========== 框架推送完成 ✅ ==========', 'success');
        }
        catch (e) {
            await log(`[框架] 推送失败：${e.message}`, 'error');
        }
    },
    /**
     * 推送插件版本（仅 dev 项目）
     */
    async publishPlugin() {
        if (!isDevProject()) {
            Editor.Dialog.warn('此功能仅在 cocos-framework-dev 项目中可用');
            return;
        }
        await openLog();
        setTitle('推送插件版本');
        await log('========== 推送插件版本 🔧 ==========');
        const pluginPath = getPluginPath();
        try {
            const status = await runCommand('git status --porcelain', pluginPath);
            if (!status) {
                await log('[插件] 没有可推送的变更', 'warn');
                Editor.Dialog.info('插件没有可推送的变更');
                return;
            }
            await log('[插件] 检测到以下变更：');
            const changes = status.split('\n');
            for (const change of changes) {
                await log(`[插件]   ${change}`);
            }
            const currentVersion = await getCurrentVersion(pluginPath);
            await log(`[插件] 当前版本：${currentVersion}`);
            // 请求输入提交信息
            Editor.Panel.open('framework-plugin.log');
            Editor.Message.send('framework-plugin', 'show-commit-input', 'plugin');
            await log('[插件] 请在日志面板底部输入提交信息后点击「推送」', 'warn');
        }
        catch (e) {
            await log(`[插件] 推送失败：${e.message}`, 'error');
            Editor.Dialog.error(`推送失败\n${e.message}`);
        }
    },
    /**
     * 执行插件推送（由面板输入触发）
     */
    async doPublishPlugin(commitMsg) {
        const pluginPath = getPluginPath();
        try {
            const msg = (commitMsg || 'feat: 更新插件').replace(/\n/g, ' ');
            await log('[插件] 正在编译...');
            try {
                await runCommand('npm run build', pluginPath);
            }
            catch (_a) {
                await log('[插件] 依赖缺失，正在安装...');
                await runCommand('npm install --ignore-scripts', pluginPath);
                await runCommand('npm run build', pluginPath);
            }
            await log('[插件] 编译完成', 'success');
            // 输出变更内容
            const diff = await runCommand('git diff --stat', pluginPath).catch(() => '');
            if (diff) {
                await log('[插件] 变更内容：');
                for (const line of diff.split('\n')) {
                    await log(`[插件]   ${line}`);
                }
            }
            await log(`[插件] 提交信息：${msg}`);
            await runCommand('git add .', pluginPath);
            await runCommand(`git commit -m "${msg}"`, pluginPath);
            await log('[插件] 变更已提交', 'success');
            await log('[插件] 正在推送到远程...');
            await runCommand('git push origin main', pluginPath);
            await log('[插件] 推送完成', 'success');
            await log('========== 插件推送完成 ✅ ==========', 'success');
        }
        catch (e) {
            await log(`[插件] 推送失败：${e.message}`, 'error');
        }
    },
    /**
     * 关于
     */
    async showAbout() {
        await openLog();
        setTitle('关于');
        await log('========== 关于 ==========');
        try {
            if (frameworkExists()) {
                const fwVersion = await getCurrentVersion(getFrameworkPath());
                const lastCommit = await runCommand('git log -1 --format="%h %s (%ci)"', getFrameworkPath());
                await log(`[框架] 版本：${fwVersion}`);
                await log(`[框架] 路径：${getFrameworkPath()}`);
                await log(`[框架] 最近提交：${lastCommit}`);
            }
            else {
                await log('[框架] 未安装', 'warn');
            }
            const pluginVersion = await getCurrentVersion(getPluginPath());
            await log(`[插件] 版本：${pluginVersion}`);
            await log(`[插件] 路径：${getPluginPath()}`);
            await log(`[项目] 路径：${getProjectPath()}`);
            await log(`[项目] 开发模式：${isDevProject() ? '是（推送功能已启用）' : '否'}`);
            const fwVer = frameworkExists() ? await getCurrentVersion(getFrameworkPath()) : '未安装';
            Editor.Dialog.info(`关于 - 框架管理插件\n\n框架版本：${fwVer}\n插件版本：${pluginVersion}\n开发模式：${isDevProject() ? '是' : '否'}`);
        }
        catch (e) {
            await log(`获取信息失败：${e.message}`, 'error');
        }
    },
    /**
     * 构建插件（仅 dev 项目）
     */
    async buildPlugin() {
        if (!isDevProject()) {
            Editor.Dialog.warn('此功能仅在 cocos-framework-dev 项目中可用');
            return;
        }
        await openLog();
        setTitle('构建插件');
        await log('========== 构建插件 🔨 ==========');
        const pluginPath = getPluginPath();
        try {
            await log('[插件] 正在编译...');
            try {
                await runCommand('npm run build', pluginPath);
            }
            catch (_a) {
                await log('[插件] 依赖缺失，正在安装...');
                await runCommand('npm install --ignore-scripts', pluginPath);
                await runCommand('npm run build', pluginPath);
            }
            await log('[插件] 编译完成', 'success');
            await log('[插件] 请在 扩展管理器 中关闭再开启本插件(framework-plugin)以生效', 'warn');
            await log('========== 构建完成 ✅ ==========', 'success');
        }
        catch (e) {
            await log(`[插件] 编译失败：${e.message}`, 'error');
        }
    },
    /**
     * 修复框架（还原框架和插件到最后提交状态）
     */
    async repairFramework() {
        const result = await Editor.Dialog.warn('修复框架\n\n此操作将丢弃框架和插件的所有本地修改。\n\n确定要继续吗？', { buttons: ['确认修复', '取消'], default: 0, cancel: 1 });
        if (result.response !== 0)
            return;
        await openLog();
        setTitle('修复框架');
        await log('========== 修复框架 🔧 ==========');
        const fwPath = getFrameworkPath();
        const pluginPath = getPluginPath();
        // --- 安全校验：确保路径正确 ---
        const projectPath = getProjectPath();
        const expectedFwPath = path.join(projectPath, 'assets', 'framework');
        const expectedPluginPath = path.join(projectPath, 'extensions', 'framework-plugin');
        // --- 修复框架 ---
        if (frameworkExists()) {
            if (path.resolve(fwPath) !== path.resolve(expectedFwPath)) {
                await log('[框架] 路径异常，跳过修复', 'error');
            }
            else {
                try {
                    const status = await runCommand('git status --porcelain', fwPath).catch(() => '');
                    if (!status) {
                        await log('[框架] 无需修复，没有本地修改', 'success');
                    }
                    else {
                        await log('[框架] 检测到本地修改：');
                        for (const line of status.split('\n')) {
                            await log(`[框架]   ${line}`);
                        }
                        await runCommand('git checkout .', fwPath);
                        await runCommand('git clean -fd', fwPath);
                        await log('[框架] 已还原到最后提交状态', 'success');
                    }
                }
                catch (e) {
                    await log(`[框架] 修复失败：${e.message}`, 'error');
                }
            }
        }
        else {
            await log('[框架] 子模块不存在，跳过', 'warn');
        }
        await log('─────────────────────────────');
        // --- 修复插件 ---
        if (path.resolve(pluginPath) !== path.resolve(expectedPluginPath)) {
            await log('[插件] 路径异常，跳过修复', 'error');
        }
        else {
            try {
                const status = await runCommand('git status --porcelain', pluginPath).catch(() => '');
                if (!status) {
                    await log('[插件] 无需修复，没有本地修改', 'success');
                }
                else {
                    await log('[插件] 检测到本地修改：');
                    for (const line of status.split('\n')) {
                        await log(`[插件]   ${line}`);
                    }
                    await runCommand('git checkout .', pluginPath);
                    await runCommand('git clean -fd', pluginPath);
                    await log('[插件] 已还原到最后提交状态', 'success');
                    await log('[插件] 请在 扩展管理器 中关闭再开启本插件(framework-plugin)以生效', 'warn');
                }
            }
            catch (e) {
                await log(`[插件] 修复失败：${e.message}`, 'error');
            }
        }
        Editor.Message.send('asset-db', 'refresh-asset', 'db://assets/framework');
        await log('========== 修复完成 ✅ ==========', 'success');
    },
};
const load = function () {
    console.log('[框架管理] 插件已加载');
    if (isDevProject()) {
        console.log('[框架管理] 当前为开发项目，已启用推送功能');
    }
};
exports.load = load;
const unload = function () {
    console.log('[框架管理] 插件已卸载');
};
exports.unload = unload;
//# sourceMappingURL=main.js.map