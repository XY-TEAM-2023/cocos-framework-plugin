/**
 * Cloudflare Pages Core Module
 *
 * 封装 Pages API 操作：
 *   - 配置读写（.pagesconfig.json）
 *   - 部署（R2 → 临时目录 → wrangler pages deploy）
 *   - 列出部署
 *   - 回滚
 *   - 删除部署
 *   - 列出 R2 中的 app 版本
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
} from '@aws-sdk/client-s3';

// ==================== 类型定义 ====================

export interface PagesProjectConfig {
    projectName: string;
    domain: string;
}

export interface PagesConfig {
    pagesApiToken: string;
    pagesProjects: {
        production: PagesProjectConfig;
        staging: PagesProjectConfig;
        dev: PagesProjectConfig;
    };
}

export type PagesEnvironment = 'production' | 'staging' | 'dev';

/** Pages 部署信息 */
export interface PagesDeployment {
    id: string;
    url: string;
    environment: string;
    created_on: string;
    latest_stage: {
        name: string;
        status: string;  // "success" | "failure" | "active"
    };
    deployment_trigger: {
        metadata: {
            commit_message: string;
        };
    };
    is_current: boolean;  // 我们自己标记：是否是当前生产版本
}

/** 部署选项 */
export interface DeployOptions {
    r2Client: S3Client;
    r2Bucket: string;
    version: string;
    env: PagesEnvironment;
    commitMessage: string;
    config: PagesConfig;
    accountId: string;
    onLog: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}

// ==================== 配置管理 ====================

const CONFIG_FILE = '.pagesconfig.json';

function getConfigPath(projectRoot: string): string {
    return path.join(projectRoot, CONFIG_FILE);
}

export function loadPagesConfig(projectRoot: string): PagesConfig | null {
    const configPath = getConfigPath(projectRoot);
    if (!fs.existsSync(configPath)) return null;
    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw) as PagesConfig;
    } catch {
        return null;
    }
}

export function savePagesConfig(projectRoot: string, config: PagesConfig): void {
    const configPath = getConfigPath(projectRoot);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function isPagesConfigured(config: PagesConfig | null): boolean {
    return !!(config && config.pagesApiToken);
}

export function isEnvConfigured(config: PagesConfig | null, env: PagesEnvironment): boolean {
    if (!config) return false;
    const proj = config.pagesProjects?.[env];
    return !!(proj && proj.projectName);
}

/** 获取可用环境列表 */
export function getAvailableEnvironments(config: PagesConfig | null): Array<{
    env: PagesEnvironment;
    label: string;
    projectName: string;
    domain: string;
    configured: boolean;
}> {
    const envs: Array<{ env: PagesEnvironment; label: string }> = [
        { env: 'production', label: '正式' },
        { env: 'staging', label: '预览' },
        { env: 'dev', label: '开发' },
    ];
    return envs.map(e => {
        const proj = config?.pagesProjects?.[e.env];
        return {
            ...e,
            projectName: proj?.projectName || '',
            domain: proj?.domain || '',
            configured: !!(proj && proj.projectName),
        };
    });
}

// ==================== R2 App 版本列出 ====================

/** 列出 R2 中的 app 版本 */
export async function listR2AppVersions(
    client: S3Client,
    bucket: string,
    platform: string = 'web-mobile',
): Promise<string[]> {
    const prefix = `${platform}/app/`;
    const versions: Set<string> = new Set();

    let continuationToken: string | undefined;
    do {
        const resp = await client.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            Delimiter: '/',
            ContinuationToken: continuationToken,
        }));

        if (resp.CommonPrefixes) {
            for (const cp of resp.CommonPrefixes) {
                if (cp.Prefix) {
                    const ver = cp.Prefix.replace(prefix, '').replace(/\/$/, '');
                    if (ver) versions.add(ver);
                }
            }
        }
        continuationToken = resp.NextContinuationToken;
    } while (continuationToken);

    return Array.from(versions).sort().reverse();
}

/** 列出 R2 中某个 app 版本的所有文件 key */
async function listR2AppFiles(
    client: S3Client,
    bucket: string,
    platform: string,
    version: string,
): Promise<string[]> {
    const prefix = `${platform}/app/${version}/`;
    const keys: string[] = [];

    let continuationToken: string | undefined;
    do {
        const resp = await client.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        }));

        if (resp.Contents) {
            for (const obj of resp.Contents) {
                if (obj.Key && !obj.Key.endsWith('/')) {
                    keys.push(obj.Key);
                }
            }
        }
        continuationToken = resp.NextContinuationToken;
    } while (continuationToken);

    return keys;
}

// ==================== 部署 ====================

function runCmd(cmd: string, options?: { cwd?: string; env?: Record<string, string> }): Promise<string> {
    return new Promise((resolve, reject) => {
        const mergedEnv = {
            ...process.env,
            HOME: process.env.HOME || os.homedir(),
            PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
            ...options?.env,
        };
        exec(cmd, {
            cwd: options?.cwd,
            maxBuffer: 10 * 1024 * 1024,
            env: mergedEnv,
            shell: '/bin/zsh',
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

/** 从 R2 下载指定版本并部署到 Pages */
export async function deployFromR2(options: DeployOptions): Promise<{ success: boolean; url?: string; error?: string }> {
    const { r2Client, r2Bucket, version, env, commitMessage, config, accountId, onLog } = options;
    const projectName = config.pagesProjects[env].projectName;
    const platform = 'web-mobile';
    const prefix = `${platform}/app/${version}/`;
    const tmpDir = path.join(os.tmpdir(), `pages-deploy-${version}-${Date.now()}`);

    try {
        // 1. 列出文件
        onLog(`[Pages] 正在扫描 R2: ${prefix} ...`);
        const keys = await listR2AppFiles(r2Client, r2Bucket, platform, version);
        if (keys.length === 0) {
            return { success: false, error: `R2 中未找到版本 ${version} 的文件` };
        }
        onLog(`[Pages] 发现 ${keys.length} 个文件`);

        // 2. 下载到临时目录
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const relativePath = key.replace(prefix, '');
            onLog(`[Pages] 下载 (${i + 1}/${keys.length}) ${relativePath}`);
            const localPath = path.join(tmpDir, relativePath);
            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            const obj = await r2Client.send(new GetObjectCommand({ Bucket: r2Bucket, Key: key }));
            if (obj.Body) {
                const chunks: Buffer[] = [];
                for await (const chunk of obj.Body as any) {
                    chunks.push(Buffer.from(chunk));
                }
                fs.writeFileSync(localPath, Buffer.concat(chunks));
            }
        }
        onLog(`[Pages] 全部下载完成`, 'success');

        // 3. 注入 env.json（客户端根据此文件判断运行环境）
        const envMap: Record<PagesEnvironment, string> = {
            'production': 'prod',
            'staging': 'beta',
            'dev': 'dev',
        };
        const appEnv = envMap[env] || 'dev';
        fs.writeFileSync(path.join(tmpDir, 'env.json'), JSON.stringify({ env: appEnv }));
        onLog(`[Pages] ✅ 已注入 env.json → { "env": "${appEnv}" }`);

        // 4. 部署到 Pages
        onLog(`[Pages] 正在部署到 Pages (项目: ${projectName}) ...`);

        // wrangler 需要 .wrangler/cache 目录
        fs.mkdirSync(path.join(tmpDir, '.wrangler', 'cache'), { recursive: true });

        // 在 commit message 前添加 R2 版本号前缀
        const fullMsg = `【R2-${version}】${commitMessage}`;
        const escapedMsg = fullMsg.replace(/"/g, '\\"');
        const cmd = `npx wrangler pages deploy .`
            + ` --project-name="${projectName}"`
            + ` --branch="main"`
            + ` --commit-message="${escapedMsg}"`;

        const output = await runCmd(cmd, {
            cwd: tmpDir,
            env: {
                CLOUDFLARE_API_TOKEN: config.pagesApiToken,
                CLOUDFLARE_ACCOUNT_ID: accountId,
            },
        });
        onLog(`[Pages] wrangler 输出: ${output}`);

        // 4. 清理
        fs.rmSync(tmpDir, { recursive: true, force: true });
        onLog(`[Pages] 部署成功，临时文件已清理`, 'success');

        // 提取 URL
        const urlMatch = output.match(/https:\/\/[^\s]+\.pages\.dev/);
        return { success: true, url: urlMatch ? urlMatch[0] : undefined };
    } catch (e: any) {
        onLog(`[Pages] 部署失败: ${e.message}`, 'error');
        // 清理临时目录
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        onLog(`[Pages] 临时文件已清理`);
        return { success: false, error: e.message };
    }
}

// ==================== Pages API ====================

const API_BASE = 'https://api.cloudflare.com/client/v4';

async function pagesApiFetch(
    apiToken: string,
    accountId: string,
    projectName: string,
    endpoint: string = '',
    method: string = 'GET',
): Promise<any> {
    const url = `${API_BASE}/accounts/${accountId}/pages/projects/${projectName}/deployments${endpoint}`;

    const resp = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
    });

    const json = await resp.json();
    if (!json.success) {
        const errMsg = json.errors?.map((e: any) => e.message).join(', ') || 'Unknown error';
        throw new Error(errMsg);
    }
    return json;
}

/** 列出部署 */
export async function listDeployments(
    apiToken: string,
    accountId: string,
    projectName: string,
): Promise<PagesDeployment[]> {
    const json = await pagesApiFetch(apiToken, accountId, projectName);
    const deployments: PagesDeployment[] = json.result || [];

    // 标记当前生产版本（第一个 environment=production 且 status=success 的）
    let foundProduction = false;
    for (const d of deployments) {
        if (!foundProduction && d.environment === 'production' && d.latest_stage?.status === 'success') {
            d.is_current = true;
            foundProduction = true;
        } else {
            d.is_current = false;
        }
    }

    return deployments;
}

/** 回滚到指定部署 */
export async function rollbackDeployment(
    apiToken: string,
    accountId: string,
    projectName: string,
    deploymentId: string,
): Promise<void> {
    await pagesApiFetch(apiToken, accountId, projectName, `/${deploymentId}/rollback`, 'POST');
}

/** 删除部署 */
export async function deleteDeployment(
    apiToken: string,
    accountId: string,
    projectName: string,
    deploymentId: string,
): Promise<void> {
    await pagesApiFetch(apiToken, accountId, projectName, `/${deploymentId}?force=true`, 'DELETE');
}

/** 测试 Pages API 连接 */
export async function testPagesConnection(
    apiToken: string,
    accountId: string,
    projectName: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        await pagesApiFetch(apiToken, accountId, projectName);
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || String(e) };
    }
}
