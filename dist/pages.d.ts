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
import { S3Client } from '@aws-sdk/client-s3';
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
        status: string;
    };
    deployment_trigger: {
        metadata: {
            commit_message: string;
        };
    };
    is_current: boolean;
}
/** 部署选项 */
export interface DeployOptions {
    r2Client: S3Client;
    r2Bucket: string;
    version: string;
    env: PagesEnvironment;
    commitMessage: string;
    config: PagesConfig;
    onLog: (msg: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}
export declare function loadPagesConfig(projectRoot: string): PagesConfig | null;
export declare function savePagesConfig(projectRoot: string, config: PagesConfig): void;
export declare function isPagesConfigured(config: PagesConfig | null): boolean;
export declare function isEnvConfigured(config: PagesConfig | null, env: PagesEnvironment): boolean;
/** 获取可用环境列表 */
export declare function getAvailableEnvironments(config: PagesConfig | null): Array<{
    env: PagesEnvironment;
    label: string;
    projectName: string;
    domain: string;
    configured: boolean;
}>;
/** 列出 R2 中的 app 版本 */
export declare function listR2AppVersions(client: S3Client, bucket: string, platform?: string): Promise<string[]>;
/** 从 R2 下载指定版本并部署到 Pages */
export declare function deployFromR2(options: DeployOptions): Promise<{
    success: boolean;
    url?: string;
    error?: string;
}>;
/** 列出部署 */
export declare function listDeployments(apiToken: string, accountId: string, projectName: string): Promise<PagesDeployment[]>;
/** 回滚到指定部署 */
export declare function rollbackDeployment(apiToken: string, accountId: string, projectName: string, deploymentId: string): Promise<void>;
/** 删除部署 */
export declare function deleteDeployment(apiToken: string, accountId: string, projectName: string, deploymentId: string): Promise<void>;
/** 测试 Pages API 连接 */
export declare function testPagesConnection(apiToken: string, accountId: string, projectName: string): Promise<{
    success: boolean;
    error?: string;
}>;
