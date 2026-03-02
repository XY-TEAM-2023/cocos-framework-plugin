import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

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

// ==================== 插件入口 ====================

export const methods: { [key: string]: (...args: any) => any } = {

    openLogPanel() {
        Editor.Panel.open('framework-plugin.log');
    },

    /**
     * 更新框架（同时更新框架和插件，不自动提交）
     */
    async updateFramework() {
        await openLog();
        await log('========== 开始更新 ==========');

        const fwPath = getFrameworkPath();
        const pluginPath = getPluginPath();

        // --- 更新框架 ---
        await log('[框架] 开始更新...');
        if (frameworkExists()) {
            try {
                const currentVersion = await getCurrentVersion(fwPath);
                await log(`[框架] 当前版本：${currentVersion}`);
                await log('[框架] 正在拉取远程数据...');

                const latestTag = await getLatestTag(fwPath);
                if (latestTag) {
                    const currentTag = currentVersion.startsWith('v') ? currentVersion : null;
                    if (currentTag === latestTag) {
                        await log(`[框架] 已是最新版本 ${latestTag}`, 'success');
                    } else {
                        await runCommand(`git checkout ${latestTag}`, fwPath);
                        await log(`[框架] 已更新：${currentVersion} → ${latestTag}`, 'success');
                    }
                } else {
                    await runCommand('git pull origin main', fwPath).catch(() => {});
                    await log('[框架] 已拉取最新代码（无稳定版本 Tag）', 'warn');
                }

                // 刷新资源数据库
                await log('[框架] 正在刷新资源数据库...');
                Editor.Message.send('asset-db', 'refresh-asset', 'db://assets/framework');
                await log('[框架] 资源刷新完成', 'success');
            } catch (e: any) {
                await log(`[框架] 更新失败：${e.message}`, 'error');
            }
        } else {
            await log('[框架] 子模块不存在，跳过', 'warn');
        }

        // --- 更新插件 ---
        await log('[插件] 开始更新...');
        try {
            const pluginVersion = await getCurrentVersion(pluginPath);
            await log(`[插件] 当前版本：${pluginVersion}`);
            await log('[插件] 正在拉取远程数据...');

            const pluginLatest = await getLatestTag(pluginPath);
            if (pluginLatest) {
                const currentTag = pluginVersion.startsWith('v') ? pluginVersion : null;
                if (currentTag === pluginLatest) {
                    await log(`[插件] 已是最新版本 ${pluginLatest}`, 'success');
                } else {
                    await runCommand(`git checkout ${pluginLatest}`, pluginPath);
                    await log(`[插件] 已更新：${pluginVersion} → ${pluginLatest}`, 'success');
                    await log('[插件] 请重启编辑器使插件更新生效', 'warn');
                }
            } else {
                await runCommand('git pull origin main', pluginPath).catch(() => {});
                await log('[插件] 已拉取最新代码', 'success');
            }
        } catch (e: any) {
            await log(`[插件] 更新失败：${e.message}`, 'error');
        }

        await log('========== 更新完成 ✅ ==========', 'success');
    },

    /**
     * 切换框架版本
     */
    async switchVersion() {
        await openLog();
        await log('========== 切换框架版本 ==========');

        if (!frameworkExists()) {
            await log('[框架] 子模块不存在', 'error');
            Editor.Dialog.error('框架子模块不存在\n请先通过安装脚本引入框架。');
            return;
        }

        const fwPath = getFrameworkPath();

        try {
            const tags = await getAllTags(fwPath);
            if (tags.length === 0) {
                await log('[框架] 未找到可用的版本 Tag', 'warn');
                Editor.Dialog.info('未找到可用的版本 Tag');
                return;
            }

            const currentVersion = await getCurrentVersion(fwPath);
            await log(`[框架] 当前版本：${currentVersion}`);
            await log(`[框架] 可用版本：${tags.join(', ')}`);

            const displayTags = tags.slice(0, 5);
            const buttons = [...displayTags, '取消'];

            const result = await Editor.Dialog.info(
                `切换框架版本\n\n当前版本：${currentVersion}\n\n请选择要切换的版本：`,
                { buttons, default: 0, cancel: buttons.length - 1 }
            );

            const selectedIndex = result.response;
            if (selectedIndex < displayTags.length) {
                const targetVersion = displayTags[selectedIndex];
                await log(`[框架] 正在切换到 ${targetVersion}...`);
                await runCommand(`git checkout ${targetVersion}`, fwPath);
                await log(`[框架] 已切换到 ${targetVersion}`, 'success');

                await log('[框架] 正在刷新资源数据库...');
                Editor.Message.send('asset-db', 'refresh-asset', 'db://assets/framework');
                await log('========== 切换完成 ✅ ==========', 'success');
            } else {
                await log('已取消', 'warn');
            }
        } catch (e: any) {
            await log(`[框架] 切换版本失败：${e.message}`, 'error');
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

            const result = await Editor.Dialog.info(
                `推送框架版本\n\n当前版本：${currentVersion}\n变更文件：${changes.length} 个\n\n确认所有变更已测试通过？`,
                { buttons: ['确认推送', '取消'], default: 0, cancel: 1 }
            );

            if (result.response !== 0) {
                await log('[框架] 已取消推送', 'warn');
                return;
            }

            await log('[框架] 正在提交变更...');
            await runCommand('git add .', fwPath);
            await runCommand('git commit -m "feat: 更新框架"', fwPath);
            await log('[框架] 变更已提交', 'success');

            await log('[框架] 正在推送到远程...');
            await runCommand('git push origin main', fwPath);
            await log('[框架] 推送完成', 'success');

            await log('========== 框架推送完成 ✅ ==========', 'success');
            Editor.Dialog.info('框架推送完成！\n其他项目可以通过「更新框架」获取最新版本。');

        } catch (e: any) {
            await log(`[框架] 推送失败：${e.message}`, 'error');
            Editor.Dialog.error(`推送失败\n${e.message}`);
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

            const result = await Editor.Dialog.info(
                `推送插件版本\n\n当前版本：${currentVersion}\n变更文件：${changes.length} 个\n\n确认推送？`,
                { buttons: ['确认推送', '取消'], default: 0, cancel: 1 }
            );

            if (result.response !== 0) {
                await log('[插件] 已取消推送', 'warn');
                return;
            }

            await log('[插件] 正在编译...');
            await runCommand('npm run build', pluginPath);
            await log('[插件] 编译完成', 'success');

            await log('[插件] 正在提交变更...');
            await runCommand('git add .', pluginPath);
            await runCommand('git commit -m "feat: 更新插件"', pluginPath);
            await log('[插件] 变更已提交', 'success');

            await log('[插件] 正在推送到远程...');
            await runCommand('git push origin main', pluginPath);
            await log('[插件] 推送完成', 'success');

            await log('========== 插件推送完成 ✅ ==========', 'success');
            Editor.Dialog.info('插件推送完成！\n其他项目可以通过「更新框架」获取最新版本。');

        } catch (e: any) {
            await log(`[插件] 推送失败：${e.message}`, 'error');
            Editor.Dialog.error(`推送失败\n${e.message}`);
        }
    },

    /**
     * 关于
     */
    async showAbout() {
        await openLog();
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
};

export const load = function () {
    console.log('[框架管理] 插件已加载');
    if (isDevProject()) {
        console.log('[框架管理] 当前为开发项目，已启用推送功能');
    }
};

export const unload = function () {
    console.log('[框架管理] 插件已卸载');
};
