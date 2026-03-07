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
 *   build_upload_assets/{platform}/remote/{bundleName}/version  ← 过滤
 */
export declare function scanBuildUploadAssets(projectRoot: string): BundleVersionEntry[];
