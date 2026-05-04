import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
    loadR2Config, saveR2Config, isR2Configured, createS3Client,
    testConnection, scanBuildUploadAssets, uploadBundle, deleteVersionDir,
    checkVersionExists, checkBundleChanged,
    listR2Platforms, listR2Bundles, listR2BundleVersions,
    listR2AllBundleVersions, getR2BundleVersions, setR2BundleVersion, getR2LatestVersions,
    R2Config, BundleVersionEntry, UploadProgress,
} from './r2';
import {
    loadPagesConfig, savePagesConfig, isPagesConfigured, isEnvConfigured,
    getAvailableEnvironments, listR2AppVersions, deployFromR2,
    listDeployments, rollbackDeployment, deleteDeployment, testPagesConnection,
    PagesConfig, PagesEnvironment, PagesDeployment,
} from './pages';
import { loadAndroidConfig, saveAndroidConfig, AndroidConfig } from './android';
import {
    loadIOSConfig, saveIOSConfig, IOSConfig,
    copySigningFile, parseMobileProvision,
    isSigningConfigured, getEnabledIOSEnvironments,
    generateMultiEnvIpas,
} from './ios';

// ==================== I18n 工具函数 ====================

/** i18n 数据结构：namespace → key → lang → text */
type I18nData = Record<string, Record<string, Record<string, string>>>;

/** 数据源信息 */
interface I18nSource {
    /** 显示名称 */
    name: string;
    /** JSON 文件路径 */
    filePath: string;
    /** 数据 */
    data: I18nData;
}

/** 当前加载的 i18n 数据源列表 */
let i18nSources: I18nSource[] = [];

/** 主语言（回退语言） */
let i18nPrimaryLang = 'zh';

/** Inspector 选择模式下被选中的 key（供轮询获取） */
let i18nPickedKey = '';

/** 是否有待处理的 pick mode 请求（面板打开后会主动检查） */
let i18nWantPickMode = false;

/** pick mode 时 Inspector 当前已设置的 key（用于面板自动定位） */
let i18nPickCurrentKey = '';

/** i18n 数据版本号，每次写入递增；Inspector 通过对比版本号决定是否刷新本地快照 */
let i18nDataVersion = 0;

/**
 * 通知所有 Inspector：i18n 数据已变更
 * 1. 递增 version
 * 2. 同时通过 set-i18n-data 把数据推给 panel
 * 3. 通过 broadcast 通知所有 inspector 重新拉取 snapshot
 */
function notifyI18nDataChanged() {
    i18nDataVersion++;
    try {
        // @ts-ignore  Cocos Creator 3.x broadcast API
        Editor.Message.broadcast('framework-plugin:i18n-data-changed', i18nDataVersion);
    } catch (e) {
        // broadcast 不可用时不阻断，inspector 可通过 i18n-get-snapshot 主动拉取
    }
}

/** i18n 配置文件路径 */
function getI18nConfigPath(): string {
    return path.join(getProjectPath(), 'assets/framework/resources/i18n/i18n-config.json');
}

/** 加载主语言配置 */
function loadI18nConfig() {
    try {
        const configPath = getI18nConfigPath();
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.primaryLang) i18nPrimaryLang = config.primaryLang;
        }
    } catch (e) {
        console.warn('[i18n] 加载 i18n 配置失败:', e);
    }
}

/** 保存主语言配置 */
function saveI18nConfig() {
    try {
        const configPath = getI18nConfigPath();
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify({ primaryLang: i18nPrimaryLang }, null, 4), 'utf8');
    } catch (e) {
        console.error('[i18n] 保存 i18n 配置失败:', e);
    }
}

/** 不扫描 i18n 的目录（框架、内部资源等） */
const I18N_SCAN_EXCLUDE_DIRS = new Set(['framework', 'internal']);

/**
 * 扫描所有 i18n JSON 文件
 *
 * 扫描范围：
 * 1. assets/ 下一级目录（如 platform、lobby 等），排除 framework/internal/games
 * 2. assets/games/ 下各子游戏目录
 * 只要目录内含 i18n/i18n.json 即视为有效数据源
 */
function scanI18nSources(): I18nSource[] {
    const projectPath = getProjectPath();
    const assetsDir = path.join(projectPath, 'assets');
    const result: I18nSource[] = [];

    if (!fs.existsSync(assetsDir)) return result;

    const topDirs = fs.readdirSync(assetsDir, { withFileTypes: true });
    for (const dir of topDirs) {
        if (!dir.isDirectory()) continue;
        const dirName = dir.name;

        // 跳过排除目录
        if (I18N_SCAN_EXCLUDE_DIRS.has(dirName)) continue;

        if (dirName === 'games') {
            // games 下的子目录分别作为独立数据源
            const gamesDir = path.join(assetsDir, 'games');
            const gameDirs = fs.readdirSync(gamesDir, { withFileTypes: true });
            for (const gameDir of gameDirs) {
                if (!gameDir.isDirectory()) continue;
                _tryLoadI18nSource(result, path.join(gamesDir, gameDir.name), gameDir.name);
            }
        } else {
            // assets 下的一级目录（platform、lobby 等）
            _tryLoadI18nSource(result, path.join(assetsDir, dirName), dirName);
        }
    }

    return result;
}

/** 内部：根据 namespace.key 查主语言翻译（同步，纯内存查询） */
function getI18nTextSync(key: string): string {
    if (i18nSources.length === 0) {
        loadI18nConfig();
        i18nSources = scanI18nSources();
    }
    const dotIndex = key.indexOf('.');
    if (dotIndex === -1) return key;
    const namespace = key.substring(0, dotIndex);
    const leafKey = key.substring(dotIndex + 1);
    for (const source of i18nSources) {
        const entry = source.data[namespace]?.[leafKey];
        if (entry) {
            return entry[i18nPrimaryLang] || Object.values(entry).find(v => v) || key;
        }
    }
    return key;
}

/**
 * 扫描当前场景中所有 I18nLabel + cc.Label 节点，把翻译文本同步到 Label.string
 *
 * 触发时机：scene:ready 广播（场景打开/重新加载完成）
 * 仅修改编辑器内场景内存表现，不会保存到磁盘文件，避免污染 prefab/scene
 */
let syncing = false;
async function syncAllI18nLabelsInScene(): Promise<void> {
    if (syncing) return;
    syncing = true;
    try {
        if (i18nSources.length === 0) {
            loadI18nConfig();
            i18nSources = scanI18nSources();
        }

        // @ts-ignore
        const tree = await Editor.Message.request('scene', 'query-node-tree');
        if (!tree) return;

        const uuids: string[] = [];
        const collect = (node: any) => {
            if (node?.uuid) uuids.push(node.uuid);
            if (Array.isArray(node?.children)) {
                for (const c of node.children) collect(c);
            }
        };
        collect(tree);

        let synced = 0;
        for (const uuid of uuids) {
            try {
                // @ts-ignore
                const dump = await Editor.Message.request('scene', 'query-node', uuid);
                if (!dump?.__comps__) continue;

                let labelIdx = -1;
                let i18nKey = '';
                for (let i = 0; i < dump.__comps__.length; i++) {
                    const comp = dump.__comps__[i];
                    if (comp?.type === 'cc.Label') labelIdx = i;
                    else if (comp?.type === 'I18nLabel') i18nKey = comp.value?.key?.value || '';
                }

                if (labelIdx < 0 || !i18nKey) continue;

                const text = getI18nTextSync(i18nKey);
                if (!text || text === i18nKey) continue;

                // 已是翻译文本则跳过，避免重复 set-property
                const currentValue = dump.__comps__[labelIdx]?.value?.string?.value;
                if (currentValue === text) continue;

                // @ts-ignore
                await Editor.Message.request('scene', 'set-property', {
                    uuid,
                    path: `__comps__.${labelIdx}.string`,
                    dump: { type: 'cc.String', value: text },
                });
                synced++;
            } catch {
                // 单节点失败忽略
            }
        }

        if (synced > 0) {
            console.log(`[i18n] 场景已同步 ${synced} 个 I18nLabel 翻译到 Label.string`);
        }
    } catch (e) {
        console.warn('[i18n] syncAllI18nLabelsInScene 失败:', e);
    } finally {
        syncing = false;
    }
}

/** 尝试从目录加载 i18n/i18n.json 作为数据源 */
function _tryLoadI18nSource(result: I18nSource[], dirPath: string, name: string): void {
    const i18nPath = path.join(dirPath, 'i18n/i18n.json');
    if (!fs.existsSync(i18nPath)) return;
    try {
        const data = JSON.parse(fs.readFileSync(i18nPath, 'utf8'));
        result.push({ name, filePath: i18nPath, data });
    } catch (e) {
        console.warn(`[i18n] 解析 ${name}/i18n/i18n.json 失败:`, e);
    }
}

/**
 * 列出所有尚未有 i18n 的 Bundle 目录
 *
 * 扫描范围同 scanI18nSources，但返回没有 i18n/i18n.json 的目录
 * 返回 { name, targetPath } 数组，targetPath 是将要生成的 i18n.json 完整路径
 */
function listBundlesWithoutI18n(): { name: string; targetPath: string }[] {
    const projectPath = getProjectPath();
    const assetsDir = path.join(projectPath, 'assets');
    const result: { name: string; targetPath: string }[] = [];

    if (!fs.existsSync(assetsDir)) return result;

    const topDirs = fs.readdirSync(assetsDir, { withFileTypes: true });
    for (const dir of topDirs) {
        if (!dir.isDirectory()) continue;
        const dirName = dir.name;

        if (I18N_SCAN_EXCLUDE_DIRS.has(dirName)) continue;

        if (dirName === 'games') {
            const gamesDir = path.join(assetsDir, 'games');
            const gameDirs = fs.readdirSync(gamesDir, { withFileTypes: true });
            for (const gameDir of gameDirs) {
                if (!gameDir.isDirectory()) continue;
                const i18nPath = path.join(gamesDir, gameDir.name, 'i18n/i18n.json');
                if (!fs.existsSync(i18nPath)) {
                    result.push({ name: gameDir.name, targetPath: i18nPath });
                }
            }
        } else {
            const i18nPath = path.join(assetsDir, dirName, 'i18n/i18n.json');
            if (!fs.existsSync(i18nPath)) {
                result.push({ name: dirName, targetPath: i18nPath });
            }
        }
    }

    return result;
}

/** 从所有数据源提取支持的语言列表 */
function extractI18nLanguages(sources: I18nSource[]): string[] {
    const langSet = new Set<string>();
    for (const source of sources) {
        for (const ns of Object.values(source.data)) {
            for (const translations of Object.values(ns)) {
                for (const lang of Object.keys(translations)) {
                    langSet.add(lang);
                }
            }
        }
    }
    return Array.from(langSet).sort();
}

/**
 * 扫描项目中 i18n key 的引用次数
 *
 * 扫描策略：
 * 1. 先从所有 i18n 数据源收集全部已知 key（namespace.key 格式）
 * 2. 在 .ts 文件中匹配：
 *    - .t('ns.key') / .t("ns.key") 调用（直接字符串参数）
 *    - setKey('ns.key') 调用
 *    - 字符串字面量中出现的已知 key（如 key = 'demo.title'）
 * 3. 在 .scene / .prefab 文件中匹配：
 *    - "key": "ns.key" 格式（Cocos @property 序列化字段）
 *
 * 调用时机：面板打开/刷新时执行一次，结果缓存
 */
function scanI18nKeyReferences(): Record<string, number> {
    const projectPath = getProjectPath();
    const assetsDir = path.join(projectPath, 'assets');
    const refCounts: Record<string, number> = {};

    if (!fs.existsSync(assetsDir)) return refCounts;

    // 先收集所有已知 key，用于字符串字面量匹配
    const allKnownKeys = new Set<string>();
    for (const source of i18nSources) {
        for (const [ns, keys] of Object.entries(source.data)) {
            for (const key of Object.keys(keys)) {
                allKnownKeys.add(`${ns}.${key}`);
            }
        }
    }
    if (allKnownKeys.size === 0) return refCounts;

    // 初始化计数
    for (const k of allKnownKeys) refCounts[k] = 0;

    // 递归收集文件
    function collectFiles(dir: string, exts: string[]): string[] {
        const files: string[] = [];
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'i18n') continue;
                    files.push(...collectFiles(fullPath, exts));
                } else if (exts.some(ext => entry.name.endsWith(ext))) {
                    files.push(fullPath);
                }
            }
        } catch {}
        return files;
    }

    // 1. 扫描 .ts 文件
    const tsFiles = collectFiles(assetsDir, ['.ts']);
    // 匹配 .t('xxx') / .t("xxx") / .t(`xxx`)
    const tCallPattern = /\.t\(\s*['"`]([^'"`]+)['"`]/g;
    // 匹配 setKey('xxx') / setKey("xxx")
    const setKeyPattern = /setKey\(\s*['"`]([^'"`]+)['"`]/g;

    for (const file of tsFiles) {
        try {
            const content = fs.readFileSync(file, 'utf8');

            // 去除注释内容后再匹配（简化：去单行注释和块注释）
            const cleaned = content
                .replace(/\/\/.*$/gm, '')       // 单行注释
                .replace(/\/\*[\s\S]*?\*\//g, ''); // 块注释

            // .t() 调用
            let match: RegExpExecArray | null;
            while ((match = tCallPattern.exec(cleaned)) !== null) {
                const key = match[1];
                if (allKnownKeys.has(key)) {
                    refCounts[key] = (refCounts[key] || 0) + 1;
                }
            }
            tCallPattern.lastIndex = 0;

            // setKey() 调用
            while ((match = setKeyPattern.exec(cleaned)) !== null) {
                const key = match[1];
                if (allKnownKeys.has(key)) {
                    refCounts[key] = (refCounts[key] || 0) + 1;
                }
            }
            setKeyPattern.lastIndex = 0;

            // 字符串字面量中出现的已知 key（如 key: 'demo.title'）
            // 用更宽泛的匹配：引号内的 ns.key 格式
            const strLiteralPattern = /['"`](\w+\.\w+)['"`]/g;
            while ((match = strLiteralPattern.exec(cleaned)) !== null) {
                const key = match[1];
                if (allKnownKeys.has(key) && !refCounts[key]) {
                    // 只在前面 .t() / setKey() 没有匹配到时作为补充
                    refCounts[key] = (refCounts[key] || 0) + 1;
                }
            }
            strLiteralPattern.lastIndex = 0;
        } catch {}
    }

    // 2. 扫描 .scene / .prefab（Cocos 序列化格式）
    const sceneFiles = collectFiles(assetsDir, ['.scene', '.prefab']);
    // Cocos 序列化 @property 字段：带引号的 "key" 属性
    const sceneKeyPattern = /"key"\s*:\s*"([^"]+)"/g;
    for (const file of sceneFiles) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            let match: RegExpExecArray | null;
            while ((match = sceneKeyPattern.exec(content)) !== null) {
                const key = match[1];
                if (allKnownKeys.has(key)) {
                    refCounts[key] = (refCounts[key] || 0) + 1;
                }
            }
            sceneKeyPattern.lastIndex = 0;
        } catch {}
    }

    return refCounts;
}

/** 缓存的引用计数 */
let cachedRefCounts: Record<string, number> = {};

/** 上次扫描时间戳 */
let lastRefScanTime = 0;

/** 保存单个 i18n 源的数据到文件 */
function saveI18nSource(source: I18nSource): void {
    const dir = path.dirname(source.filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(source.filePath, JSON.stringify(source.data, null, 4), 'utf8');
}

/** 发送 i18n 数据到面板 */
function sendI18nDataToPanel() {
    const languages = extractI18nLanguages(i18nSources);
    // 刷新引用计数（带耗时统计）
    const scanStart = Date.now();
    cachedRefCounts = scanI18nKeyReferences();
    lastRefScanTime = Date.now();
    const scanMs = lastRefScanTime - scanStart;
    console.log(`[i18n] 引用扫描完成，耗时 ${scanMs}ms`);
    const payload = JSON.stringify({
        sources: i18nSources.map(s => ({
            name: s.name,
            filePath: s.filePath,
            namespaces: Object.keys(s.data),
        })),
        languages,
        primaryLang: i18nPrimaryLang,
        fullData: i18nSources.map(s => ({
            name: s.name,
            data: s.data,
        })),
        refCounts: cachedRefCounts,
    });
    Editor.Message.send('framework-plugin', 'set-i18n-data', payload);
    // 同步通知所有 Inspector 数据已变更，让其刷新本地快照
    notifyI18nDataChanged();
}

function sendI18nStatus(text: string, color: string = '#888') {
    Editor.Message.send('framework-plugin', 'set-i18n-status', JSON.stringify({ text, color }));
}

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

            const fwVer = frameworkExists() ? await getCurrentVersion(getFrameworkPath()) : '未安装';
            Editor.Dialog.info(`关于 - 框架管理插件\n\n框架版本：${fwVer}\n插件版本：${pluginVersion}`);
        } catch (e: any) {
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
     * 设置面板请求加载 Android 配置
     */
    async loadSettingsAndroid() {
        const projectRoot = getProjectPath();
        const existing = loadAndroidConfig(projectRoot);
        // 即使没有配置文件也发送默认值（三个环境全部启用）
        const config = existing || { environments: { dev: true, beta: true, prod: true } };
        setTimeout(() => {
            Editor.Message.send('framework-plugin', 'load-settings-android-config', JSON.stringify(config));
        }, 100);
    },

    /**
     * 保存 Android 配置（由设置面板触发）
     */
    async saveAndroidConfigFromPanel(configStr: string) {
        const projectRoot = getProjectPath();
        try {
            const config: AndroidConfig = JSON.parse(configStr);
            saveAndroidConfig(projectRoot, config);
            const msg = JSON.stringify({ text: '✅ 配置已保存', color: '#4ec9b0' });
            Editor.Message.send('framework-plugin', 'set-settings-android-status', msg);
            console.log('[Android] 配置已保存到 .androidconfig.json');
        } catch {
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
    async selectIOSMobileProvision(envKey: string) {
        const result = await Editor.Dialog.select({
            title: `选择 ${envKey} 环境的 Provisioning Profile`,
            filters: [{ name: 'Provisioning Profile', extensions: ['mobileprovision'] }],
        });
        if (result.canceled || !result.filePaths?.length) return;

        const sourcePath = result.filePaths[0];
        const projectRoot = getProjectPath();

        try {
            // 复制到 .ios-signing/
            const fileName = copySigningFile(sourcePath, projectRoot, 'mobileprovision');
            // 解析
            const signingDir = path.join(projectRoot, '.ios-signing');
            const info = await parseMobileProvision(path.join(signingDir, fileName));

            // 回传结果时包含 envKey，面板据此更新对应环境的配置
            Editor.Message.send('framework-plugin', 'set-ios-mobileprovision-result', JSON.stringify({
                envKey, fileName, ...info,
            }));
        } catch (err: any) {
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
        const result = await Editor.Dialog.select({
            title: '选择 P12 证书',
            filters: [{ name: 'P12 Certificate', extensions: ['p12', 'pfx'] }],
        });
        if (result.canceled || !result.filePaths?.length) return;

        const sourcePath = result.filePaths[0];
        const projectRoot = getProjectPath();

        try {
            const fileName = copySigningFile(sourcePath, projectRoot, 'p12');
            Editor.Message.send('framework-plugin', 'set-ios-p12-result', JSON.stringify({ fileName }));
        } catch (err: any) {
            console.error('[iOS] 选择 P12 失败:', err);
            Editor.Message.send('framework-plugin', 'set-ios-signing-status', JSON.stringify({
                text: `❌ 复制失败: ${err.message}`, color: '#f44747',
            }));
        }
    },

    /**
     * 保存 iOS 配置（由签名面板触发）
     */
    async saveIOSConfigFromPanel(configStr: string) {
        const projectRoot = getProjectPath();
        try {
            const signingData = JSON.parse(configStr);
            // 签名面板只传签名相关字段，需要与现有配置合并（保留 enabled 和 exportMethod）
            const existing = loadIOSConfig(projectRoot);
            const config: IOSConfig = existing || {
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
            for (const envKey of ['dev', 'beta', 'prod'] as const) {
                const envSigning = signingData.environments?.[envKey];
                if (envSigning) {
                    config.environments[envKey].mobileprovisionFile = envSigning.mobileprovisionFile || '';
                    config.environments[envKey].profileName = envSigning.profileName || '';
                    config.environments[envKey].profileUUID = envSigning.profileUUID || '';
                    config.environments[envKey].bundleId = envSigning.bundleId || '';
                }
            }

            saveIOSConfig(projectRoot, config);
            const msg = JSON.stringify({ text: '✅ 配置已保存', color: '#4ec9b0' });
            Editor.Message.send('framework-plugin', 'set-ios-signing-status', msg);
            console.log('[iOS] 签名配置已保存到 .iosconfig.json');
        } catch {
            const msg = JSON.stringify({ text: '❌ 保存失败', color: '#f44747' });
            Editor.Message.send('framework-plugin', 'set-ios-signing-status', msg);
        }
    },

    /**
     * 加载 iOS 签名配置（由签名面板触发）
     */
    async loadIOSSigningConfig() {
        const projectRoot = getProjectPath();
        const config = loadIOSConfig(projectRoot);
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
        const projectRoot = getProjectPath();
        const config = loadIOSConfig(projectRoot);
        const hasSharedConfig = config ? !!(config.shared.p12File && config.shared.p12Password && config.shared.teamId) : false;
        const signingReady = config ? isSigningConfigured(config) : false;

        const data = {
            signingReady,
            hasSharedConfig,
            // 每个环境的完整配置
            environments: config ? {
                dev: { enabled: config.environments.dev?.enabled !== false, exportMethod: config.environments.dev?.exportMethod || 'simulator' },
                beta: { enabled: config.environments.beta?.enabled !== false, exportMethod: config.environments.beta?.exportMethod || 'ad-hoc' },
                prod: { enabled: config.environments.prod?.enabled !== false, exportMethod: config.environments.prod?.exportMethod || 'app-store' },
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
    async startIOSBuild(optionsStr: string) {
        const projectRoot = getProjectPath();

        try {
            const options = JSON.parse(optionsStr);
            const environments = options.environments || ['dev', 'beta', 'prod'];
            const exportMethods: Record<string, string> = options.exportMethods || {};

            // 将构建面板选择的导出方式写入配置（持久化）
            const config = loadIOSConfig(projectRoot);
            if (config) {
                for (const envKey of environments) {
                    if (exportMethods[envKey] && config.environments[envKey as keyof typeof config.environments]) {
                        (config.environments as any)[envKey].exportMethod = exportMethods[envKey];
                        (config.environments as any)[envKey].enabled = true;
                    }
                }
                // 未勾选的环境标记为未启用
                for (const envKey of ['dev', 'beta', 'prod']) {
                    if (!environments.includes(envKey)) {
                        (config.environments as any)[envKey].enabled = false;
                    }
                }
                saveIOSConfig(projectRoot, config);
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

            const logFn = (message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
                console.log(`[iOS] ${message}`);
                try {
                    Editor.Message.send('framework-plugin', 'append-ios-build-log', JSON.stringify({
                        message, type, time: new Date().toLocaleTimeString(),
                    }));
                } catch {}
            };

            const results = await generateMultiEnvIpas({
                projectRoot,
                version,
                environments,
                onLog: logFn,
            });

            const successCount = results.filter(r => r.success).length;
            logFn(
                `多环境 IPA 构建完成: ${successCount}/${environments.length} 成功`,
                successCount === environments.length ? 'success' : 'warn'
            );

            // 通知面板构建完成
            Editor.Message.send('framework-plugin', 'set-ios-build-complete', JSON.stringify({ results }));

        } catch (err: any) {
            console.error('[iOS] 构建出错:', err);
            try {
                Editor.Message.send('framework-plugin', 'append-ios-build-log', JSON.stringify({
                    message: `构建出错: ${err.message}`, type: 'error', time: new Date().toLocaleTimeString(),
                }));
                Editor.Message.send('framework-plugin', 'set-ios-build-complete', JSON.stringify({ error: err.message }));
            } catch {}
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

    /**
     * 一键将当前平台所有 Bundle 的最新版本应用到指定环境
     */
    async applyLatestToEnv(platform: string, env: string) {
        console.log(`[Bundle版本管理] 一键应用最新版本: ${platform} → ${env}`);
        const config = loadR2Config(getProjectPath());
        if (!isR2Configured(config) || !config) {
            Editor.Message.send('framework-plugin', 'apply-latest-result', JSON.stringify({
                success: false, message: 'R2 未配置',
            }));
            return;
        }

        try {
            const client = createS3Client(config);
            const latestMap = await getR2LatestVersions(client, config.bucketName, platform);

            if (latestMap.size === 0) {
                Editor.Message.send('framework-plugin', 'apply-latest-result', JSON.stringify({
                    success: false, message: '该平台下没有找到任何 Bundle',
                }));
                return;
            }

            const errors: string[] = [];
            let successCount = 0;

            for (const [bundleName, latestVersion] of latestMap.entries()) {
                try {
                    await setR2BundleVersion(client, config.bucketName, platform, bundleName, env as any, latestVersion);
                    console.log(`[Bundle版本管理] ✅ ${bundleName} ${env}=${latestVersion}`);
                    successCount++;
                } catch (e: any) {
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
        } catch (e: any) {
            console.error('[Bundle版本管理] 一键应用失败:', e.message);
            Editor.Message.send('framework-plugin', 'apply-latest-result', JSON.stringify({
                success: false, message: e.message,
            }));
        }
    },

    // ==================== I18n 管理 ====================

    /** 打开国际化编辑器面板 */
    openI18nEditor() {
        Editor.Panel.open('framework-plugin.i18n');
        // 延迟发送数据，等面板 ready
        setTimeout(() => {
            loadI18nConfig();
            i18nSources = scanI18nSources();
            sendI18nDataToPanel();
        }, 300);
    },

    /** 重新加载 i18n 数据 */
    loadI18nData() {
        loadI18nConfig();
        i18nSources = scanI18nSources();
        sendI18nDataToPanel();
        sendI18nStatus(`已加载 ${i18nSources.length} 个数据源`, '#4ec9b0');
    },

    /** 创建命名空间 */
    createI18nNamespace(dataStr: string) {
        try {
            const { sourceIndex, namespace } = JSON.parse(dataStr);
            const source = i18nSources[sourceIndex];
            if (!source) return;

            if (source.data[namespace]) {
                sendI18nStatus(`命名空间 "${namespace}" 已存在`, '#ce9178');
                return;
            }

            source.data[namespace] = {};
            saveI18nSource(source);
            sendI18nDataToPanel();
            sendI18nStatus(`已创建命名空间 "${namespace}"`, '#4ec9b0');
            Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
        } catch (e) {
            console.error('[i18n] createNamespace 失败:', e);
        }
    },

    /** 删除命名空间 */
    deleteI18nNamespace(dataStr: string) {
        try {
            const { sourceIndex, namespace } = JSON.parse(dataStr);
            const source = i18nSources[sourceIndex];
            if (!source) return;

            delete source.data[namespace];
            saveI18nSource(source);
            sendI18nDataToPanel();
            sendI18nStatus(`已删除命名空间 "${namespace}"`, '#4ec9b0');
            Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
        } catch (e) {
            console.error('[i18n] deleteNamespace 失败:', e);
        }
    },

    /** 重命名命名空间 */
    renameI18nNamespace(dataStr: string) {
        try {
            const { sourceIndex, oldName, newName } = JSON.parse(dataStr);
            const source = i18nSources[sourceIndex];
            if (!source) return;

            if (source.data[newName]) {
                sendI18nStatus(`命名空间 "${newName}" 已存在`, '#ce9178');
                return;
            }

            source.data[newName] = source.data[oldName];
            delete source.data[oldName];
            saveI18nSource(source);
            sendI18nDataToPanel();
            sendI18nStatus(`已重命名 "${oldName}" → "${newName}"`, '#4ec9b0');
            Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
        } catch (e) {
            console.error('[i18n] renameNamespace 失败:', e);
        }
    },

    /** 创建 Key */
    createI18nKey(dataStr: string) {
        try {
            const { sourceIndex, namespace, key } = JSON.parse(dataStr);
            const source = i18nSources[sourceIndex];
            if (!source || !source.data[namespace]) return;

            if (source.data[namespace][key]) {
                sendI18nStatus(`Key "${key}" 已存在`, '#ce9178');
                return;
            }

            source.data[namespace][key] = {};
            saveI18nSource(source);
            sendI18nDataToPanel();
            sendI18nStatus(`已创建 Key "${namespace}.${key}"`, '#4ec9b0');
            Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
        } catch (e) {
            console.error('[i18n] createKey 失败:', e);
        }
    },

    /** 删除 Key */
    deleteI18nKey(dataStr: string) {
        try {
            const { sourceIndex, namespace, key } = JSON.parse(dataStr);
            const source = i18nSources[sourceIndex];
            if (!source || !source.data[namespace]) return;

            delete source.data[namespace][key];
            saveI18nSource(source);
            sendI18nDataToPanel();
            sendI18nStatus(`已删除 Key "${namespace}.${key}"`, '#4ec9b0');
            Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
        } catch (e) {
            console.error('[i18n] deleteKey 失败:', e);
        }
    },

    /** 保存 Key 的翻译内容 */
    saveI18nKeyTranslations(dataStr: string) {
        try {
            const { sourceIndex, namespace, key, translations } = JSON.parse(dataStr);
            const source = i18nSources[sourceIndex];
            if (!source || !source.data[namespace]) return;

            source.data[namespace][key] = translations;
            saveI18nSource(source);
            sendI18nDataToPanel();
            sendI18nStatus(`已保存 "${namespace}.${key}" 的翻译`, '#4ec9b0');
            Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
        } catch (e) {
            console.error('[i18n] saveKeyTranslations 失败:', e);
        }
    },

    /** 添加语言 */
    addI18nLanguage(dataStr: string) {
        try {
            const { langCode } = JSON.parse(dataStr);
            // 给所有数据源的所有 key 添加该语言的空条目（确保语言被识别）
            for (const source of i18nSources) {
                for (const ns of Object.values(source.data)) {
                    for (const translations of Object.values(ns)) {
                        if (!(langCode in translations)) {
                            translations[langCode] = '';
                        }
                    }
                }
                saveI18nSource(source);
            }
            sendI18nDataToPanel();
            sendI18nStatus(`已添加语言 "${langCode}"`, '#4ec9b0');
            Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
        } catch (e) {
            console.error('[i18n] addLanguage 失败:', e);
        }
    },

    /** 移除语言 */
    removeI18nLanguage(dataStr: string) {
        try {
            const { langCode } = JSON.parse(dataStr);
            for (const source of i18nSources) {
                for (const ns of Object.values(source.data)) {
                    for (const translations of Object.values(ns)) {
                        delete translations[langCode];
                    }
                }
                saveI18nSource(source);
            }
            sendI18nDataToPanel();
            sendI18nStatus(`已移除语言 "${langCode}" 的所有翻译`, '#4ec9b0');
            Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
        } catch (e) {
            console.error('[i18n] removeLanguage 失败:', e);
        }
    },

    /** 翻译单个 key（返回主语言文本，供 Inspector 预览） */
    async i18nTranslate(key: string): Promise<string> {
        if (i18nSources.length === 0) {
            loadI18nConfig();
            i18nSources = scanI18nSources();
        }
        const dotIndex = key.indexOf('.');
        if (dotIndex === -1) return key;
        const namespace = key.substring(0, dotIndex);
        const leafKey = key.substring(dotIndex + 1);
        for (const source of i18nSources) {
            const entry = source.data[namespace]?.[leafKey];
            if (entry) {
                return entry[i18nPrimaryLang] || Object.values(entry).find(v => v) || key;
            }
        }
        return key;
    },

    /** 获取指定 key 的所有语言翻译（供 Inspector 预览） */
    async i18nTranslateAll(key: string): Promise<Record<string, string>> {
        if (i18nSources.length === 0) {
            loadI18nConfig();
            i18nSources = scanI18nSources();
        }
        const dotIndex = key.indexOf('.');
        if (dotIndex === -1) return {};
        const namespace = key.substring(0, dotIndex);
        const leafKey = key.substring(dotIndex + 1);
        for (const source of i18nSources) {
            const entry = source.data[namespace]?.[leafKey];
            if (entry) return entry;
        }
        return {};
    },

    /** 获取所有 key 及其主语言翻译（供 Inspector 搜索下拉） */
    async i18nGetAllKeys(): Promise<Record<string, string>> {
        if (i18nSources.length === 0) {
            loadI18nConfig();
            i18nSources = scanI18nSources();
        }
        const result: Record<string, string> = {};
        for (const source of i18nSources) {
            for (const [ns, keys] of Object.entries(source.data)) {
                for (const [key, translations] of Object.entries(keys)) {
                    const fullKey = `${ns}.${key}`;
                    if (!result[fullKey]) {
                        result[fullKey] = translations[i18nPrimaryLang] || Object.values(translations).find(v => v) || '';
                    }
                }
            }
        }
        return result;
    },

    /** 获取当前语言列表（供 Inspector 使用） */
    async i18nGetLanguages(): Promise<string[]> {
        if (i18nSources.length === 0) {
            loadI18nConfig();
            i18nSources = scanI18nSources();
        }
        return extractI18nLanguages(i18nSources);
    },

    /**
     * 获取 i18n 完整快照（供 Inspector 一次性拉取，避免每次渲染都异步查询）
     * 返回结构：{ allTranslations: {fullKey: {lang: text}}, languages, primaryLang, version }
     * version 用于 Inspector 检测数据变化（每次写入后递增）
     */
    async i18nGetSnapshot(): Promise<{
        allTranslations: Record<string, Record<string, string>>;
        languages: string[];
        primaryLang: string;
        version: number;
    }> {
        if (i18nSources.length === 0) {
            loadI18nConfig();
            i18nSources = scanI18nSources();
        }
        const allTranslations: Record<string, Record<string, string>> = {};
        for (const source of i18nSources) {
            for (const [ns, keys] of Object.entries(source.data)) {
                for (const [key, translations] of Object.entries(keys)) {
                    const fullKey = `${ns}.${key}`;
                    if (!allTranslations[fullKey]) {
                        allTranslations[fullKey] = { ...translations };
                    }
                }
            }
        }
        return {
            allTranslations,
            languages: extractI18nLanguages(i18nSources),
            primaryLang: i18nPrimaryLang,
            version: i18nDataVersion,
        };
    },

    /** 通知 i18n 面板进入选择模式（从 Inspector 触发） */
    i18nEnterPickMode(currentKey?: string) {
        console.log(`[I18n-Main] i18nEnterPickMode("${currentKey || ''}") called`);
        i18nWantPickMode = true;
        i18nPickCurrentKey = currentKey || '';
        Editor.Message.send('framework-plugin', 'set-i18n-pick-mode', currentKey || '');
    },

    /** 面板打开后检查是否需要进入选择模式（面板 ready 时调用） */
    async i18nCheckPickMode(): Promise<false | { currentKey: string }> {
        const want = i18nWantPickMode;
        const key = i18nPickCurrentKey;
        if (want) {
            i18nWantPickMode = false;
            i18nPickCurrentKey = '';
        }
        console.log(`[I18n-Main] i18nCheckPickMode() → ${want ? `pick, currentKey="${key}"` : 'false'}`);
        return want ? { currentKey: key } : false;
    },

    /** 接收 i18n 面板回传的选中 key */
    i18nKeyPicked(key: string) {
        console.log(`[I18n-Main] i18nKeyPicked("${key}")`);
        i18nPickedKey = key;
    },

    /** Inspector 轮询获取选中的 key（获取后清空） */
    async i18nGetPickedKey(): Promise<string> {
        const key = i18nPickedKey;
        i18nPickedKey = '';
        if (key) {
            console.log(`[I18n-Main] i18nGetPickedKey() → "${key}" (已清空)`);
        }
        return key;
    },

    /** 设置主语言 */
    setI18nPrimaryLang(dataStr: string) {
        try {
            const { langCode } = JSON.parse(dataStr);
            i18nPrimaryLang = langCode;
            saveI18nConfig();
            sendI18nDataToPanel();
            sendI18nStatus(`已将主语言设置为 "${langCode}"`, '#4ec9b0');
        } catch (e) {
            console.error('[i18n] setPrimaryLang 失败:', e);
        }
    },

    /**
     * 添加数据源（为游戏 Bundle 创建 i18n.json）
     * 参数 dataStr: { gameName: string }
     * 会在 assets/games/{gameName}/i18n/ 下创建空的 i18n.json
     */
    addI18nSource(dataStr: string) {
        try {
            const { bundleName, targetPath: targetPathFromPanel } = JSON.parse(dataStr);
            const name = bundleName;

            // 支持面板传入完整 targetPath（由 listBundlesWithoutI18n 提供）
            const projectPath = getProjectPath();
            const targetPath = targetPathFromPanel || path.join(projectPath, 'assets', name, 'i18n/i18n.json');

            if (fs.existsSync(targetPath)) {
                sendI18nStatus(`"${name}" 已有 i18n 数据源`, '#ce9178');
                return;
            }

            // 确保目录存在
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // 创建空的 i18n JSON
            const initData: I18nData = {};
            fs.writeFileSync(targetPath, JSON.stringify(initData, null, 4), 'utf8');

            // 刷新资产数据库并重新加载
            Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');

            // 重新扫描
            i18nSources = scanI18nSources();
            sendI18nDataToPanel();

            const relativePath = path.relative(projectPath, targetPath).replace(/\\/g, '/');
            sendI18nStatus(`已创建数据源: ${relativePath}`, '#4ec9b0');
        } catch (e) {
            console.error('[i18n] addSource 失败:', e);
        }
    },

    /**
     * 移除数据源（删除 i18n.json 文件）
     * 参数 dataStr: { sourceIndex: number }
     * 注意：不能移除平台数据源
     */
    removeI18nSource(dataStr: string) {
        try {
            const { sourceIndex } = JSON.parse(dataStr);
            const source = i18nSources[sourceIndex];
            if (!source) return;

            // 删除 i18n.json 文件
            if (fs.existsSync(source.filePath)) {
                fs.unlinkSync(source.filePath);

                // 如果 i18n 目录为空，也删除该目录
                const dir = path.dirname(source.filePath);
                try {
                    const remaining = fs.readdirSync(dir);
                    // 只剩 .meta 文件或为空时删除目录
                    if (remaining.length === 0 || remaining.every(f => f.endsWith('.meta'))) {
                        for (const f of remaining) {
                            fs.unlinkSync(path.join(dir, f));
                        }
                        fs.rmdirSync(dir);
                    }
                } catch {}
            }

            const removedName = source.name;
            Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');

            // 重新扫描
            i18nSources = scanI18nSources();
            sendI18nDataToPanel();
            sendI18nStatus(`已移除数据源 "${removedName}"`, '#4ec9b0');
        } catch (e) {
            console.error('[i18n] removeSource 失败:', e);
        }
    },

    /**
     * 列出所有可添加 i18n 的 Bundle 目录
     * 返回尚未有 i18n/i18n.json 的 Bundle 列表（含将要生成的文件路径）
     */
    listAvailableGamesForI18n() {
        try {
            const bundles = listBundlesWithoutI18n();
            const projectPath = getProjectPath();
            const list = bundles.map(b => ({
                name: b.name,
                targetPath: b.targetPath,
                relativePath: path.relative(projectPath, b.targetPath).replace(/\\/g, '/'),
            }));
            Editor.Message.send('framework-plugin', 'set-i18n-available-games', JSON.stringify(list));
        } catch (e) {
            console.error('[i18n] listAvailableBundles 失败:', e);
        }
    },
};

/** 场景就绪回调：批量同步 I18nLabel 翻译到编辑器内场景的 Label.string */
const onSceneReady = () => {
    // 延迟，等场景资源完全就绪后再扫描节点
    setTimeout(() => { syncAllI18nLabelsInScene(); }, 600);
};

export const load = function () {
    console.log('[框架管理] 插件已加载');
    // 显示 R2 自动询问状态
    const config = loadR2Config(getProjectPath());
    if (config?.autoPromptAfterBuild) {
        console.log('[框架管理] R2 构建后自动询问上传：已开启');
    }
    // 注册场景就绪监听，自动同步 I18nLabel 翻译预览
    try {
        // @ts-ignore
        Editor.Message.addBroadcastListener('scene:ready', onSceneReady);
    } catch (e) {
        console.warn('[框架管理] 注册 scene:ready 广播监听失败:', e);
    }
};

export const unload = function () {
    console.log('[框架管理] 插件已卸载');
    try {
        // @ts-ignore
        Editor.Message.removeBroadcastListener('scene:ready', onSceneReady);
    } catch {}
};
