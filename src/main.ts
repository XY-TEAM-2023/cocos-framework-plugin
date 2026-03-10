import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
    loadR2Config, saveR2Config, isR2Configured, createS3Client,
    testConnection, scanBuildUploadAssets, uploadBundle, deleteVersionDir,
    checkVersionExists, checkBundleChanged,
    listR2Platforms, listR2Bundles, listR2BundleVersions,
    listR2AllBundleVersions, getR2BundleVersions, setR2BundleVersion,
    R2Config, BundleVersionEntry, UploadProgress,
} from './r2';
import {
    loadPagesConfig, savePagesConfig, isPagesConfigured, isEnvConfigured,
    getAvailableEnvironments, listR2AppVersions, deployFromR2,
    listDeployments, rollbackDeployment, deleteDeployment, testPagesConnection,
    PagesConfig, PagesEnvironment, PagesDeployment,
} from './pages';

// ==================== Git 工具函数 ====================

function runCommand(cmd: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(cmd, { cwd, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

function getProjectPath(): string {
    return Editor.Project.path;
}

function getFrameworkPath(): string {
    return path.join(getProjectPath(), 'assets', 'framework');
}

function getPluginPath(): string {
    return path.join(getProjectPath(), 'extensions', 'framework-plugin');
}

function isDevProject(): boolean {
    return path.basename(getProjectPath()) === 'cocos-framework-dev';
}

function frameworkExists(): boolean {
    return fs.existsSync(path.join(getFrameworkPath(), '.git'));
}

async function getCurrentVersion(repoPath: string): Promise<string> {
    try {
        return await runCommand('git describe --tags --exact-match 2>/dev/null', repoPath);
    } catch {
        try {
            const hash = await runCommand('git rev-parse --short HEAD', repoPath);
            return `${hash} (未标记版本)`;
        } catch {
            return '未知';
        }
    }
}

async function getLatestTag(repoPath: string): Promise<string | null> {
    try {
        await runCommand('git fetch --tags', repoPath);
        const tags = await runCommand("git tag -l 'v*' --sort=-version:refname", repoPath);
        const stableTags = tags.split('\n').filter(t => /^v\d+\.\d+\.\d+$/.test(t));
        return stableTags.length > 0 ? stableTags[0] : null;
    } catch {
        return null;
    }
}

/**
 * 获取最新稳定 Tag（不做 fetch，假设已 fetch 过）
 */
async function getStableTag(repoPath: string): Promise<string | null> {
    try {
        const tags = await runCommand("git tag -l 'v*' --sort=-version:refname", repoPath);
        const stableTags = tags.split('\n').filter(t => /^v\d+\.\d+\.\d+$/.test(t));
        return stableTags.length > 0 ? stableTags[0] : null;
    } catch {
        return null;
    }
}

async function getAllTags(repoPath: string): Promise<string[]> {
    try {
        await runCommand('git fetch --tags', repoPath);
        const tags = await runCommand("git tag -l 'v*' --sort=-version:refname", repoPath);
        return tags.split('\n').filter(t => t.trim() !== '');
    } catch {
        return [];
    }
}

// ==================== 日志 ====================

async function log(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
    const prefix = '[框架管理]';
    switch (type) {
        case 'success': console.log(`${prefix} ✅ ${message}`); break;
        case 'warn':    console.warn(`${prefix} ⚠️ ${message}`); break;
        case 'error':   console.error(`${prefix} ❌ ${message}`); break;
        default:        console.log(`${prefix} ${message}`);
    }
    try {
        Editor.Message.send('framework-plugin', 'append-log', JSON.stringify({ message, type, time: new Date().toLocaleTimeString() }));
    } catch (e) {}
}

/**
 * 打开日志面板并等待就绪
 */
async function openLog() {
    await Editor.Panel.open('framework-plugin.log');
}

function setTitle(title: string) {
    Editor.Message.send('framework-plugin', 'set-title', title);
}

// ==================== R2 上传状态 ====================

let uploadCancelled = false;
let _currentSwitchEnv: PagesEnvironment = 'production';
let _currentCleanupEnv: PagesEnvironment = 'production';

// ==================== Pages 辅助函数 ====================

function _checkPagesConfig(): PagesConfig | null {
    const projectRoot = getProjectPath();
    const config = loadPagesConfig(projectRoot);
    if (!isPagesConfigured(config)) {
        Editor.Dialog.warn('Pages 未配置\n\n请先配置 Cloudflare Pages API Token。', {
            buttons: ['去配置', '取消'], default: 0, cancel: 1,
        }).then((result: any) => {
            if (result.response === 0) {
                Editor.Message.send('framework-plugin', 'config-pages');
            }
        });
        return null;
    }
    return config;
}

async function _loadSwitchVersionData(config: PagesConfig, env: PagesEnvironment, page: number = 1) {
    const r2config = loadR2Config(getProjectPath());
    const accountId = r2config?.accountId || '';
    const projectName = config.pagesProjects[env]?.projectName;

    if (!projectName || !accountId) return;

    try {
        const perPage = 10;
        const deployments = await listDeployments(config.pagesApiToken, accountId, projectName, page, perPage);
        const environments = getAvailableEnvironments(config);
        
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
    } catch (e: any) {
        console.error('[Pages] 获取部署列表失败', e);
    }
}

async function _loadCleanupData(config: PagesConfig, env: PagesEnvironment) {
    const r2config = loadR2Config(getProjectPath());
    const accountId = r2config?.accountId || '';
    const projectName = config.pagesProjects[env]?.projectName;

    if (!projectName || !accountId) return;

    try {
        const deployments = await listDeployments(config.pagesApiToken, accountId, projectName);

        // 应用锁定规则
        const successDeployments = deployments.filter(d => d.latest_stage?.status === 'success');
        const recentSuccessIds = new Set(successDeployments.slice(0, 3).map(d => d.id));

        const withLock = deployments.map(d => {
            let locked = false;
            let lockReason = '';

            if (d.is_current) {
                locked = true;
                lockReason = '当前生产';
            } else if (recentSuccessIds.has(d.id)) {
                locked = true;
                lockReason = '最近版本';
            }

            return { ...d, locked, lockReason };
        });

        const environments = getAvailableEnvironments(config);
        setTimeout(() => {
            Editor.Message.send('framework-plugin', 'set-cleanup-data', JSON.stringify({
                environments,
                deployments: withLock,
                currentEnv: env,
            }));
        }, 300);
    } catch (e: any) {
        console.error('[Pages] 获取部署列表失败', e);
    }
}

// ==================== 插件入口 ====================

export const methods: { [key: string]: (...args: any) => any } = {

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
                } else {
                    await runCommand('git checkout main', fwPath).catch(() => {});
                    await runCommand('git reset --hard origin/main', fwPath);
                    const afterHash = await runCommand('git rev-parse --short HEAD', fwPath);
                    await log(`[框架] 已更新 ${beforeHash} → ${afterHash}`, 'success');
                }

                await log('[框架] 正在刷新编辑器资源缓存...');
                await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets/framework');
                await log('[框架] 编辑器资源缓存已刷新', 'success');
            } catch (e: any) {
                await log(`[框架] 更新失败：${e.message}`, 'error');
            }
        } else {
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
            } else {
                await runCommand('git checkout main', pluginPath).catch(() => {});
                await runCommand('git reset --hard origin/main', pluginPath);
                const afterHash = await runCommand('git rev-parse --short HEAD', pluginPath);
                await log(`[插件] 已更新 ${beforeHash} → ${afterHash}`, 'success');
                await log('[插件] 请在 扩展管理器 中关闭再开启本插件(framework-plugin)以生效', 'warn');
            }
        } catch (e: any) {
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

        } catch (e: any) {
            await log(`[框架] 切换版本失败：${e.message}`, 'error');
        }
    },

    /**
     * 执行版本切换（通过控制台或消息调用）
     */
    async doSwitchVersion(targetHash: string) {
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
        } catch (e: any) {
            await log(`[框架] 切换失败：${e.message}`, 'error');
        }
    },

    /**
     * 推送框架版本（仅 dev 项目）
     */
    async publishFramework() {
        if (!isDevProject()) {
            Editor.Dialog.warn('无权限');
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

        } catch (e: any) {
            await log(`[框架] 推送失败：${e.message}`, 'error');
            Editor.Dialog.error(`推送失败\n${e.message}`);
        }
    },

    /**
     * 执行框架推送（由面板输入触发）
     */
    async doPublishFramework(commitMsg: string) {
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
        } catch (e: any) {
            await log(`[框架] 推送失败：${e.message}`, 'error');
        }
    },

    /**
     * 推送插件版本（仅 dev 项目）
     */
    async publishPlugin() {
        if (!isDevProject()) {
            Editor.Dialog.warn('无权限');
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

        } catch (e: any) {
            await log(`[插件] 推送失败：${e.message}`, 'error');
            Editor.Dialog.error(`推送失败\n${e.message}`);
        }
    },

    /**
     * 执行插件推送（由面板输入触发）
     */
    async doPublishPlugin(commitMsg: string) {
        const pluginPath = getPluginPath();
        try {
            const msg = (commitMsg || 'feat: 更新插件').replace(/\n/g, ' ');

            await log('[插件] 正在编译...');
            try {
                await runCommand('npm run build', pluginPath);
            } catch {
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
        } catch (e: any) {
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
            } else {
                await log('[框架] 未安装', 'warn');
            }

            const pluginVersion = await getCurrentVersion(getPluginPath());
            await log(`[插件] 版本：${pluginVersion}`);
            await log(`[插件] 路径：${getPluginPath()}`);

            await log(`[项目] 路径：${getProjectPath()}`);
            await log(`[项目] 开发模式：${isDevProject() ? '是（推送功能已启用）' : '否'}`);

            const fwVer = frameworkExists() ? await getCurrentVersion(getFrameworkPath()) : '未安装';
            Editor.Dialog.info(`关于 - 框架管理插件\n\n框架版本：${fwVer}\n插件版本：${pluginVersion}\n开发模式：${isDevProject() ? '是' : '否'}`);
        } catch (e: any) {
            await log(`获取信息失败：${e.message}`, 'error');
        }
    },

    /**
     * 构建插件（仅 dev 项目）
     */
    async buildPlugin() {
        if (!isDevProject()) {
            Editor.Dialog.warn('无权限');
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
            } catch {
                await log('[插件] 依赖缺失，正在安装...');
                await runCommand('npm install --ignore-scripts', pluginPath);
                await runCommand('npm run build', pluginPath);
            }
            await log('[插件] 编译完成', 'success');
            await log('[插件] 请在 扩展管理器 中关闭再开启本插件(framework-plugin)以生效', 'warn');
            await log('========== 构建完成 ✅ ==========', 'success');
        } catch (e: any) {
            await log(`[插件] 编译失败：${e.message}`, 'error');
        }
    },

    /**
     * 修复框架（还原框架和插件到最后提交状态）
     */
    async repairFramework() {
        const result = await Editor.Dialog.warn(
            '修复框架\n\n此操作将丢弃框架和插件的所有本地修改。\n\n确定要继续吗？',
            { buttons: ['确认修复', '取消'], default: 0, cancel: 1 }
        );

        if (result.response !== 0) return;

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
            } else {
                try {
                    const status = await runCommand('git status --porcelain', fwPath).catch(() => '');
                    if (!status) {
                        await log('[框架] 无需修复，没有本地修改', 'success');
                    } else {
                        await log('[框架] 检测到本地修改：');
                        for (const line of status.split('\n')) {
                            await log(`[框架]   ${line}`);
                        }
                        await runCommand('git checkout .', fwPath);
                        await runCommand('git clean -fd', fwPath);
                        await log('[框架] 已还原到最后提交状态', 'success');
                    }
                } catch (e: any) {
                    await log(`[框架] 修复失败：${e.message}`, 'error');
                }
            }
        } else {
            await log('[框架] 子模块不存在，跳过', 'warn');
        }

        await log('─────────────────────────────');

        // --- 修复插件 ---
        if (path.resolve(pluginPath) !== path.resolve(expectedPluginPath)) {
            await log('[插件] 路径异常，跳过修复', 'error');
        } else {
            try {
                const status = await runCommand('git status --porcelain', pluginPath).catch(() => '');
                if (!status) {
                    await log('[插件] 无需修复，没有本地修改', 'success');
                } else {
                    await log('[插件] 检测到本地修改：');
                    for (const line of status.split('\n')) {
                        await log(`[插件]   ${line}`);
                    }
                    await runCommand('git checkout .', pluginPath);
                    await runCommand('git clean -fd', pluginPath);
                    await log('[插件] 已还原到最后提交状态', 'success');
                    await log('[插件] 请在 扩展管理器 中关闭再开启本插件(framework-plugin)以生效', 'warn');
                }
            } catch (e: any) {
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
        const existing = loadR2Config(projectRoot);
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
        const existing = loadR2Config(projectRoot);
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
        const existing = loadPagesConfig(projectRoot);
        if (existing) {
            setTimeout(() => {
                Editor.Message.send('framework-plugin', 'load-settings-pages-config', JSON.stringify(existing));
            }, 100);
        }
    },

    /**
     * 保存 R2 配置（由配置面板触发）
     */
    async saveR2ConfigFromPanel(configStr: string) {
        const projectRoot = getProjectPath();
        let input: { accountId: string; accessKeyId: string; secretAccessKey: string; bucketName: string };
        try {
            input = JSON.parse(configStr);
        } catch {
            return;
        }

        const existing = loadR2Config(projectRoot);
        const config: R2Config = {
            accountId: input.accountId,
            accessKeyId: input.accessKeyId,
            secretAccessKey: input.secretAccessKey,
            bucketName: input.bucketName,
            autoPromptAfterBuild: existing?.autoPromptAfterBuild ?? true,
        };

        saveR2Config(projectRoot, config);
        const statusMsg = JSON.stringify({ text: '✅ 配置已保存', color: '#4ec9b0' });
        Editor.Message.send('framework-plugin', 'set-r2-config-status', statusMsg);
        Editor.Message.send('framework-plugin', 'set-settings-r2-status', statusMsg);
        console.log('[R2] 配置已保存到 .r2config.json');
    },

    /**
     * 测试 R2 连接（由配置面板触发）
     */
    async testR2Connection(configStr: string) {
        let input: { accountId: string; accessKeyId: string; secretAccessKey: string; bucketName: string };
        try {
            input = JSON.parse(configStr);
        } catch {
            return;
        }

        if (!input.accountId || !input.accessKeyId || !input.secretAccessKey || !input.bucketName) {
            const msg = JSON.stringify({ text: '❌ 请先填写所有字段', color: '#f44747', verified: false });
            Editor.Message.send('framework-plugin', 'set-r2-config-status', msg);
            Editor.Message.send('framework-plugin', 'set-settings-r2-status', msg);
            return;
        }

        const config: R2Config = { ...input, autoPromptAfterBuild: true };
        const result = await testConnection(config);

        if (result.success) {
            const msg = JSON.stringify({ text: '✅ 连接成功！', color: '#4ec9b0', verified: true });
            Editor.Message.send('framework-plugin', 'set-r2-config-status', msg);
            Editor.Message.send('framework-plugin', 'set-settings-r2-status', msg);
        } else {
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
        const config = loadR2Config(projectRoot);

        if (!isR2Configured(config)) {
            const result = await Editor.Dialog.warn(
                'R2 未配置\n\n请先配置 R2 连接信息。',
                { buttons: ['去配置', '取消'], default: 0, cancel: 1 }
            );
            if (result.response === 0) {
                Editor.Message.send('framework-plugin', 'config-r2');
            }
            return;
        }

        // 扫描 build_upload_assets
        const entries = scanBuildUploadAssets(projectRoot);

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
    async doUploadToR2(selectionsStr: string) {
        const projectRoot = getProjectPath();
        const config = loadR2Config(projectRoot);
        if (!config || !isR2Configured(config)) {
            await log('[R2] \u914d\u7f6e\u65e0\u6548', 'error');
            return;
        }

        let selections: Array<{ platform: string; bundleName: string; version: string }>;
        try {
            selections = JSON.parse(selectionsStr);
        } catch {
            console.error('[R2] \u9009\u62e9\u6570\u636e\u89e3\u6790\u5931\u8d25');
            return;
        }

        uploadCancelled = false;
        const client = createS3Client(config);

        // \u5207\u6362\u9762\u677f\u5230\u4e0a\u4f20\u6a21\u5f0f
        Editor.Message.send('framework-plugin', 'set-uploading', 'true');

        console.log('[R2] ========== \u4e0a\u4f20\u5230 R2 \u2601\ufe0f ==========');
        console.log(`[R2] \u9009\u62e9\u4e86 ${selections.length} \u4e2a\u7248\u672c`);

        // ======= \u7b2c\u4e00\u9636\u6bb5\uff1a\u53d8\u66f4\u68c0\u6d4b =======
        console.log('[R2] --- \u5f00\u59cb\u53d8\u66f4\u68c0\u6d4b ---');
        const toUpload: Array<{ sel: typeof selections[0]; entry: BundleVersionEntry }> = [];
        let skipCount = 0;

        for (const sel of selections) {
            if (uploadCancelled) break;

            const isApp = sel.bundleName === '\ud83d\udce6 app';
            const localDir = isApp
                ? path.join(projectRoot, 'build_upload_assets', sel.platform, 'app', sel.version)
                : path.join(projectRoot, 'build_upload_assets', sel.platform, 'remote', sel.bundleName, sel.version);

            const entry: BundleVersionEntry = {
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

            const changeResult = await checkBundleChanged(client, config.bucketName, entry);

            if (changeResult === 'unchanged') {
                skipCount++;
                console.log(`[R2] \u23ed\ufe0f ${sel.platform}/${sel.bundleName}/${sel.version} \u65e0\u7248\u672c\u53d8\u5316\uff0c\u8df3\u8fc7\u4e0a\u4f20`);
                Editor.Message.send('framework-plugin', 'update-bundle-status', JSON.stringify({
                    platform: sel.platform, bundleName: sel.bundleName,
                    status: '\u65e0\u66f4\u65b0', color: '#6a9955',
                }));
            } else {
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
            if (uploadCancelled) break;

            Editor.Message.send('framework-plugin', 'update-bundle-status', JSON.stringify({
                platform: sel.platform, bundleName: sel.bundleName,
                status: '\u4e0a\u4f20\u4e2d...', color: '#569cd6',
            }));

            console.log(`[R2] \u4e0a\u4f20 ${sel.platform}/${sel.bundleName}/${sel.version}...`);

            const result = await uploadBundle({
                client,
                bucket: config.bucketName,
                entry,
                onProgress: (progress: UploadProgress) => {
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
                    const retry = await Editor.Dialog.warn(
                        `\u4e0a\u4f20\u5931\u8d25\n\n${sel.platform}/${sel.bundleName}/${sel.version}\n\n\u662f\u5426\u91cd\u8bd5\uff1f`,
                        { buttons: ['\u91cd\u8bd5', '\u505c\u6b62\u4e0a\u4f20'], default: 0, cancel: 1 }
                    );
                    if (retry.response === 0) {
                        const retryResult = await uploadBundle({
                            client,
                            bucket: config.bucketName,
                            entry,
                            onProgress: (progress: UploadProgress) => {
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
                        } else {
                            failCount++;
                            console.log(`[R2] \u274c ${sel.platform}/${sel.bundleName}/${sel.version} \u91cd\u8bd5\u4ecd\u5931\u8d25`);
                            Editor.Message.send('framework-plugin', 'update-bundle-status', JSON.stringify({
                                platform: sel.platform, bundleName: sel.bundleName,
                                status: '\u5931\u8d25', color: '#f44747',
                            }));
                            const keyPrefix = sel.bundleName === '\ud83d\udce6 app'
                                ? `${sel.platform}/app/${sel.version}`
                                : `${sel.platform}/remote/${sel.bundleName}/${sel.version}`;
                            await deleteVersionDir(client, config.bucketName, keyPrefix);
                            console.log(`[R2] \u5df2\u6e05\u7406\u8fdc\u7aef\u4e0d\u5b8c\u6574\u7248\u672c`);
                        }
                    } else {
                        failCount++;
                        Editor.Message.send('framework-plugin', 'update-bundle-status', JSON.stringify({
                            platform: sel.platform, bundleName: sel.bundleName,
                            status: '\u5931\u8d25', color: '#f44747',
                        }));
                        const keyPrefix = sel.bundleName === '\ud83d\udce6 app'
                            ? `${sel.platform}/app/${sel.version}`
                            : `${sel.platform}/remote/${sel.bundleName}/${sel.version}`;
                        await deleteVersionDir(client, config.bucketName, keyPrefix);
                        console.log(`[R2] \u5df2\u6e05\u7406\u8fdc\u7aef\u4e0d\u5b8c\u6574\u7248\u672c`);
                        uploadCancelled = true;
                    }
                    break;
                }
            }

            if (uploadCancelled) break;
        }

        // \u6062\u590d\u9762\u677f
        Editor.Message.send('framework-plugin', 'set-uploading', 'false');

        if (uploadCancelled) {
            Editor.Message.send('framework-plugin', 'set-upload-error', '\u4e0a\u4f20\u5df2\u53d6\u6d88');
            console.log('[R2] ========== \u4e0a\u4f20\u5df2\u53d6\u6d88 \u26a0\ufe0f ==========');
        } else {
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
        const config = loadR2Config(projectRoot) || {
            accountId: '',
            accessKeyId: '',
            secretAccessKey: '',
            bucketName: '',
            autoPromptAfterBuild: false,
        };

        config.autoPromptAfterBuild = true;
        saveR2Config(projectRoot, config);
        console.log('[R2] 构建后自动询问上传：✅ 已开启');
        Editor.Dialog.info('构建后自动询问上传 R2\n\n✅ 已开启', { buttons: ['确定'] });
    },

    /**
     * 关闭构建后自动询问上传 R2
     */
    async disableAutoPrompt() {
        const projectRoot = getProjectPath();
        const config = loadR2Config(projectRoot) || {
            accountId: '',
            accessKeyId: '',
            secretAccessKey: '',
            bucketName: '',
            autoPromptAfterBuild: true,
        };

        config.autoPromptAfterBuild = false;
        saveR2Config(projectRoot, config);
        console.log('[R2] 构建后自动询问上传：❌ 已关闭');
        Editor.Dialog.info('构建后自动询问上传 R2\n\n❌ 已关闭', { buttons: ['确定'] });
    },

    /**
     * 切换构建后自动询问上传（由设置面板触发）
     */
    async toggleAutoPrompt(enabledStr: string) {
        const enabled = enabledStr === 'true';
        const projectRoot = getProjectPath();
        const config = loadR2Config(projectRoot) || {
            accountId: '',
            accessKeyId: '',
            secretAccessKey: '',
            bucketName: '',
            autoPromptAfterBuild: false,
        };
        config.autoPromptAfterBuild = enabled;
        saveR2Config(projectRoot, config);
        console.log(`[R2] 构建后自动询问上传：${enabled ? '✅ 已开启' : '❌ 已关闭'}`);
    },

    /**
     * 构建后自动询问上传（由 hooks 触发）
     */
    async promptUploadAfterBuild(buildInfoStr: string) {
        let buildInfo: { platformName: string; version: string; bundleNames: string[] };
        try {
            buildInfo = JSON.parse(buildInfoStr);
        } catch {
            console.error('[R2] 构建信息解析失败');
            return;
        }

        const projectRoot = getProjectPath();
        const config = loadR2Config(projectRoot);
        if (!config || !isR2Configured(config)) {
            console.log('[R2] R2 未配置，跳过构建后上传询问');
            return;
        }

        const bundleList = buildInfo.bundleNames.join(', ');
        const result = await Editor.Dialog.info(
            `构建完成\n\n平台：${buildInfo.platformName}\n版本：${buildInfo.version}\nBundle：${bundleList}\n\n是否将本次构建推送到 R2？`,
            {
                title: '上传到 R2',
                buttons: ['上传', '跳过'],
                default: 0,
                cancel: 1,
            }
        );

        if (result.response !== 0) {
            console.log('[R2] 用户跳过构建后上传');
            return;
        }

        // 使用 scanBuildUploadAssets 获取完整列表（含 app 产物）
        const entries = scanBuildUploadAssets(projectRoot);
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
        const existing = loadPagesConfig(projectRoot);
        if (existing) {
            setTimeout(() => {
                Editor.Message.send('framework-plugin', 'load-pages-config', JSON.stringify(existing));
            }, 300);
        }
    },

    /**
     * 保存 Pages 配置
     */
    async savePagesConfigFromPanel(configStr: string) {
        const projectRoot = getProjectPath();
        try {
            const config: PagesConfig = JSON.parse(configStr);
            savePagesConfig(projectRoot, config);
            const msg = JSON.stringify({ text: '✅ 配置已保存', color: '#4ec9b0' });
            Editor.Message.send('framework-plugin', 'set-pages-config-status', msg);
            Editor.Message.send('framework-plugin', 'set-settings-pages-status', msg);
            console.log('[Pages] 配置已保存到 .pagesconfig.json');
        } catch {
            const msg = JSON.stringify({ text: '❌ 保存失败', color: '#f44747' });
            Editor.Message.send('framework-plugin', 'set-pages-config-status', msg);
            Editor.Message.send('framework-plugin', 'set-settings-pages-status', msg);
        }
    },

    /**
     * 测试 Pages 连接
     */
    async testPagesConnectionFromPanel(configStr: string) {
        try {
            const config = JSON.parse(configStr);
            if (!config.pagesApiToken) {
                const msg = JSON.stringify({ text: '❌ 请先填写 API Token', color: '#f44747' });
                Editor.Message.send('framework-plugin', 'set-pages-config-status', msg);
                Editor.Message.send('framework-plugin', 'set-settings-pages-status', msg);
                return;
            }
            // 找第一个配置了的项目测试
            const r2config = loadR2Config(getProjectPath());
            const accountId = r2config?.accountId || '';
            if (!accountId) {
                const msg = JSON.stringify({ text: '❌ 请先在 R2 配置中填写 Account ID', color: '#f44747' });
                Editor.Message.send('framework-plugin', 'set-pages-config-status', msg);
                Editor.Message.send('framework-plugin', 'set-settings-pages-status', msg);
                return;
            }
            let projectName = '';
            for (const env of ['production', 'staging', 'dev'] as PagesEnvironment[]) {
                if (config.pagesProjects?.[env]?.projectName) {
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
            const result = await testPagesConnection(config.pagesApiToken, accountId, projectName);
            const msg = JSON.stringify({
                text: result.success ? `✅ 连接成功 (${projectName})` : `❌ 连接失败: ${result.error}`,
                color: result.success ? '#4ec9b0' : '#f44747',
            });
            Editor.Message.send('framework-plugin', 'set-pages-config-status', msg);
            Editor.Message.send('framework-plugin', 'set-settings-pages-status', msg);
        } catch (e: any) {
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
        if (!config) return;

        const r2config = loadR2Config(getProjectPath());
        if (!isR2Configured(r2config)) {
            Editor.Dialog.warn('R2 未配置\n\n请先配置 R2 以获取版本列表。', {
                buttons: ['去配置', '取消'], default: 0, cancel: 1,
            }).then((result: any) => {
                if (result.response === 0) {
                    Editor.Message.send('framework-plugin', 'config-r2');
                }
            });
            return;
        }

        // 获取 R2 版本列表
        const client = createS3Client(r2config!);
        let versions: string[];
        try {
            versions = await listR2AppVersions(client, r2config!.bucketName);
        } catch (e: any) {
            Editor.Dialog.error(`获取版本列表失败\n\n${e.message}`);
            return;
        }

        if (versions.length === 0) {
            Editor.Dialog.warn('未找到 App Shell 版本\n\n请先构建并上传到 R2。');
            return;
        }

        const environments = getAvailableEnvironments(config);

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
    async doDeployToPages(dataStr: string) {
        let data: { version: string; env: PagesEnvironment; commitMessage: string };
        try {
            data = JSON.parse(dataStr);
        } catch {
            return;
        }

        const config = loadPagesConfig(getProjectPath());
        const r2config = loadR2Config(getProjectPath());
        if (!config || !r2config) return;

        const client = createS3Client(r2config);

        const result = await deployFromR2({
            r2Client: client,
            r2Bucket: r2config.bucketName,
            version: data.version,
            env: data.env,
            commitMessage: data.commitMessage,
            config,
            accountId: r2config.accountId,
            onLog: (msg: string, type?: string) => {
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
        if (!config) return;

        const environments = getAvailableEnvironments(config);
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
    async switchPagesEnv(env: string) {
        const config = loadPagesConfig(getProjectPath());
        if (!config) return;
        _currentSwitchEnv = env as PagesEnvironment;
        await _loadSwitchVersionData(config, env as PagesEnvironment, 1);
    },

    /**
     * 加载更多版本
     */
    async loadMorePagesVersions(dataStr: string) {
        const { page } = JSON.parse(dataStr);
        const config = loadPagesConfig(getProjectPath());
        if (!config) return;
        const env = _currentSwitchEnv as PagesEnvironment;
        await _loadSwitchVersionData(config, env, page);
    },

    /**
     * 执行版本回滚
     */
    async doSwitchPagesVersion(dataStr: string) {
        try {
            const { deploymentId } = JSON.parse(dataStr);
            const config = loadPagesConfig(getProjectPath());
            const r2config = loadR2Config(getProjectPath());
            if (!config || !r2config) return;

            const env = _currentSwitchEnv as PagesEnvironment;
            const projectName = config.pagesProjects[env]?.projectName;
            const accountId = r2config.accountId;

            console.log(`[Pages] 正在切换版本: deploymentId=${deploymentId}, project=${projectName}, env=${env}`);

            Editor.Message.send('framework-plugin', 'set-versions-status', JSON.stringify({
                text: '正在切换版本...',
                color: '#569cd6',
            }));

            await rollbackDeployment(config.pagesApiToken, accountId, projectName, deploymentId);

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
        } catch (e: any) {
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
        if (!config) return;

        const environments = getAvailableEnvironments(config);
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
    async cleanupPagesEnv(env: string) {
        const config = loadPagesConfig(getProjectPath());
        if (!config) return;
        _currentCleanupEnv = env as PagesEnvironment;
        await _loadCleanupData(config, env as PagesEnvironment);
    },

    /**
     * 执行清理
     */
    async doCleanupPagesVersions(dataStr: string) {
        try {
            const { ids } = JSON.parse(dataStr) as { ids: string[] };
            const config = loadPagesConfig(getProjectPath());
            const r2config = loadR2Config(getProjectPath());
            if (!config || !r2config) return;

            const env = _currentCleanupEnv as PagesEnvironment;
            const projectName = config.pagesProjects[env]?.projectName;
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
                    await deleteDeployment(config.pagesApiToken, accountId, projectName, ids[i]);
                    success++;
                } catch (e: any) {
                    console.error(`[Pages] 删除部署 ${ids[i]} 失败:`, e.message);
                    failed++;
                }
            }

            Editor.Message.send('framework-plugin', 'set-cleanup-complete', JSON.stringify({ success, failed }));

            // 刷新列表
            await _loadCleanupData(config, env);
        } catch (e: any) {
            console.error('[Pages] 清理失败', e);
        }
    },

    // ==================== Bundle 版本管理 ====================

    async manageBundleVersions() {
        const config = loadR2Config(getProjectPath());
        if (!isR2Configured(config)) {
            Editor.Dialog.warn('请先配置 R2', { buttons: ['确定'] });
            return;
        }
        Editor.Panel.open('framework-plugin.bundle-versions');
    },

    async loadBundlePlatforms() {
        console.log('[Bundle版本管理] 正在加载平台列表...');
        const config = loadR2Config(getProjectPath());
        if (!isR2Configured(config) || !config) {
            console.error('[Bundle版本管理] R2 未配置');
            return;
        }

        try {
            const client = createS3Client(config);
            const platforms = await listR2Platforms(client, config.bucketName);
            console.log(`[Bundle版本管理] 平台列表加载成功: ${platforms.join(', ')}`);
            Editor.Message.send('framework-plugin', 'set-bundle-platforms', JSON.stringify(platforms));
        } catch (e: any) {
            console.error('[Bundle版本管理] 加载平台列表失败:', e.message);
            Editor.Message.send('framework-plugin', 'set-bundle-platforms', '[]');
        }
    },

    async loadBundleTreeByPlatform(platform: string) {
        console.log(`[Bundle版本管理] 正在加载平台 ${platform} 的 Bundle 树...`);
        const config = loadR2Config(getProjectPath());
        if (!isR2Configured(config) || !config) {
            console.error('[Bundle版本管理] R2 未配置');
            return;
        }

        try {
            const client = createS3Client(config);
            const treeData = await listR2AllBundleVersions(client, config.bucketName, platform);
            console.log(`[Bundle版本管理] 平台 ${platform} 的 Bundle 树加载成功，共 ${treeData.length} 个 Bundle`);
            Editor.Message.send('framework-plugin', 'set-bundle-tree', JSON.stringify(treeData));
        } catch (e: any) {
            console.error('[Bundle版本管理] 加载Bundle失败:', e.message);
            Editor.Message.send('framework-plugin', 'set-bundle-tree', '[]');
        }
    },

    async loadBundleVersionList(platform: string, bundleName: string) {
        console.log(`[Bundle版本管理] 正在加载平台 ${platform} Bundle ${bundleName} 的版本列表...`);
        const config = loadR2Config(getProjectPath());
        if (!isR2Configured(config) || !config) {
            console.error('[Bundle版本管理] R2 未配置');
            return;
        }

        try {
            const client = createS3Client(config);
            const versions = await listR2BundleVersions(client, config.bucketName, platform, bundleName);
            Editor.Message.send('framework-plugin', 'set-bundle-version-list', JSON.stringify(versions));
        } catch (e: any) {
            console.error('[Bundle版本管理] 加载版本列表失败:', e.message);
            Editor.Message.send('framework-plugin', 'set-bundle-version-list', '[]');
        }
    },

    async doSwitchBundleVersion(platform: string, bundleName: string, env: string, version: string) {
        const config = loadR2Config(getProjectPath());
        if (!isR2Configured(config) || !config) return;

        try {
            const client = createS3Client(config);
            await setR2BundleVersion(client, config.bucketName, platform, bundleName, env as any, version);
            console.log(`[Bundle版本管理] ✅ 切换成功: ${platform}/${bundleName} ${env}=${version}`);
            Editor.Message.send('framework-plugin', 'switch-bundle-version-result', true, '切换成功');
        } catch (e: any) {
            console.error('[Bundle版本管理] 切换失败:', e.message);
            Editor.Message.send('framework-plugin', 'switch-bundle-version-result', false, e.message);
        }
    },
};

export const load = function () {
    console.log('[框架管理] 插件已加载');
    if (isDevProject()) {
        console.log('[框架管理] 当前为开发项目，已启用推送功能');
    }
    // 显示 R2 自动询问状态
    const config = loadR2Config(getProjectPath());
    if (config?.autoPromptAfterBuild) {
        console.log('[框架管理] R2 构建后自动询问上传：已开启');
    }
};

export const unload = function () {
    console.log('[框架管理] 插件已卸载');
};
