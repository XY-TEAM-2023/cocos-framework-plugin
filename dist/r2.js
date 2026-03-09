"use strict";
/**
 * R2 Core Module
 *
 * 封装 Cloudflare R2（S3 兼容）的所有操作：
 *   - 配置读写（.r2config.json）
 *   - S3 客户端创建
 *   - 文件上传（带重试）、版本检查、目录清理
 *   - build_upload_assets 目录扫描
 */
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
exports.scanBuildUploadAssets = exports.deleteVersionDir = exports.uploadBundle = exports.uploadFile = exports.checkVersionExists = exports.testConnection = exports.createS3Client = exports.isR2Configured = exports.saveR2Config = exports.loadR2Config = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const client_s3_1 = require("@aws-sdk/client-s3");
// ==================== 配置管理 ====================
const CONFIG_FILE = '.r2config.json';
function getConfigPath(projectRoot) {
    return path.join(projectRoot, CONFIG_FILE);
}
function loadR2Config(projectRoot) {
    const configPath = getConfigPath(projectRoot);
    if (!fs.existsSync(configPath))
        return null;
    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw);
    }
    catch (_a) {
        return null;
    }
}
exports.loadR2Config = loadR2Config;
function saveR2Config(projectRoot, config) {
    const configPath = getConfigPath(projectRoot);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
exports.saveR2Config = saveR2Config;
function isR2Configured(config) {
    if (!config)
        return false;
    return !!(config.accountId && config.accessKeyId && config.secretAccessKey && config.bucketName);
}
exports.isR2Configured = isR2Configured;
// ==================== S3 客户端 ====================
function createS3Client(config) {
    return new client_s3_1.S3Client({
        region: 'auto',
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    });
}
exports.createS3Client = createS3Client;
// ==================== 连接测试 ====================
async function testConnection(config) {
    try {
        const client = createS3Client(config);
        await client.send(new client_s3_1.HeadBucketCommand({ Bucket: config.bucketName }));
        return { success: true };
    }
    catch (e) {
        return { success: false, error: e.message || String(e) };
    }
}
exports.testConnection = testConnection;
// ==================== 版本检查 ====================
/**
 * 检查 R2 上某个 bundle 版本是否已完整上传
 * 通过下载远端 manifest.json 并与本地比较判断
 */
async function checkVersionExists(client, bucket, entry) {
    var _a, _b;
    const manifestKey = `${entry.platform}/remote/${entry.bundleName}/${entry.version}/manifest.json`;
    try {
        const response = await client.send(new client_s3_1.GetObjectCommand({
            Bucket: bucket,
            Key: manifestKey,
        }));
        // 读取远端 manifest 内容
        const remoteManifest = await ((_a = response.Body) === null || _a === void 0 ? void 0 : _a.transformToString('utf-8'));
        if (!remoteManifest)
            return 'incomplete';
        // 读取本地 manifest
        const localManifestPath = path.join(entry.localDir, 'manifest.json');
        if (!fs.existsSync(localManifestPath))
            return 'incomplete';
        const localManifest = fs.readFileSync(localManifestPath, 'utf-8');
        // 比较内容是否一致
        if (remoteManifest.trim() === localManifest.trim()) {
            return 'complete';
        }
        return 'incomplete';
    }
    catch (e) {
        if (e.name === 'NoSuchKey' || ((_b = e.$metadata) === null || _b === void 0 ? void 0 : _b.httpStatusCode) === 404) {
            return 'not_found';
        }
        // 其他网络错误也视为 not_found，允许上传
        return 'not_found';
    }
}
exports.checkVersionExists = checkVersionExists;
// ==================== 文件上传 ====================
const MAX_AUTO_RETRIES = 2;
/**
 * 上传单个文件到 R2，自动重试最多 2 次
 * 返回 true 成功，false 需要用户决定
 */
async function uploadFile(client, bucket, key, filePath) {
    const body = fs.readFileSync(filePath);
    const contentType = guessContentType(filePath);
    for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
        try {
            await client.send(new client_s3_1.PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
            }));
            return true;
        }
        catch (e) {
            if (attempt < MAX_AUTO_RETRIES) {
                console.warn(`[R2] 上传重试 (${attempt + 1}/${MAX_AUTO_RETRIES}): ${key} - ${e.message}`);
                // 短暂等待后重试
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
            else {
                console.error(`[R2] 上传失败 (已重试 ${MAX_AUTO_RETRIES} 次): ${key} - ${e.message}`);
                return false;
            }
        }
    }
    return false;
}
exports.uploadFile = uploadFile;
function guessContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
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
function walkDir(dir) {
    const results = [];
    if (!fs.existsSync(dir))
        return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkDir(fullPath));
        }
        else if (entry.isFile()) {
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
async function uploadBundle(options) {
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
            onProgress === null || onProgress === void 0 ? void 0 : onProgress({ current: 0, total: 0, fileName: '', status: 'skipped' });
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
    const uploadedKeys = []; // 用于清理
    // 3. 并发上传（限制并发数）
    const concurrency = 5;
    let current = 0;
    let failed = false;
    const uploadOne = async (filePath) => {
        if ((isCancelled === null || isCancelled === void 0 ? void 0 : isCancelled()) || failed)
            return false;
        const relativePath = path.relative(entry.localDir, filePath).split(path.sep).join('/');
        const key = `${keyPrefix}/${relativePath}`;
        onProgress === null || onProgress === void 0 ? void 0 : onProgress({ current: current + 1, total, fileName: relativePath, status: 'uploading' });
        const success = await uploadFile(client, bucket, key, filePath);
        if (success) {
            uploadedKeys.push(key);
            current++;
            onProgress === null || onProgress === void 0 ? void 0 : onProgress({ current, total, fileName: relativePath, status: 'success' });
            return true;
        }
        else {
            onProgress === null || onProgress === void 0 ? void 0 : onProgress({ current, total, fileName: relativePath, status: 'error' });
            return false;
        }
    };
    // 分批并发
    for (let i = 0; i < sortedFiles.length; i += concurrency) {
        if ((isCancelled === null || isCancelled === void 0 ? void 0 : isCancelled()) || failed)
            break;
        const batch = sortedFiles.slice(i, i + concurrency);
        const results = await Promise.all(batch.map(f => uploadOne(f)));
        if (results.some(r => !r)) {
            failed = true;
            break;
        }
    }
    // 4. 处理结果
    if (isCancelled === null || isCancelled === void 0 ? void 0 : isCancelled()) {
        await deleteVersionDir(client, bucket, keyPrefix);
        return 'cancelled';
    }
    if (failed) {
        await deleteVersionDir(client, bucket, keyPrefix);
        return 'failed';
    }
    return 'success';
}
exports.uploadBundle = uploadBundle;
// ==================== 清理 ====================
/**
 * 删除 R2 上指定前缀下的所有对象
 */
async function deleteVersionDir(client, bucket, prefix) {
    try {
        // 列出所有对象
        const objects = [];
        let continuationToken;
        do {
            const listResponse = await client.send(new client_s3_1.ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix + '/',
                ContinuationToken: continuationToken,
            }));
            if (listResponse.Contents) {
                for (const obj of listResponse.Contents) {
                    if (obj.Key)
                        objects.push({ Key: obj.Key });
                }
            }
            continuationToken = listResponse.NextContinuationToken;
        } while (continuationToken);
        if (objects.length === 0)
            return;
        // 批量删除（每次最多 1000 个）
        for (let i = 0; i < objects.length; i += 1000) {
            const batch = objects.slice(i, i + 1000);
            await client.send(new client_s3_1.DeleteObjectsCommand({
                Bucket: bucket,
                Delete: { Objects: batch },
            }));
        }
        console.log(`[R2] 已清理远端目录：${prefix}/ (${objects.length} 个文件)`);
    }
    catch (e) {
        console.error(`[R2] 清理远端目录失败：${prefix}/ - ${e.message}`);
    }
}
exports.deleteVersionDir = deleteVersionDir;
// ==================== 目录扫描 ====================
/**
 * 扫描 build_upload_assets 目录，返回所有可上传的 bundle 版本
 *
 * 目录结构：
 *   build_upload_assets/{platform}/remote/{bundleName}/{version}/...
 *   build_upload_assets/{platform}/app/{version}/...              ← 新增：App 产物
 */
function scanBuildUploadAssets(projectRoot) {
    const assetsDir = path.join(projectRoot, 'build_upload_assets');
    if (!fs.existsSync(assetsDir))
        return [];
    const entries = [];
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
exports.scanBuildUploadAssets = scanBuildUploadAssets;
//# sourceMappingURL=r2.js.map