/**
 * R2 Core Module
 *
 * 封装 Cloudflare R2（S3 兼容）的所有操作：
 *   - 配置读写（.r2config.json）
 *   - S3 客户端创建
 *   - 文件上传（带重试）、版本检查、目录清理
 *   - build_upload_assets 目录扫描
 */
import { S3Client } from '@aws-sdk/client-s3';
export interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    autoPromptAfterBuild: boolean;
}
/** 目录扫描结果：一个可上传的 bundle 版本 */
export interface BundleVersionEntry {
    platform: string;
    bundleName: string;
    version: string;
    localDir: string;
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
export declare function loadR2Config(projectRoot: string): R2Config | null;
export declare function saveR2Config(projectRoot: string, config: R2Config): void;
export declare function isR2Configured(config: R2Config | null): boolean;
export declare function createS3Client(config: R2Config): S3Client;
export declare function testConnection(config: R2Config): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * 检查 R2 上某个 bundle 版本是否已完整上传
 * 通过下载远端 manifest.json 并与本地比较判断
 */
export declare function checkVersionExists(client: S3Client, bucket: string, entry: BundleVersionEntry): Promise<'complete' | 'incomplete' | 'not_found'>;
/**
 * 检查本地 bundle/app 相比 R2 上最新版本是否有变更
 *
 * 对比策略：
 *   1. 先检查同版本号是否已完整上传到 R2 → 如果是则 'unchanged'
 *   2. Bundle: 读取 R2 version_dev → 用该版本号下载 manifest.json → 与本地对比
 *   3. App:    列出 {platform}/app/ 下所有版本目录 → 取最新 → 下载 manifest → 对比
 *
 * 返回值：
 *   - 'new'       远端无此 bundle/app 的任何版本（首次上传）
 *   - 'changed'   manifest 不同，需要上传
 *   - 'unchanged' manifest 一致或同版本已存在，可跳过
 */
export declare function checkBundleChanged(client: S3Client, bucket: string, entry: BundleVersionEntry): Promise<'changed' | 'unchanged' | 'new'>;
/**
 * 上传单个文件到 R2，自动重试最多 2 次
 * 返回 true 成功，false 需要用户决定
 */
export declare function uploadFile(client: S3Client, bucket: string, key: string, filePath: string): Promise<boolean>;
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
export declare function uploadBundle(options: UploadBundleOptions): Promise<'success' | 'cancelled' | 'failed' | 'skipped'>;
/**
 * 删除 R2 上指定前缀下的所有对象
 */
export declare function deleteVersionDir(client: S3Client, bucket: string, prefix: string): Promise<void>;
/**
 * 扫描 build_upload_assets 目录，返回所有可上传的 bundle 版本
 *
 * 目录结构：
 *   build_upload_assets/{platform}/remote/{bundleName}/{version}/...
 *   build_upload_assets/{platform}/app/{version}/...              ← 新增：App 产物
 */
export declare function scanBuildUploadAssets(projectRoot: string): BundleVersionEntry[];
/**
 * 列出 R2 上的所有平台
 * 通过列出根级 CommonPrefixes 获取平台列表
 */
export declare function listR2Platforms(client: S3Client, bucket: string): Promise<string[]>;
/**
 * 列出指定平台下 remote/ 里的 bundle 名列表
 */
export declare function listR2Bundles(client: S3Client, bucket: string, platform: string): Promise<string[]>;
/**
 * 列出指定 bundle 的所有版本子目录
 */
/**
 * 列出指定 Bundle 的所有历史版本号 (分页)
 */
export declare function listR2BundleVersions(client: S3Client, bucket: string, platform: string, bundleName: string, pageSize?: number, continuationToken?: string): Promise<{
    versions: string[];
    nextContinuationToken?: string;
}>;
/** 各环境版本信息 */
export interface BundleVersionInfo {
    dev?: string;
    beta?: string;
    prod?: string;
}
/**
 * 读取指定 bundle 的各环境版本号
 * 分别从 version_dev、version_beta、version_prod 三个独立文件读取
 */
export declare function getR2BundleVersions(client: S3Client, bucket: string, platform: string, bundleName: string): Promise<BundleVersionInfo>;
/**
 * 设置指定 bundle 某个环境的版本号
 * 只写入对应的 version_{env} 文件，不影响其他环境
 */
export declare function setR2BundleVersion(client: S3Client, bucket: string, platform: string, bundleName: string, env: 'dev' | 'beta' | 'prod', version: string): Promise<void>;
/**
 * [性能优化] 一次性扫描 R2 上所有平台的所有 bundle 的 version_xxx 文件
 * 返回格式：[ { platform, bundleName, versions: { dev?: string, beta?: string, prod?: string } } ]
 * 这个函数将 N * M * 3 次 R2 对象请求合并为 1 次 ListObjects 请求 + 批量并发下载文本
 */
export declare function listR2AllBundleVersions(client: S3Client, bucket: string, platform?: string): Promise<Array<{
    platform: string;
    bundleName: string;
    versions: BundleVersionInfo;
}>>;
