/**
 * Android 多环境 APK 构建模块
 *
 * 功能：
 * 1. 管理 Android 打包配置（.androidconfig.json）
 * 2. 一次 Cocos 构建后，循环生成多个环境的 APK
 *    - 写入 env.json → gradle assembleRelease → 重命名 APK
 *
 * 产出结构：
 *   build_upload_assets/android/app/{version}/
 *   ├── app-dev.apk
 *   ├── app-beta.apk
 *   ├── app-prod.apk
 *   └── manifest.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// ==================== 类型定义 ====================

/** 可用环境类型 */
export type AndroidEnv = 'dev' | 'beta' | 'prod';

/** Android 打包配置 */
export interface AndroidConfig {
    /** 各环境是否启用 */
    environments: {
        dev: boolean;
        beta: boolean;
        prod: boolean;
    };
}

/** 多环境构建选项 */
export interface MultiEnvBuildOptions {
    /** Cocos 构建产物根目录，如 build/android */
    buildDest: string;
    /** 项目根目录 */
    projectRoot: string;
    /** 版本号（时间戳格式 yyMMddHHmmss） */
    version: string;
    /** 需要构建的环境列表 */
    environments: AndroidEnv[];
    /** 日志回调 */
    onLog: (message: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

/** 单次构建结果 */
export interface EnvBuildResult {
    env: AndroidEnv;
    success: boolean;
    apkPath?: string;
    error?: string;
}

// ==================== 配置管理 ====================

const CONFIG_FILE = '.androidconfig.json';

function getConfigPath(projectRoot: string): string {
    return path.join(projectRoot, CONFIG_FILE);
}

/** 默认配置：三个环境全部启用 */
function getDefaultConfig(): AndroidConfig {
    return {
        environments: { dev: true, beta: true, prod: true },
    };
}

/** 加载 Android 打包配置 */
export function loadAndroidConfig(projectRoot: string): AndroidConfig | null {
    const configPath = getConfigPath(projectRoot);
    if (!fs.existsSync(configPath)) return null;
    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw) as AndroidConfig;
    } catch {
        return null;
    }
}

/** 保存 Android 打包配置 */
export function saveAndroidConfig(projectRoot: string, config: AndroidConfig): void {
    const configPath = getConfigPath(projectRoot);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/** 获取有效配置（不存在配置文件时返回默认值：全部启用） */
export function getEffectiveConfig(projectRoot: string): AndroidConfig {
    return loadAndroidConfig(projectRoot) || getDefaultConfig();
}

/** 获取启用的环境列表 */
export function getEnabledEnvironments(config: AndroidConfig): AndroidEnv[] {
    const envs: AndroidEnv[] = [];
    if (config.environments.dev) envs.push('dev');
    if (config.environments.beta) envs.push('beta');
    if (config.environments.prod) envs.push('prod');
    return envs;
}

// ==================== env.json 写入 ====================

/**
 * 写入 env.json 到 data/ 目录
 * 位置: build/android/data/env.json
 * 内容: { "env": "dev" | "beta" | "prod" }
 */
function writeEnvJson(buildDest: string, env: AndroidEnv): void {
    const envJsonPath = path.join(buildDest, 'data', 'env.json');
    const content = JSON.stringify({ env }, null, 2);
    fs.writeFileSync(envJsonPath, content, 'utf-8');
}

// ==================== Gradle 执行 ====================

/**
 * 执行 gradle assembleRelease
 * 使用 spawn 实现实时日志输出
 * 超时 10 分钟
 */
function runGradleAssemble(
    projDir: string,
    onLog: (message: string, type?: 'info' | 'success' | 'warn' | 'error') => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const gradlew = path.join(projDir, 'gradlew');
        const timeout = 10 * 60 * 1000; // 10 分钟

        // 确保 gradlew 有执行权限
        try {
            fs.chmodSync(gradlew, '755');
        } catch {
            // 忽略，可能已经有权限
        }

        const child = spawn(gradlew, ['assembleRelease', '--no-daemon'], {
            cwd: projDir,
            env: { ...process.env },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            reject(new Error('Gradle 执行超时（10分钟）'));
        }, timeout);

        // 实时输出 stdout
        child.stdout.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                onLog(`[gradle] ${line}`, 'info');
            }
        });

        // 实时输出 stderr（gradle 的部分正常输出也在 stderr）
        child.stderr.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                onLog(`[gradle] ${line}`, 'warn');
            }
        });

        child.on('close', (code) => {
            clearTimeout(timer);
            if (timedOut) return;
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Gradle 退出码: ${code}`));
            }
        });

        child.on('error', (err) => {
            clearTimeout(timer);
            reject(new Error(`Gradle 启动失败: ${err.message}`));
        });
    });
}

// ==================== APK 查找 ====================

/**
 * 从 gradle 构建产出中查找 APK 文件
 *
 * 查找顺序：
 * 1. proj/build/{ProjectName}/outputs/apk/release/*.apk（gradle 直接输出）
 * 2. publish/release/*.apk（Cocos 复制后的位置）
 */
function findBuiltApk(buildDest: string): string | null {
    // 候选路径 1: gradle 直接输出
    const projBuildDir = path.join(buildDest, 'proj', 'build');
    if (fs.existsSync(projBuildDir)) {
        const entries = fs.readdirSync(projBuildDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const releaseDir = path.join(projBuildDir, entry.name, 'outputs', 'apk', 'release');
            if (fs.existsSync(releaseDir)) {
                const apks = fs.readdirSync(releaseDir).filter(f => f.endsWith('.apk'));
                if (apks.length > 0) {
                    return path.join(releaseDir, apks[0]);
                }
            }
        }
    }

    // 候选路径 2: publish/release/
    const publishDir = path.join(buildDest, 'publish', 'release');
    if (fs.existsSync(publishDir)) {
        const apks = fs.readdirSync(publishDir).filter(f => f.endsWith('.apk'));
        if (apks.length > 0) {
            return path.join(publishDir, apks[0]);
        }
    }

    return null;
}

// ==================== 核心函数 ====================

/**
 * 生成多环境 APK
 *
 * 流程：
 * 1. 确认 gradle 工程存在
 * 2. 对每个环境串行执行：
 *    a. 写入 env.json
 *    b. 运行 gradle assembleRelease
 *    c. 找到 APK 并复制到目标目录
 * 3. 写入 manifest.json
 * 4. 清理 env.json
 */
export async function generateMultiEnvApks(
    options: MultiEnvBuildOptions
): Promise<EnvBuildResult[]> {
    const { buildDest, projectRoot, version, environments, onLog } = options;
    const results: EnvBuildResult[] = [];

    const projDir = path.join(buildDest, 'proj');
    const gradlew = path.join(projDir, 'gradlew');

    // 检查 gradle 工程
    if (!fs.existsSync(gradlew)) {
        onLog('未找到 gradlew，请确认 Android 构建已完成', 'error');
        return results;
    }

    // 目标输出目录
    const uploadRoot = path.join(projectRoot, 'build_upload_assets');
    const appVersionDir = path.join(uploadRoot, 'android', 'app', version);
    fs.mkdirSync(appVersionDir, { recursive: true });

    onLog(`开始多环境 APK 构建，共 ${environments.length} 个环境: ${environments.join(', ')}`, 'info');

    for (let i = 0; i < environments.length; i++) {
        const env = environments[i];
        onLog(`\n========== [${i + 1}/${environments.length}] 构建环境: ${env} ==========`, 'info');

        try {
            // 1. 写入 env.json
            writeEnvJson(buildDest, env);
            onLog(`已写入 env.json: { "env": "${env}" }`, 'info');

            // 2. 执行 gradle assembleRelease
            onLog('开始 gradle assembleRelease...', 'info');
            await runGradleAssemble(projDir, onLog);
            onLog('gradle assembleRelease 完成', 'success');

            // 3. 查找 APK
            const apkPath = findBuiltApk(buildDest);
            if (!apkPath) {
                throw new Error('未找到构建产出 APK 文件');
            }

            // 4. 复制并重命名
            const destApk = path.join(appVersionDir, `app-${env}.apk`);
            fs.copyFileSync(apkPath, destApk);
            onLog(`已复制 APK → app-${env}.apk`, 'success');

            results.push({ env, success: true, apkPath: destApk });

        } catch (err: any) {
            onLog(`环境 ${env} 构建失败: ${err.message}`, 'error');
            results.push({ env, success: false, error: err.message });
        }
    }

    // 写入 manifest.json
    const successEnvs = results.filter(r => r.success).map(r => r.env);
    const manifest = {
        version,
        environments: successEnvs,
        apks: results
            .filter(r => r.success)
            .map(r => ({ env: r.env, filename: `app-${r.env}.apk` })),
        buildTime: new Date().toISOString(),
    };
    fs.writeFileSync(
        path.join(appVersionDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8'
    );

    // 清理 env.json（避免影响后续构建）
    const envJsonPath = path.join(buildDest, 'data', 'env.json');
    if (fs.existsSync(envJsonPath)) {
        fs.unlinkSync(envJsonPath);
        onLog('已清理 env.json', 'info');
    }

    // 汇总
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    onLog(`\n========== 多环境构建完成 ==========`, 'info');
    onLog(`成功: ${successCount}, 失败: ${failCount}`, successCount === environments.length ? 'success' : 'warn');

    return results;
}
