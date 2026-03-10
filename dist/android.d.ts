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
/** 加载 Android 打包配置 */
export declare function loadAndroidConfig(projectRoot: string): AndroidConfig | null;
/** 保存 Android 打包配置 */
export declare function saveAndroidConfig(projectRoot: string, config: AndroidConfig): void;
/** 获取有效配置（不存在配置文件时返回默认值：全部启用） */
export declare function getEffectiveConfig(projectRoot: string): AndroidConfig;
/** 获取启用的环境列表 */
export declare function getEnabledEnvironments(config: AndroidConfig): AndroidEnv[];
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
export declare function generateMultiEnvApks(options: MultiEnvBuildOptions): Promise<EnvBuildResult[]>;
