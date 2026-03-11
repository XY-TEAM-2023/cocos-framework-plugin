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
const r2_1 = require("./r2");
const pages_1 = require("./pages");
const android_1 = require("./android");
const ios_1 = require("./ios");
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
// ==================== R2 上传状态 ====================
let uploadCancelled = false;
let _currentSwitchEnv = 'production';
let _currentCleanupEnv = 'production';
// ==================== Pages 辅助函数 ====================
function _checkPagesConfig() {
    const projectRoot = getProjectPath();
    const config = (0, pages_1.loadPagesConfig)(projectRoot);
    if (!(0, pages_1.isPagesConfigured)(config)) {
        Editor.Dialog.warn('Pages 未配置\n\n请先配置 Cloudflare Pages API Token。', {
            buttons: ['去配置', '取消'], default: 0, cancel: 1,
        }).then((result) => {
            if (result.response === 0) {
                Editor.Message.send('framework-plugin', 'config-pages');
            }
        });
        return null;
    }
    return config;
}
async function _loadSwitchVersionData(config, env, page = 1) {
    var _a;
    const r2config = (0, r2_1.loadR2Config)(getProjectPath());
    const accountId = (r2config === null || r2config === void 0 ? void 0 : r2config.accountId) || '';
    const projectName = (_a = config.pagesProjects[env]) === null || _a === void 0 ? void 0 : _a.projectName;
    if (!projectName || !accountId)
        return;
    try {
        const perPage = 10;
        const deployments = await (0, pages_1.listDeployments)(config.pagesApiToken, accountId, projectName, page, perPage);
        const environments = (0, pages_1.getAvailableEnvironments)(config);
        // 如果是第一页，发送环境列表
        // 如果不是第一页，只发送新数据（由面板追加）
        setTimeout(() => {
            Editor.Message.send('framework-plugin', 'set-versions-data', JSON.stringify({
                environments: page === 1 ? environments : undefined,
                deployments,
                currentEnv: env,
                page,
                hasMore: deployments.length === perPage,
            }));
        }, 300);
    }
    catch (e) {
        console.error('[Pages] 获取部署列表失败', e);
    }
}
async function _loadCleanupData(config, env) {
    var _a;
    const r2config = (0, r2_1.loadR2Config)(getProjectPath());
    const accountId = (r2config === null || r2config === void 0 ? void 0 : r2config.accountId) || '';
    const projectName = (_a = config.pagesProjects[env]) === null || _a === void 0 ? void 0 : _a.projectName;
    if (!projectName || !accountId)
        return;
    try {
        const deployments = await (0, pages_1.listDeployments)(config.pagesApiToken, accountId, projectName);
        // 应用锁定规则
        const successDeployments = deployments.filter(d => { var _a; return ((_a = d.latest_stage) === null || _a === void 0 ? void 0 : _a.status) === 'success'; });
        const recentSuccessIds = new Set(successDeployments.slice(0, 3).map(d => d.id));
        const withLock = deployments.map(d => {
            let locked = false;
            let lockReason = '';
            if (d.is_current) {
                locked = true;
                lockReason = '当前生产';
            }
            else if (recentSuccessIds.has(d.id)) {
                locked = true;
                lockReason = '最近版本';
            }
            return Object.assign(Object.assign({}, d), { locked, lockReason });
        });
        const environments = (0, pages_1.getAvailableEnvironments)(config);
        setTimeout(() => {
            Editor.Message.send('framework-plugin', 'set-cleanup-data', JSON.stringify({
                environments,
                deployments: withLock,
                currentEnv: env,
            }));
        }, 300);
    }
    catch (e) {
        console.error('[Pages] 获取部署列表失败', e);
    }
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
        Editor.Dialog.error('由于目前机制依赖生成的 Manifest，请在构建面板中取消「MD5缓存」的勾选，然后再重新构建！', {
            title: '打包配置警告'
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
                await log('[框架] 正在刷新编辑器资源缓存...');
                await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets/framework');
                await log('[框架] 编辑器资源缓存已刷新', 'success');
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
            await log('[框架] 正在刷新编辑器资源缓存...');
            await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets/framework');
            await log('[框架] 编辑器资源缓存已刷新', 'success');
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
            const fwVer = frameworkExists() ? await getCurrentVersion(getFrameworkPath()) : '未安装';
            Editor.Dialog.info(`关于 - 框架管理插件\n\n框架版本：${fwVer}\n插件版本：${pluginVersion}`);
        }
        catch (e) {
            await log(`获取信息失败：${e.message}`, 'error');
        }
    },
    /**
     * 构建插件（仅 dev 项目）
     */
    async buildPlugin() {
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
        await log('[框架] 正在刷新编辑器资源缓存...');
        await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets/framework');
        await log('[框架] 编辑器资源缓存已刷新', 'success');
        await log('========== 修复完成 ✅ ==========', 'success');
    },
    // ==================== R2 上传功能 ====================
    /**
     * 配置 R2（打开配置面板）
     */
    async configR2() {
        await Editor.Panel.open('framework-plugin.r2config');
        const projectRoot = getProjectPath();
        const existing = (0, r2_1.loadR2Config)(projectRoot);
        if (existing) {
            setTimeout(() => {
                Editor.Message.send('framework-plugin', 'load-r2-config', JSON.stringify(existing));
            }, 300);
        }
    },
    /**
     * 打开统一设置面板
     */
    async openSettings() {
        await Editor.Panel.open('framework-plugin.settings');
    },
    /**
     * 设置面板请求加载 R2 配置
     */
    async loadSettingsR2() {
        const projectRoot = getProjectPath();
        const existing = (0, r2_1.loadR2Config)(projectRoot);
        if (existing) {
            setTimeout(() => {
                Editor.Message.send('framework-plugin', 'load-settings-r2-config', JSON.stringify(existing));
            }, 100);
        }
    },
    /**
     * 设置面板请求加载 Pages 配置
     */
    async loadSettingsPages() {
        const projectRoot = getProjectPath();
        const existing = (0, pages_1.loadPagesConfig)(projectRoot);
        if (existing) {
            setTimeout(() => {
                Editor.Message.send('framework-plugin', 'load-settings-pages-config', JSON.stringify(existing));
            }, 100);
        }
    },
    /**
     * 设置面板请求加载 Android 配置
     */
    async loadSettingsAndroid() {
        const projectRoot = getProjectPath();
        const existing = (0, android_1.loadAndroidConfig)(projectRoot);
        // 即使没有配置文件也发送默认值（三个环境全部启用）
        const config = existing || { environments: { dev: true, beta: true, prod: true } };
        setTimeout(() => {
            Editor.Message.send('framework-plugin', 'load-settings-android-config', JSON.stringify(config));
        }, 100);
    },
    /**
     * 保存 Android 配置（由设置面板触发）
     */
    async saveAndroidConfigFromPanel(configStr) {
        const projectRoot = getProjectPath();
        try {
            const config = JSON.parse(configStr);
            (0, android_1.saveAndroidConfig)(projectRoot, config);
            const msg = JSON.stringify({ text: '✅ 配置已保存', color: '#4ec9b0' });
            Editor.Message.send('framework-plugin', 'set-settings-android-status', msg);
            console.log('[Android] 配置已保存到 .androidconfig.json');
        }
        catch (_a) {
            const msg = JSON.stringify({ text: '❌ 保存失败', color: '#f44747' });
            Editor.Message.send('framework-plugin', 'set-settings-android-status', msg);
        }
    },
    // ==================== iOS 签名 & 构建 ====================
    /**
     * 打开 iOS 签名配置面板
     */
    async openIOSSigning() {
        Editor.Panel.open('framework-plugin.ios-signing');
    },
    /**
     * 打开 iOS 构建面板
     */
    async openIOSBuild() {
        Editor.Panel.open('framework-plugin.ios-build');
    },
    /**
     * 选择 mobileprovision 文件（由签名面板触发）
     */
    async selectIOSMobileProvision(envKey) {
        var _a;
        const result = await Editor.Dialog.select({
            title: `选择 ${envKey} 环境的 Provisioning Profile`,
            filters: [{ name: 'Provisioning Profile', extensions: ['mobileprovision'] }],
        });
        if (result.canceled || !((_a = result.filePaths) === null || _a === void 0 ? void 0 : _a.length))
            return;
        const sourcePath = result.filePaths[0];
        const projectRoot = getProjectPath();
        try {
            // 复制到 .ios-signing/
            const fileName = (0, ios_1.copySigningFile)(sourcePath, projectRoot, 'mobileprovision');
            // 解析
            const signingDir = path.join(projectRoot, '.ios-signing');
            const info = await (0, ios_1.parseMobileProvision)(path.join(signingDir, fileName));
            // 回传结果时包含 envKey，面板据此更新对应环境的配置
            Editor.Message.send('framework-plugin', 'set-ios-mobileprovision-result', JSON.stringify(Object.assign({ envKey, fileName }, info)));
        }
        catch (err) {
            console.error('[iOS] 选择 mobileprovision 失败:', err);
            Editor.Message.send('framework-plugin', 'set-ios-signing-status', JSON.stringify({
                text: `❌ 解析失败: ${err.message}`, color: '#f44747',
            }));
        }
    },
    /**
     * 选择 P12 证书文件（由签名面板触发）
     */
    async selectIOSP12() {
        var _a;
        const result = await Editor.Dialog.select({
            title: '选择 P12 证书',
            filters: [{ name: 'P12 Certificate', extensions: ['p12', 'pfx'] }],
        });
        if (result.canceled || !((_a = result.filePaths) === null || _a === void 0 ? void 0 : _a.length))
            return;
        const sourcePath = result.filePaths[0];
        const projectRoot = getProjectPath();
        try {
            const fileName = (0, ios_1.copySigningFile)(sourcePath, projectRoot, 'p12');
            Editor.Message.send('framework-plugin', 'set-ios-p12-result', JSON.stringify({ fileName }));
        }
        catch (err) {
            console.error('[iOS] 选择 P12 失败:', err);
            Editor.Message.send('framework-plugin', 'set-ios-signing-status', JSON.stringify({
                text: `❌ 复制失败: ${err.message}`, color: '#f44747',
            }));
        }
    },
    /**
     * 保存 iOS 配置（由签名面板触发）
     */
    async saveIOSConfigFromPanel(configStr) {
        var _a;
        const projectRoot = getProjectPath();
        try {
            const signingData = JSON.parse(configStr);
            // 签名面板只传签名相关字段，需要与现有配置合并（保留 enabled 和 exportMethod）
            const existing = (0, ios_1.loadIOSConfig)(projectRoot);
            const config = existing || {
                shared: { p12File: '', p12Password: '', teamId: '' },
                environments: {
                    dev: { enabled: true, exportMethod: 'simulator', mobileprovisionFile: '', profileName: '', profileUUID: '', bundleId: '' },
                    beta: { enabled: false, exportMethod: 'ad-hoc', mobileprovisionFile: '', profileName: '', profileUUID: '', bundleId: '' },
                    prod: { enabled: false, exportMethod: 'app-store', mobileprovisionFile: '', profileName: '', profileUUID: '', bundleId: '' },
                },
            };
            // 更新共享配置
            config.shared = signingData.shared || config.shared;
            // 更新各环境的签名信息（保留 enabled 和 exportMethod）
            for (const envKey of ['dev', 'beta', 'prod']) {
                const envSigning = (_a = signingData.environments) === null || _a === void 0 ? void 0 : _a[envKey];
                if (envSigning) {
                    config.environments[envKey].mobileprovisionFile = envSigning.mobileprovisionFile || '';
                    config.environments[envKey].profileName = envSigning.profileName || '';
                    config.environments[envKey].profileUUID = envSigning.profileUUID || '';
                    config.environments[envKey].bundleId = envSigning.bundleId || '';
                }
            }
            (0, ios_1.saveIOSConfig)(projectRoot, config);
            const msg = JSON.stringify({ text: '✅ 配置已保存', color: '#4ec9b0' });
            Editor.Message.send('framework-plugin', 'set-ios-signing-status', msg);
            console.log('[iOS] 签名配置已保存到 .iosconfig.json');
        }
        catch (_b) {
            const msg = JSON.stringify({ text: '❌ 保存失败', color: '#f44747' });
            Editor.Message.send('framework-plugin', 'set-ios-signing-status', msg);
        }
    },
    /**
     * 加载 iOS 签名配置（由签名面板触发）
     */
    async loadIOSSigningConfig() {
        const projectRoot = getProjectPath();
        const config = (0, ios_1.loadIOSConfig)(projectRoot);
        if (config) {
            setTimeout(() => {
                Editor.Message.send('framework-plugin', 'load-ios-signing-config-data', JSON.stringify(config));
            }, 100);
        }
    },
    /**
     * 加载 iOS 构建配置（由构建面板触发）
     */
    async loadIOSBuildConfig() {
        var _a, _b, _c, _d, _e, _f;
        const projectRoot = getProjectPath();
        const config = (0, ios_1.loadIOSConfig)(projectRoot);
        const hasSharedConfig = config ? !!(config.shared.p12File && config.shared.p12Password && config.shared.teamId) : false;
        const signingReady = config ? (0, ios_1.isSigningConfigured)(config) : false;
        const data = {
            signingReady,
            hasSharedConfig,
            // 每个环境的完整配置
            environments: config ? {
                dev: { enabled: ((_a = config.environments.dev) === null || _a === void 0 ? void 0 : _a.enabled) !== false, exportMethod: ((_b = config.environments.dev) === null || _b === void 0 ? void 0 : _b.exportMethod) || 'simulator' },
                beta: { enabled: ((_c = config.environments.beta) === null || _c === void 0 ? void 0 : _c.enabled) !== false, exportMethod: ((_d = config.environments.beta) === null || _d === void 0 ? void 0 : _d.exportMethod) || 'ad-hoc' },
                prod: { enabled: ((_e = config.environments.prod) === null || _e === void 0 ? void 0 : _e.enabled) !== false, exportMethod: ((_f = config.environments.prod) === null || _f === void 0 ? void 0 : _f.exportMethod) || 'app-store' },
            } : {
                dev: { enabled: true, exportMethod: 'simulator' },
                beta: { enabled: false, exportMethod: 'ad-hoc' },
                prod: { enabled: false, exportMethod: 'app-store' },
            },
        };
        setTimeout(() => {
            Editor.Message.send('framework-plugin', 'load-ios-build-config-data', JSON.stringify(data));
        }, 100);
    },
    /**
     * 开始 iOS 多环境构建（由构建面板触发）
     */
    async startIOSBuild(optionsStr) {
        const projectRoot = getProjectPath();
        try {
            const options = JSON.parse(optionsStr);
            const environments = options.environments || ['dev', 'beta', 'prod'];
            const exportMethods = options.exportMethods || {};
            // 将构建面板选择的导出方式写入配置（持久化）
            const config = (0, ios_1.loadIOSConfig)(projectRoot);
            if (config) {
                for (const envKey of environments) {
                    if (exportMethods[envKey] && config.environments[envKey]) {
                        config.environments[envKey].exportMethod = exportMethods[envKey];
                        config.environments[envKey].enabled = true;
                    }
                }
                // 未勾选的环境标记为未启用
                for (const envKey of ['dev', 'beta', 'prod']) {
                    if (!environments.includes(envKey)) {
                        config.environments[envKey].enabled = false;
                    }
                }
                (0, ios_1.saveIOSConfig)(projectRoot, config);
            }
            // 通知面板构建开始
            Editor.Message.send('framework-plugin', 'set-ios-build-started');
            // 生成版本号
            const now = new Date();
            const version = [
                String(now.getFullYear()).slice(2),
                String(now.getMonth() + 1).padStart(2, '0'),
                String(now.getDate()).padStart(2, '0'),
                String(now.getHours()).padStart(2, '0'),
                String(now.getMinutes()).padStart(2, '0'),
                String(now.getSeconds()).padStart(2, '0'),
            ].join('');
            const logFn = (message, type = 'info') => {
                console.log(`[iOS] ${message}`);
                try {
                    Editor.Message.send('framework-plugin', 'append-ios-build-log', JSON.stringify({
                        message, type, time: new Date().toLocaleTimeString(),
                    }));
                }
                catch (_a) { }
            };
            const results = await (0, ios_1.generateMultiEnvIpas)({
                projectRoot,
                version,
                environments,
                onLog: logFn,
            });
            const successCount = results.filter(r => r.success).length;
            logFn(`多环境 IPA 构建完成: ${successCount}/${environments.length} 成功`, successCount === environments.length ? 'success' : 'warn');
            // 通知面板构建完成
            Editor.Message.send('framework-plugin', 'set-ios-build-complete', JSON.stringify({ results }));
        }
        catch (err) {
            console.error('[iOS] 构建出错:', err);
            try {
                Editor.Message.send('framework-plugin', 'append-ios-build-log', JSON.stringify({
                    message: `构建出错: ${err.message}`, type: 'error', time: new Date().toLocaleTimeString(),
                }));
                Editor.Message.send('framework-plugin', 'set-ios-build-complete', JSON.stringify({ error: err.message }));
            }
            catch (_a) { }
        }
    },
    /**
     * 保存 R2 配置（由配置面板触发）
     */
    async saveR2ConfigFromPanel(configStr) {
        var _a;
        const projectRoot = getProjectPath();
        let input;
        try {
            input = JSON.parse(configStr);
        }
        catch (_b) {
            return;
        }
        const existing = (0, r2_1.loadR2Config)(projectRoot);
        const config = {
            accountId: input.accountId,
            accessKeyId: input.accessKeyId,
            secretAccessKey: input.secretAccessKey,
            bucketName: input.bucketName,
            autoPromptAfterBuild: (_a = existing === null || existing === void 0 ? void 0 : existing.autoPromptAfterBuild) !== null && _a !== void 0 ? _a : true,
        };
        (0, r2_1.saveR2Config)(projectRoot, config);
        const statusMsg = JSON.stringify({ text: '✅ 配置已保存', color: '#4ec9b0' });
        Editor.Message.send('framework-plugin', 'set-r2-config-status', statusMsg);
        Editor.Message.send('framework-plugin', 'set-settings-r2-status', statusMsg);
        console.log('[R2] 配置已保存到 .r2config.json');
    },
    /**
     * 测试 R2 连接（由配置面板触发）
     */
    async testR2Connection(configStr) {
        let input;
        try {
            input = JSON.parse(configStr);
        }
        catch (_a) {
            return;
        }
        if (!input.accountId || !input.accessKeyId || !input.secretAccessKey || !input.bucketName) {
            const msg = JSON.stringify({ text: '❌ 请先填写所有字段', color: '#f44747', verified: false });
            Editor.Message.send('framework-plugin', 'set-r2-config-status', msg);
            Editor.Message.send('framework-plugin', 'set-settings-r2-status', msg);
            return;
        }
        const config = Object.assign(Object.assign({}, input), { autoPromptAfterBuild: true });
        const result = await (0, r2_1.testConnection)(config);
        if (result.success) {
            const msg = JSON.stringify({ text: '✅ 连接成功！', color: '#4ec9b0', verified: true });
            Editor.Message.send('framework-plugin', 'set-r2-config-status', msg);
            Editor.Message.send('framework-plugin', 'set-settings-r2-status', msg);
        }
        else {
            const msg = JSON.stringify({ text: `❌ 连接失败：${result.error}`, color: '#f44747', verified: false });
            Editor.Message.send('framework-plugin', 'set-r2-config-status', msg);
            Editor.Message.send('framework-plugin', 'set-settings-r2-status', msg);
        }
    },
    /**
     * 上传到 R2（手动入口：打开面板选择并上传）
     */
    async uploadToR2() {
        const projectRoot = getProjectPath();
        const config = (0, r2_1.loadR2Config)(projectRoot);
        if (!(0, r2_1.isR2Configured)(config)) {
            const result = await Editor.Dialog.warn('R2 未配置\n\n请先配置 R2 连接信息。', { buttons: ['去配置', '取消'], default: 0, cancel: 1 });
            if (result.response === 0) {
                Editor.Message.send('framework-plugin', 'config-r2');
            }
            return;
        }
        // 扫描 build_upload_assets
        const entries = (0, r2_1.scanBuildUploadAssets)(projectRoot);
        if (entries.length === 0) {
            Editor.Dialog.warn('未找到可上传的构建产物\n\n请先执行构建。');
            return;
        }
        // 打开上传面板
        await Editor.Panel.open('framework-plugin.upload');
        // 发送树形数据到面板
        const treeData = entries.map(e => ({
            platform: e.platform,
            bundleName: e.bundleName,
            version: e.version,
        }));
        // 延迟发送以确保面板已就绪
        setTimeout(() => {
            Editor.Message.send('framework-plugin', 'set-tree-data', JSON.stringify(treeData));
        }, 300);
    },
    /**
     * 执行上传到 R2（由面板触发）
     */
    async doUploadToR2(selectionsStr) {
        const projectRoot = getProjectPath();
        const config = (0, r2_1.loadR2Config)(projectRoot);
        if (!config || !(0, r2_1.isR2Configured)(config)) {
            await log('[R2] \u914d\u7f6e\u65e0\u6548', 'error');
            return;
        }
        let selections;
        try {
            selections = JSON.parse(selectionsStr);
        }
        catch (_a) {
            console.error('[R2] \u9009\u62e9\u6570\u636e\u89e3\u6790\u5931\u8d25');
            return;
        }
        uploadCancelled = false;
        const client = (0, r2_1.createS3Client)(config);
        // \u5207\u6362\u9762\u677f\u5230\u4e0a\u4f20\u6a21\u5f0f
        Editor.Message.send('framework-plugin', 'set-uploading', 'true');
        console.log('[R2] ========== \u4e0a\u4f20\u5230 R2 \u2601\ufe0f ==========');
        console.log(`[R2] \u9009\u62e9\u4e86 ${selections.length} \u4e2a\u7248\u672c`);
        // ======= \u7b2c\u4e00\u9636\u6bb5\uff1a\u53d8\u66f4\u68c0\u6d4b =======
        console.log('[R2] --- \u5f00\u59cb\u53d8\u66f4\u68c0\u6d4b ---');
        const toUpload = [];
        let skipCount = 0;
        for (const sel of selections) {
            if (uploadCancelled)
                break;
            const isApp = sel.bundleName === '\ud83d\udce6 app';
            const localDir = isApp
                ? path.join(projectRoot, 'build_upload_assets', sel.platform, 'app', sel.version)
                : path.join(projectRoot, 'build_upload_assets', sel.platform, 'remote', sel.bundleName, sel.version);
            const entry = {
                platform: sel.platform,
                bundleName: sel.bundleName,
                version: sel.version,
                localDir,
            };
            // \u66f4\u65b0\u72b6\u6001\u2192\u68c0\u67e5\u4e2d
            Editor.Message.send('framework-plugin', 'update-bundle-status', JSON.stringify({
                platform: sel.platform, bundleName: sel.bundleName,
                status: '\u68c0\u67e5\u4e2d...', color: '#569cd6',
            }));
            const changeResult = await (0, r2_1.checkBundleChanged)(client, config.bucketName, entry);
            if (changeResult === 'unchanged') {
                skipCount++;
                console.log(`[R2] \u23ed\ufe0f ${sel.platform}/${sel.bundleName}/${sel.version} \u65e0\u7248\u672c\u53d8\u5316\uff0c\u8df3\u8fc7\u4e0a\u4f20`);
                Editor.Message.send('framework-plugin', 'update-bundle-status', JSON.stringify({
                    platform: sel.platform, bundleName: sel.bundleName,
                    status: '\u65e0\u66f4\u65b0', color: '#6a9955',
                }));
            }
            else {
                const label = changeResult === 'new' ? '\u65b0\u7248\u672c' : '\u6709\u66f4\u65b0';
                console.log(`[R2] \u2139\ufe0f ${sel.platform}/${sel.bundleName}/${sel.version} ${label}`);
                Editor.Message.send('framework-plugin', 'update-bundle-status', JSON.stringify({
                    platform: sel.platform, bundleName: sel.bundleName,
                    status: label, color: '#dcdcaa',
                }));
                toUpload.push({ sel, entry });
            }
        }
        if (uploadCancelled) {
            Editor.Message.send('framework-plugin', 'set-uploading', 'false');
            Editor.Message.send('framework-plugin', 'set-upload-error', '\u4e0a\u4f20\u5df2\u53d6\u6d88');
            console.log('[R2] ========== \u4e0a\u4f20\u5df2\u53d6\u6d88 \u26a0\ufe0f ==========');
            return;
        }
        if (toUpload.length === 0) {
            Editor.Message.send('framework-plugin', 'set-uploading', 'false');
            const msg = `\u2705 \u6240\u6709 ${skipCount} \u4e2a Bundle \u5747\u65e0\u53d8\u5316\uff0c\u65e0\u9700\u4e0a\u4f20`;
            Editor.Message.send('framework-plugin', 'set-upload-complete', msg);
            console.log(`[R2] ========== ${msg} ==========`);
            return;
        }
        console.log(`[R2] --- \u68c0\u6d4b\u5b8c\u6210\uff1a${toUpload.length} \u4e2a\u9700\u4e0a\u4f20\uff0c${skipCount} \u4e2a\u8df3\u8fc7 ---`);
        // ======= \u7b2c\u4e8c\u9636\u6bb5\uff1a\u4e0a\u4f20 =======
        let successCount = 0;
        let failCount = 0;
        for (const { sel, entry } of toUpload) {
            if (uploadCancelled)
                break;
            Editor.Message.send('framework-plugin', 'update-bundle-status', JSON.stringify({
                platform: sel.platform, bundleName: sel.bundleName,
                status: '\u4e0a\u4f20\u4e2d...', color: '#569cd6',
            }));
            console.log(`[R2] \u4e0a\u4f20 ${sel.platform}/${sel.bundleName}/${sel.version}...`);
            const result = await (0, r2_1.uploadBundle)({
                client,
                bucket: config.bucketName,
                entry,
                onProgress: (progress) => {
                    Editor.Message.send('framework-plugin', 'update-progress', JSON.stringify({
                        current: progress.current,
                        total: progress.total,
                        fileName: `${sel.bundleName}/${progress.fileName}`,
                        status: progress.status,
                    }));
                },
                isCancelled: () => uploadCancelled,
            });
            switch (result) {
                case 'success':
                    successCount++;
                    console.log(`[R2] \u2705 ${sel.platform}/${sel.bundleName}/${sel.version} \u4e0a\u4f20\u6210\u529f`);
                    Editor.Message.send('framework-plugin', 'update-bundle-status', JSON.stringify({
                        platform: sel.platform, bundleName: sel.bundleName,
                        status: '\u5df2\u5b8c\u6210', color: '#4ec9b0',
                    }));
                    break;
                case 'skipped':
                    skipCount++;
                    console.log(`[R2] \u23ed\ufe0f ${sel.platform}/${sel.bundleName}/${sel.version} \u5df2\u5b58\u5728\uff0c\u8df3\u8fc7`);
                    Editor.Message.send('framework-plugin', 'update-bundle-status', JSON.stringify({
                        platform: sel.platform, bundleName: sel.bundleName,
                        status: '\u5df2\u8df3\u8fc7', color: '#6a9955',
                    }));
                    break;
                case 'cancelled':
                    console.log(`[R2] \u4e0a\u4f20\u5df2\u53d6\u6d88`);
                    break;
                case 'failed': {
                    const retry = await Editor.Dialog.warn(`\u4e0a\u4f20\u5931\u8d25\n\n${sel.platform}/${sel.bundleName}/${sel.version}\n\n\u662f\u5426\u91cd\u8bd5\uff1f`, { buttons: ['\u91cd\u8bd5', '\u505c\u6b62\u4e0a\u4f20'], default: 0, cancel: 1 });
                    if (retry.response === 0) {
                        const retryResult = await (0, r2_1.uploadBundle)({
                            client,
                            bucket: config.bucketName,
                            entry,
                            onProgress: (progress) => {
                                Editor.Message.send('framework-plugin', 'update-progress', JSON.stringify({
                                    current: progress.current,
                                    total: progress.total,
                                    fileName: `${sel.bundleName}/${progress.fileName}`,
                                    status: progress.status,
                                }));
                            },
                            isCancelled: () => uploadCancelled,
                        });
                        if (retryResult === 'success') {
                            successCount++;
                            console.log(`[R2] \u2705 ${sel.platform}/${sel.bundleName}/${sel.version} \u91cd\u8bd5\u4e0a\u4f20\u6210\u529f`);
                            Editor.Message.send('framework-plugin', 'update-bundle-status', JSON.stringify({
                                platform: sel.platform, bundleName: sel.bundleName,
                                status: '\u5df2\u5b8c\u6210', color: '#4ec9b0',
                            }));
                        }
                        else {
                            failCount++;
                            console.log(`[R2] \u274c ${sel.platform}/${sel.bundleName}/${sel.version} \u91cd\u8bd5\u4ecd\u5931\u8d25`);
                            Editor.Message.send('framework-plugin', 'update-bundle-status', JSON.stringify({
                                platform: sel.platform, bundleName: sel.bundleName,
                                status: '\u5931\u8d25', color: '#f44747',
                            }));
                            const keyPrefix = sel.bundleName === '\ud83d\udce6 app'
                                ? `${sel.platform}/app/${sel.version}`
                                : `${sel.platform}/remote/${sel.bundleName}/${sel.version}`;
                            await (0, r2_1.deleteVersionDir)(client, config.bucketName, keyPrefix);
                            console.log(`[R2] \u5df2\u6e05\u7406\u8fdc\u7aef\u4e0d\u5b8c\u6574\u7248\u672c`);
                        }
                    }
                    else {
                        failCount++;
                        Editor.Message.send('framework-plugin', 'update-bundle-status', JSON.stringify({
                            platform: sel.platform, bundleName: sel.bundleName,
                            status: '\u5931\u8d25', color: '#f44747',
                        }));
                        const keyPrefix = sel.bundleName === '\ud83d\udce6 app'
                            ? `${sel.platform}/app/${sel.version}`
                            : `${sel.platform}/remote/${sel.bundleName}/${sel.version}`;
                        await (0, r2_1.deleteVersionDir)(client, config.bucketName, keyPrefix);
                        console.log(`[R2] \u5df2\u6e05\u7406\u8fdc\u7aef\u4e0d\u5b8c\u6574\u7248\u672c`);
                        uploadCancelled = true;
                    }
                    break;
                }
            }
            if (uploadCancelled)
                break;
        }
        // \u6062\u590d\u9762\u677f
        Editor.Message.send('framework-plugin', 'set-uploading', 'false');
        if (uploadCancelled) {
            Editor.Message.send('framework-plugin', 'set-upload-error', '\u4e0a\u4f20\u5df2\u53d6\u6d88');
            console.log('[R2] ========== \u4e0a\u4f20\u5df2\u53d6\u6d88 \u26a0\ufe0f ==========');
        }
        else {
            const summary = `\u2705 ${successCount} \u6210\u529f\uff0c\u23ed\ufe0f ${skipCount} \u8df3\u8fc7\uff0c\u274c ${failCount} \u5931\u8d25`;
            Editor.Message.send('framework-plugin', 'set-upload-complete', summary);
            console.log(`[R2] ========== ${summary} ==========`);
        }
    },
    /**
     * 取消上传
     */
    cancelUpload() {
        uploadCancelled = true;
        console.log('[R2] 用户请求取消上传');
    },
    /**
     * 开启构建后自动询问上传 R2
     */
    async enableAutoPrompt() {
        const projectRoot = getProjectPath();
        const config = (0, r2_1.loadR2Config)(projectRoot) || {
            accountId: '',
            accessKeyId: '',
            secretAccessKey: '',
            bucketName: '',
            autoPromptAfterBuild: false,
        };
        config.autoPromptAfterBuild = true;
        (0, r2_1.saveR2Config)(projectRoot, config);
        console.log('[R2] 构建后自动询问上传：✅ 已开启');
        Editor.Dialog.info('构建后自动询问上传 R2\n\n✅ 已开启', { buttons: ['确定'] });
    },
    /**
     * 关闭构建后自动询问上传 R2
     */
    async disableAutoPrompt() {
        const projectRoot = getProjectPath();
        const config = (0, r2_1.loadR2Config)(projectRoot) || {
            accountId: '',
            accessKeyId: '',
            secretAccessKey: '',
            bucketName: '',
            autoPromptAfterBuild: true,
        };
        config.autoPromptAfterBuild = false;
        (0, r2_1.saveR2Config)(projectRoot, config);
        console.log('[R2] 构建后自动询问上传：❌ 已关闭');
        Editor.Dialog.info('构建后自动询问上传 R2\n\n❌ 已关闭', { buttons: ['确定'] });
    },
    /**
     * 切换构建后自动询问上传（由设置面板触发）
     */
    async toggleAutoPrompt(enabledStr) {
        const enabled = enabledStr === 'true';
        const projectRoot = getProjectPath();
        const config = (0, r2_1.loadR2Config)(projectRoot) || {
            accountId: '',
            accessKeyId: '',
            secretAccessKey: '',
            bucketName: '',
            autoPromptAfterBuild: false,
        };
        config.autoPromptAfterBuild = enabled;
        (0, r2_1.saveR2Config)(projectRoot, config);
        console.log(`[R2] 构建后自动询问上传：${enabled ? '✅ 已开启' : '❌ 已关闭'}`);
    },
    /**
     * 构建后自动询问上传（由 hooks 触发）
     */
    async promptUploadAfterBuild(buildInfoStr) {
        let buildInfo;
        try {
            buildInfo = JSON.parse(buildInfoStr);
        }
        catch (_a) {
            console.error('[R2] 构建信息解析失败');
            return;
        }
        const projectRoot = getProjectPath();
        const config = (0, r2_1.loadR2Config)(projectRoot);
        if (!config || !(0, r2_1.isR2Configured)(config)) {
            console.log('[R2] R2 未配置，跳过构建后上传询问');
            return;
        }
        const bundleList = buildInfo.bundleNames.join(', ');
        const result = await Editor.Dialog.info(`构建完成\n\n平台：${buildInfo.platformName}\n版本：${buildInfo.version}\nBundle：${bundleList}\n\n是否将本次构建推送到 R2？`, {
            title: '上传到 R2',
            buttons: ['上传', '跳过'],
            default: 0,
            cancel: 1,
        });
        if (result.response !== 0) {
            console.log('[R2] 用户跳过构建后上传');
            return;
        }
        // 使用 scanBuildUploadAssets 获取完整列表（含 app 产物）
        const entries = (0, r2_1.scanBuildUploadAssets)(projectRoot);
        const treeData = entries.map(e => ({
            platform: e.platform,
            bundleName: e.bundleName,
            version: e.version,
        }));
        await Editor.Panel.open('framework-plugin.upload');
        setTimeout(() => {
            Editor.Message.send('framework-plugin', 'set-tree-data', JSON.stringify(treeData));
        }, 300);
    },
    // ==================== Pages 功能 ====================
    /**
     * 配置 Pages（打开配置面板）
     */
    async configPages() {
        await Editor.Panel.open('framework-plugin.pages-config');
        const projectRoot = getProjectPath();
        const existing = (0, pages_1.loadPagesConfig)(projectRoot);
        if (existing) {
            setTimeout(() => {
                Editor.Message.send('framework-plugin', 'load-pages-config', JSON.stringify(existing));
            }, 300);
        }
    },
    /**
     * 保存 Pages 配置
     */
    async savePagesConfigFromPanel(configStr) {
        const projectRoot = getProjectPath();
        try {
            const config = JSON.parse(configStr);
            (0, pages_1.savePagesConfig)(projectRoot, config);
            const msg = JSON.stringify({ text: '✅ 配置已保存', color: '#4ec9b0' });
            Editor.Message.send('framework-plugin', 'set-pages-config-status', msg);
            Editor.Message.send('framework-plugin', 'set-settings-pages-status', msg);
            console.log('[Pages] 配置已保存到 .pagesconfig.json');
        }
        catch (_a) {
            const msg = JSON.stringify({ text: '❌ 保存失败', color: '#f44747' });
            Editor.Message.send('framework-plugin', 'set-pages-config-status', msg);
            Editor.Message.send('framework-plugin', 'set-settings-pages-status', msg);
        }
    },
    /**
     * 测试 Pages 连接
     */
    async testPagesConnectionFromPanel(configStr) {
        var _a, _b;
        try {
            const config = JSON.parse(configStr);
            if (!config.pagesApiToken) {
                const msg = JSON.stringify({ text: '❌ 请先填写 API Token', color: '#f44747' });
                Editor.Message.send('framework-plugin', 'set-pages-config-status', msg);
                Editor.Message.send('framework-plugin', 'set-settings-pages-status', msg);
                return;
            }
            // 找第一个配置了的项目测试
            const r2config = (0, r2_1.loadR2Config)(getProjectPath());
            const accountId = (r2config === null || r2config === void 0 ? void 0 : r2config.accountId) || '';
            if (!accountId) {
                const msg = JSON.stringify({ text: '❌ 请先在 R2 配置中填写 Account ID', color: '#f44747' });
                Editor.Message.send('framework-plugin', 'set-pages-config-status', msg);
                Editor.Message.send('framework-plugin', 'set-settings-pages-status', msg);
                return;
            }
            let projectName = '';
            for (const env of ['production', 'staging', 'dev']) {
                if ((_b = (_a = config.pagesProjects) === null || _a === void 0 ? void 0 : _a[env]) === null || _b === void 0 ? void 0 : _b.projectName) {
                    projectName = config.pagesProjects[env].projectName;
                    break;
                }
            }
            if (!projectName) {
                const msg = JSON.stringify({ text: '❌ 请至少配置一个环境的项目名', color: '#f44747' });
                Editor.Message.send('framework-plugin', 'set-pages-config-status', msg);
                Editor.Message.send('framework-plugin', 'set-settings-pages-status', msg);
                return;
            }
            const result = await (0, pages_1.testPagesConnection)(config.pagesApiToken, accountId, projectName);
            const msg = JSON.stringify({
                text: result.success ? `✅ 连接成功 (${projectName})` : `❌ 连接失败: ${result.error}`,
                color: result.success ? '#4ec9b0' : '#f44747',
            });
            Editor.Message.send('framework-plugin', 'set-pages-config-status', msg);
            Editor.Message.send('framework-plugin', 'set-settings-pages-status', msg);
        }
        catch (e) {
            const msg = JSON.stringify({ text: `❌ ${e.message}`, color: '#f44747' });
            Editor.Message.send('framework-plugin', 'set-pages-config-status', msg);
            Editor.Message.send('framework-plugin', 'set-settings-pages-status', msg);
        }
    },
    /**
     * 部署到 Pages
     */
    async deployToPages() {
        const config = _checkPagesConfig();
        if (!config)
            return;
        const r2config = (0, r2_1.loadR2Config)(getProjectPath());
        if (!(0, r2_1.isR2Configured)(r2config)) {
            Editor.Dialog.warn('R2 未配置\n\n请先配置 R2 以获取版本列表。', {
                buttons: ['去配置', '取消'], default: 0, cancel: 1,
            }).then((result) => {
                if (result.response === 0) {
                    Editor.Message.send('framework-plugin', 'config-r2');
                }
            });
            return;
        }
        // 获取 R2 版本列表
        const client = (0, r2_1.createS3Client)(r2config);
        let versions;
        try {
            versions = await (0, pages_1.listR2AppVersions)(client, r2config.bucketName);
        }
        catch (e) {
            Editor.Dialog.error(`获取版本列表失败\n\n${e.message}`);
            return;
        }
        if (versions.length === 0) {
            Editor.Dialog.warn('未找到 App Shell 版本\n\n请先构建并上传到 R2。');
            return;
        }
        const environments = (0, pages_1.getAvailableEnvironments)(config);
        await Editor.Panel.open('framework-plugin.pages-deploy');
        setTimeout(() => {
            Editor.Message.send('framework-plugin', 'set-deploy-data', JSON.stringify({
                versions,
                environments,
            }));
        }, 300);
    },
    /**
     * 执行部署到 Pages
     */
    async doDeployToPages(dataStr) {
        let data;
        try {
            data = JSON.parse(dataStr);
        }
        catch (_a) {
            return;
        }
        const config = (0, pages_1.loadPagesConfig)(getProjectPath());
        const r2config = (0, r2_1.loadR2Config)(getProjectPath());
        if (!config || !r2config)
            return;
        const client = (0, r2_1.createS3Client)(r2config);
        const result = await (0, pages_1.deployFromR2)({
            r2Client: client,
            r2Bucket: r2config.bucketName,
            version: data.version,
            env: data.env,
            commitMessage: data.commitMessage,
            config,
            accountId: r2config.accountId,
            onLog: (msg, type) => {
                console.log(msg);
                Editor.Message.send('framework-plugin', 'append-deploy-log', msg);
            },
        });
        Editor.Message.send('framework-plugin', 'set-deploy-complete', JSON.stringify(result));
    },
    // --- 切换版本相关 ---
    /**
     * 切换版本（打开面板）
     */
    async switchPagesVersion() {
        const config = _checkPagesConfig();
        if (!config)
            return;
        const environments = (0, pages_1.getAvailableEnvironments)(config);
        const firstConfigured = environments.find(e => e.configured);
        if (!firstConfigured) {
            Editor.Dialog.warn('请先配置至少一个 Pages 环境的项目名。');
            return;
        }
        _currentSwitchEnv = firstConfigured.env;
        await Editor.Panel.open('framework-plugin.pages-versions');
        await _loadSwitchVersionData(config, firstConfigured.env);
    },
    /**
     * 切换环境标签（版本面板）
     */
    async switchPagesEnv(env) {
        const config = (0, pages_1.loadPagesConfig)(getProjectPath());
        if (!config)
            return;
        _currentSwitchEnv = env;
        await _loadSwitchVersionData(config, env, 1);
    },
    /**
     * 加载更多版本
     */
    async loadMorePagesVersions(dataStr) {
        const { page } = JSON.parse(dataStr);
        const config = (0, pages_1.loadPagesConfig)(getProjectPath());
        if (!config)
            return;
        const env = _currentSwitchEnv;
        await _loadSwitchVersionData(config, env, page);
    },
    /**
     * 执行版本回滚
     */
    async doSwitchPagesVersion(dataStr) {
        var _a;
        try {
            const { deploymentId } = JSON.parse(dataStr);
            const config = (0, pages_1.loadPagesConfig)(getProjectPath());
            const r2config = (0, r2_1.loadR2Config)(getProjectPath());
            if (!config || !r2config)
                return;
            const env = _currentSwitchEnv;
            const projectName = (_a = config.pagesProjects[env]) === null || _a === void 0 ? void 0 : _a.projectName;
            const accountId = r2config.accountId;
            console.log(`[Pages] 正在切换版本: deploymentId=${deploymentId}, project=${projectName}, env=${env}`);
            Editor.Message.send('framework-plugin', 'set-versions-status', JSON.stringify({
                text: '正在切换版本...',
                color: '#569cd6',
            }));
            await (0, pages_1.rollbackDeployment)(config.pagesApiToken, accountId, projectName, deploymentId);
            console.log(`[Pages] 版本切换 API 调用成功，等待 API 状态更新...`);
            Editor.Message.send('framework-plugin', 'set-versions-status', JSON.stringify({
                text: '✅ 已切换版本，正在刷新列表...',
                color: '#4ec9b0',
            }));
            // 等待 Cloudflare API 状态更新后再刷新列表
            await new Promise(resolve => setTimeout(resolve, 2000));
            // 刷新列表（重新从第一页加载）
            await _loadSwitchVersionData(config, env, 1);
            console.log(`[Pages] 列表已刷新`);
        }
        catch (e) {
            console.error(`[Pages] 版本切换失败:`, e);
            Editor.Message.send('framework-plugin', 'set-versions-status', JSON.stringify({
                text: `❌ 切换失败: ${e.message}`,
                color: '#f44747',
            }));
        }
    },
    // --- 清理版本相关 ---
    /**
     * 清理版本（打开面板）
     */
    async cleanupPagesVersions() {
        const config = _checkPagesConfig();
        if (!config)
            return;
        const environments = (0, pages_1.getAvailableEnvironments)(config);
        const firstConfigured = environments.find(e => e.configured);
        if (!firstConfigured) {
            Editor.Dialog.warn('请先配置至少一个 Pages 环境的项目名。');
            return;
        }
        _currentCleanupEnv = firstConfigured.env;
        await Editor.Panel.open('framework-plugin.pages-cleanup');
        await _loadCleanupData(config, firstConfigured.env);
    },
    /**
     * 切换环境标签（清理面板）
     */
    async cleanupPagesEnv(env) {
        const config = (0, pages_1.loadPagesConfig)(getProjectPath());
        if (!config)
            return;
        _currentCleanupEnv = env;
        await _loadCleanupData(config, env);
    },
    /**
     * 执行清理
     */
    async doCleanupPagesVersions(dataStr) {
        var _a;
        try {
            const { ids } = JSON.parse(dataStr);
            const config = (0, pages_1.loadPagesConfig)(getProjectPath());
            const r2config = (0, r2_1.loadR2Config)(getProjectPath());
            if (!config || !r2config)
                return;
            const env = _currentCleanupEnv;
            const projectName = (_a = config.pagesProjects[env]) === null || _a === void 0 ? void 0 : _a.projectName;
            const accountId = r2config.accountId;
            let success = 0;
            let failed = 0;
            for (let i = 0; i < ids.length; i++) {
                Editor.Message.send('framework-plugin', 'set-cleanup-progress', JSON.stringify({
                    current: i + 1,
                    total: ids.length,
                    status: `删除中...`,
                }));
                try {
                    await (0, pages_1.deleteDeployment)(config.pagesApiToken, accountId, projectName, ids[i]);
                    success++;
                }
                catch (e) {
                    console.error(`[Pages] 删除部署 ${ids[i]} 失败:`, e.message);
                    failed++;
                }
            }
            Editor.Message.send('framework-plugin', 'set-cleanup-complete', JSON.stringify({ success, failed }));
            // 刷新列表
            await _loadCleanupData(config, env);
        }
        catch (e) {
            console.error('[Pages] 清理失败', e);
        }
    },
    // ==================== Bundle 版本管理 ====================
    async manageBundleVersions() {
        const config = (0, r2_1.loadR2Config)(getProjectPath());
        if (!(0, r2_1.isR2Configured)(config)) {
            Editor.Dialog.warn('请先配置 R2', { buttons: ['确定'] });
            return;
        }
        Editor.Panel.open('framework-plugin.bundle-versions');
    },
    async loadBundlePlatforms() {
        console.log('[Bundle版本管理] 正在加载平台列表...');
        const config = (0, r2_1.loadR2Config)(getProjectPath());
        if (!(0, r2_1.isR2Configured)(config) || !config) {
            console.error('[Bundle版本管理] R2 未配置');
            return;
        }
        try {
            const client = (0, r2_1.createS3Client)(config);
            const platforms = await (0, r2_1.listR2Platforms)(client, config.bucketName);
            console.log(`[Bundle版本管理] 平台列表加载成功: ${platforms.join(', ')}`);
            Editor.Message.send('framework-plugin', 'set-bundle-platforms', JSON.stringify(platforms));
        }
        catch (e) {
            console.error('[Bundle版本管理] 加载平台列表失败:', e.message);
            Editor.Message.send('framework-plugin', 'set-bundle-platforms', '[]');
        }
    },
    async loadBundleTreeByPlatform(platform) {
        console.log(`[Bundle版本管理] 正在加载平台 ${platform} 的 Bundle 树...`);
        const config = (0, r2_1.loadR2Config)(getProjectPath());
        if (!(0, r2_1.isR2Configured)(config) || !config) {
            console.error('[Bundle版本管理] R2 未配置');
            return;
        }
        try {
            const client = (0, r2_1.createS3Client)(config);
            const treeData = await (0, r2_1.listR2AllBundleVersions)(client, config.bucketName, platform);
            console.log(`[Bundle版本管理] 平台 ${platform} 的 Bundle 树加载成功，共 ${treeData.length} 个 Bundle`);
            Editor.Message.send('framework-plugin', 'set-bundle-tree', JSON.stringify(treeData));
        }
        catch (e) {
            console.error('[Bundle版本管理] 加载Bundle失败:', e.message);
            Editor.Message.send('framework-plugin', 'set-bundle-tree', '[]');
        }
    },
    async loadBundleVersionList(platform, bundleName) {
        console.log(`[Bundle版本管理] 正在加载平台 ${platform} Bundle ${bundleName} 的版本列表...`);
        const config = (0, r2_1.loadR2Config)(getProjectPath());
        if (!(0, r2_1.isR2Configured)(config) || !config) {
            console.error('[Bundle版本管理] R2 未配置');
            return;
        }
        try {
            const client = (0, r2_1.createS3Client)(config);
            const versions = await (0, r2_1.listR2BundleVersions)(client, config.bucketName, platform, bundleName);
            Editor.Message.send('framework-plugin', 'set-bundle-version-list', JSON.stringify(versions));
        }
        catch (e) {
            console.error('[Bundle版本管理] 加载版本列表失败:', e.message);
            Editor.Message.send('framework-plugin', 'set-bundle-version-list', '[]');
        }
    },
    async doSwitchBundleVersion(platform, bundleName, env, version) {
        const config = (0, r2_1.loadR2Config)(getProjectPath());
        if (!(0, r2_1.isR2Configured)(config) || !config)
            return;
        try {
            const client = (0, r2_1.createS3Client)(config);
            await (0, r2_1.setR2BundleVersion)(client, config.bucketName, platform, bundleName, env, version);
            console.log(`[Bundle版本管理] ✅ 切换成功: ${platform}/${bundleName} ${env}=${version}`);
            Editor.Message.send('framework-plugin', 'switch-bundle-version-result', true, '切换成功');
        }
        catch (e) {
            console.error('[Bundle版本管理] 切换失败:', e.message);
            Editor.Message.send('framework-plugin', 'switch-bundle-version-result', false, e.message);
        }
    },
    /**
     * 一键将当前平台所有 Bundle 的最新版本应用到指定环境
     */
    async applyLatestToEnv(platform, env) {
        console.log(`[Bundle版本管理] 一键应用最新版本: ${platform} → ${env}`);
        const config = (0, r2_1.loadR2Config)(getProjectPath());
        if (!(0, r2_1.isR2Configured)(config) || !config) {
            Editor.Message.send('framework-plugin', 'apply-latest-result', JSON.stringify({
                success: false, message: 'R2 未配置',
            }));
            return;
        }
        try {
            const client = (0, r2_1.createS3Client)(config);
            const latestMap = await (0, r2_1.getR2LatestVersions)(client, config.bucketName, platform);
            if (latestMap.size === 0) {
                Editor.Message.send('framework-plugin', 'apply-latest-result', JSON.stringify({
                    success: false, message: '该平台下没有找到任何 Bundle',
                }));
                return;
            }
            const errors = [];
            let successCount = 0;
            for (const [bundleName, latestVersion] of latestMap.entries()) {
                try {
                    await (0, r2_1.setR2BundleVersion)(client, config.bucketName, platform, bundleName, env, latestVersion);
                    console.log(`[Bundle版本管理] ✅ ${bundleName} ${env}=${latestVersion}`);
                    successCount++;
                }
                catch (e) {
                    console.error(`[Bundle版本管理] ❌ ${bundleName}: ${e.message}`);
                    errors.push(`${bundleName}: ${e.message}`);
                }
            }
            const message = errors.length === 0
                ? `成功将 ${successCount} 个 Bundle 的最新版本应用到 ${env.toUpperCase()}`
                : `完成 ${successCount}/${latestMap.size}，失败 ${errors.length}：\n${errors.join('\n')}`;
            Editor.Message.send('framework-plugin', 'apply-latest-result', JSON.stringify({
                success: errors.length === 0,
                message,
            }));
        }
        catch (e) {
            console.error('[Bundle版本管理] 一键应用失败:', e.message);
            Editor.Message.send('framework-plugin', 'apply-latest-result', JSON.stringify({
                success: false, message: e.message,
            }));
        }
    },
};
const load = function () {
    console.log('[框架管理] 插件已加载');
    // 显示 R2 自动询问状态
    const config = (0, r2_1.loadR2Config)(getProjectPath());
    if (config === null || config === void 0 ? void 0 : config.autoPromptAfterBuild) {
        console.log('[框架管理] R2 构建后自动询问上传：已开启');
    }
};
exports.load = load;
const unload = function () {
    console.log('[框架管理] 插件已卸载');
};
exports.unload = unload;
//# sourceMappingURL=main.js.map