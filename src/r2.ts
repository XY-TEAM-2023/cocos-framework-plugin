/**
 * R2 Core Module
 *
 * 封装 Cloudflare R2（S3 兼容）的所有操作：
 *   - 配置读写（.r2config.json）
 *   - S3 客户端创建
 *   - 文件上传（带重试）、版本检查、目录清理
 *   - build_upload_assets 目录扫描
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    S3Client,
    HeadBucketCommand,
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

// ==================== 类型定义 ====================

export interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    autoPromptAfterBuild: boolean;
}

/** 目录扫描结果：一个可上传的 bundle 版本 */
export interface BundleVersionEntry {
    platform: string;       // e.g. "android", "web-mobile"
    bundleName: string;     // e.g. "DemoAssetsBundle"
    version: string;        // e.g. "260307162726"
    localDir: string;       // 本地绝对路径
}

/** 上传进度回调 */
export interface UploadProgress {
    current: number;
    total: number;
    fileName: string;
    status: 'uploading' | 'success' | 'error' | 'skipped';
}

/** 上传选项 */
export interface UploadBundleOptions {
    client: S3Client;
    bucket: string;
    entry: BundleVersionEntry;
    onProgress?: (progress: UploadProgress) => void;
    isCancelled?: () => boolean;
}

// ==================== 配置管理 ====================

const CONFIG_FILE = '.r2config.json';

function getConfigPath(projectRoot: string): string {
    return path.join(projectRoot, CONFIG_FILE);
}

export function loadR2Config(projectRoot: string): R2Config | null {
    const configPath = getConfigPath(projectRoot);
    if (!fs.existsSync(configPath)) return null;
    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw) as R2Config;
    } catch {
        return null;
    }
}

export function saveR2Config(projectRoot: string, config: R2Config): void {
    const configPath = getConfigPath(projectRoot);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function isR2Configured(config: R2Config | null): boolean {
    if (!config) return false;
    return !!(config.accountId && config.accessKeyId && config.secretAccessKey && config.bucketName);
}

// ==================== S3 客户端 ====================

export function createS3Client(config: R2Config): S3Client {
    return new S3Client({
        region: 'auto',
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    });
}

// ==================== 连接测试 ====================

export async function testConnection(config: R2Config): Promise<{ success: boolean; error?: string }> {
    try {
        const client = createS3Client(config);
        await client.send(new HeadBucketCommand({ Bucket: config.bucketName }));
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || String(e) };
    }
}

// ==================== 版本检查 ====================

/**
 * 检查 R2 上某个 bundle 版本是否已完整上传
 * 通过下载远端 manifest.json 并与本地比较判断
 */
export async function checkVersionExists(
    client: S3Client,
    bucket: string,
    entry: BundleVersionEntry
): Promise<'complete' | 'incomplete' | 'not_found'> {
    const manifestKey = `${entry.platform}/remote/${entry.bundleName}/${entry.version}/manifest.json`;

    try {
        const response = await client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: manifestKey,
        }));

        // 读取远端 manifest 内容
        const remoteManifest = await response.Body?.transformToString('utf-8');
        if (!remoteManifest) return 'incomplete';

        // 读取本地 manifest
        const localManifestPath = path.join(entry.localDir, 'manifest.json');
        if (!fs.existsSync(localManifestPath)) return 'incomplete';

        const localManifest = fs.readFileSync(localManifestPath, 'utf-8');

        // 比较内容是否一致
        if (remoteManifest.trim() === localManifest.trim()) {
            return 'complete';
        }
        return 'incomplete';
    } catch (e: any) {
        if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
            return 'not_found';
        }
        // 其他网络错误也视为 not_found，允许上传
        return 'not_found';
    }
}

// ==================== 文件上传 ====================

const MAX_AUTO_RETRIES = 2;

/**
 * 上传单个文件到 R2，自动重试最多 2 次
 * 返回 true 成功，false 需要用户决定
 */
export async function uploadFile(
    client: S3Client,
    bucket: string,
    key: string,
    filePath: string
): Promise<boolean> {
    const body = fs.readFileSync(filePath);
    const contentType = guessContentType(filePath);

    for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
        try {
            await client.send(new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
            }));
            return true;
        } catch (e: any) {
            if (attempt < MAX_AUTO_RETRIES) {
                console.warn(`[R2] 上传重试 (${attempt + 1}/${MAX_AUTO_RETRIES}): ${key} - ${e.message}`);
                // 短暂等待后重试
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            } else {
                console.error(`[R2] 上传失败 (已重试 ${MAX_AUTO_RETRIES} 次): ${key} - ${e.message}`);
                return false;
            }
        }
    }
    return false;
}

function guessContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
        '.json': 'application/json',
        '.js': 'application/javascript',
        '.bin': 'application/octet-stream',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg',
        '.wav': 'audio/wav',
        '.css': 'text/css',
        '.html': 'text/html',
        '.apk': 'application/vnd.android.package-archive',
    };
    return map[ext] || 'application/octet-stream';
}

// ==================== Bundle 上传 ====================

/**
 * 递归扫描目录下所有文件
 */
function walkDir(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkDir(fullPath));
        } else if (entry.isFile()) {
            results.push(fullPath);
        }
    }
    return results;
}

/**
 * 上传整个 bundle 版本目录到 R2
 *
 * 流程：
 *   1. 扫描本地文件（排除 version）
 *   2. 检查远端是否已有完整版本
 *   3. 并发上传（manifest 排最后）
 *   4. 支持取消 + 失败后清理
 *
 * 返回 'success' | 'cancelled' | 'failed' | 'skipped'
 */
export async function uploadBundle(options: UploadBundleOptions): Promise<'success' | 'cancelled' | 'failed' | 'skipped'> {
    const { client, bucket, entry, onProgress, isCancelled } = options;

    // App 产物使用不同的 key 路径
    const isApp = entry.bundleName === '📦 app';
    const keyPrefix = isApp
        ? `${entry.platform}/app/${entry.version}`
        : `${entry.platform}/remote/${entry.bundleName}/${entry.version}`;

    // 1. 检查远端版本（App 产物跳过 manifest 版本检查）
    if (!isApp) {
        const existsStatus = await checkVersionExists(client, bucket, entry);
        if (existsStatus === 'complete') {
            onProgress?.({ current: 0, total: 0, fileName: '', status: 'skipped' });
            return 'skipped';
        }
    }

    // 2. 扫描本地文件
    const allFiles = walkDir(entry.localDir);
    // 排除 version 文件（不应在版本子目录内，但以防万一）
    const files = allFiles.filter(f => path.basename(f) !== 'version');

    // manifest 排最后
    const manifestFiles = files.filter(f => path.basename(f) === 'manifest.json');
    const otherFiles = files.filter(f => path.basename(f) !== 'manifest.json');
    const sortedFiles = [...otherFiles, ...manifestFiles];

    const total = sortedFiles.length;
    const uploadedKeys: string[] = []; // 用于清理

    // 3. 并发上传（限制并发数）
    const concurrency = 5;
    let current = 0;
    let failed = false;

    const uploadOne = async (filePath: string): Promise<boolean> => {
        if (isCancelled?.() || failed) return false;

        const relativePath = path.relative(entry.localDir, filePath).split(path.sep).join('/');
        const key = `${keyPrefix}/${relativePath}`;

        onProgress?.({ current: current + 1, total, fileName: relativePath, status: 'uploading' });

        const success = await uploadFile(client, bucket, key, filePath);
        if (success) {
            uploadedKeys.push(key);
            current++;
            onProgress?.({ current, total, fileName: relativePath, status: 'success' });
            return true;
        } else {
            onProgress?.({ current, total, fileName: relativePath, status: 'error' });
            return false;
        }
    };

    // 分批并发
    for (let i = 0; i < sortedFiles.length; i += concurrency) {
        if (isCancelled?.() || failed) break;

        const batch = sortedFiles.slice(i, i + concurrency);
        const results = await Promise.all(batch.map(f => uploadOne(f)));

        if (results.some(r => !r)) {
            failed = true;
            break;
        }
    }

    // 4. 处理结果
    if (isCancelled?.()) {
        await deleteVersionDir(client, bucket, keyPrefix);
        return 'cancelled';
    }

    if (failed) {
        await deleteVersionDir(client, bucket, keyPrefix);
        return 'failed';
    }

    return 'success';
}

// ==================== 清理 ====================

/**
 * 删除 R2 上指定前缀下的所有对象
 */
export async function deleteVersionDir(client: S3Client, bucket: string, prefix: string): Promise<void> {
    try {
        // 列出所有对象
        const objects: { Key: string }[] = [];
        let continuationToken: string | undefined;

        do {
            const listResponse = await client.send(new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix + '/',
                ContinuationToken: continuationToken,
            }));

            if (listResponse.Contents) {
                for (const obj of listResponse.Contents) {
                    if (obj.Key) objects.push({ Key: obj.Key });
                }
            }
            continuationToken = listResponse.NextContinuationToken;
        } while (continuationToken);

        if (objects.length === 0) return;

        // 批量删除（每次最多 1000 个）
        for (let i = 0; i < objects.length; i += 1000) {
            const batch = objects.slice(i, i + 1000);
            await client.send(new DeleteObjectsCommand({
                Bucket: bucket,
                Delete: { Objects: batch },
            }));
        }

        console.log(`[R2] 已清理远端目录：${prefix}/ (${objects.length} 个文件)`);
    } catch (e: any) {
        console.error(`[R2] 清理远端目录失败：${prefix}/ - ${e.message}`);
    }
}

// ==================== 目录扫描 ====================

/**
 * 扫描 build_upload_assets 目录，返回所有可上传的 bundle 版本
 *
 * 目录结构：
 *   build_upload_assets/{platform}/remote/{bundleName}/{version}/...
 *   build_upload_assets/{platform}/app/{version}/...              ← 新增：App 产物
 */
export function scanBuildUploadAssets(projectRoot: string): BundleVersionEntry[] {
    const assetsDir = path.join(projectRoot, 'build_upload_assets');
    if (!fs.existsSync(assetsDir)) return [];

    const entries: BundleVersionEntry[] = [];

    // 第一层：平台 (android, web-mobile ...)
    const platforms = fs.readdirSync(assetsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== '.DS_Store');

    for (const platformEntry of platforms) {
        const platform = platformEntry.name;

        // ---- 扫描 remote/ (bundle 版本) ----
        const remoteDir = path.join(assetsDir, platform, 'remote');
        if (fs.existsSync(remoteDir)) {
            const bundles = fs.readdirSync(remoteDir, { withFileTypes: true })
                .filter(d => d.isDirectory());

            for (const bundleEntry of bundles) {
                const bundleName = bundleEntry.name;
                const bundleDir = path.join(remoteDir, bundleName);

                const versions = fs.readdirSync(bundleDir, { withFileTypes: true })
                    .filter(d => d.isDirectory());

                for (const versionEntry of versions) {
                    entries.push({
                        platform,
                        bundleName,
                        version: versionEntry.name,
                        localDir: path.join(bundleDir, versionEntry.name),
                    });
                }
            }
        }

        // ---- 扫描 app/ (App 产物) ----
        const appDir = path.join(assetsDir, platform, 'app');
        if (fs.existsSync(appDir)) {
            const versions = fs.readdirSync(appDir, { withFileTypes: true })
                .filter(d => d.isDirectory());

            for (const versionEntry of versions) {
                entries.push({
                    platform,
                    bundleName: '📦 app',
                    version: versionEntry.name,
                    localDir: path.join(appDir, versionEntry.name),
                });
            }
        }
    }

    return entries;
}
