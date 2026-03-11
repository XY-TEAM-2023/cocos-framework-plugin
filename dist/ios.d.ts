/**
 * iOS 多环境 IPA 构建模块
 *
 * 功能：
 * 1. 管理 iOS 签名配置（.iosconfig.json + .ios-signing/ 目录）
 * 2. 解析 .mobileprovision 文件提取签名信息
 * 3. 安装签名文件到系统（Provisioning Profiles + Keychain）
 * 4. 一次 Cocos 构建后，循环生成多个环境的 IPA
 *    - 写入 env.json → xcodebuild archive → xcodebuild export → 重命名 IPA
 *
 * 产出结构：
 *   build_upload_assets/ios/app/{version}/
 *   ├── app-dev.ipa
 *   ├── app-beta.ipa
 *   ├── app-prod.ipa
 *   └── manifest.json
 */
/** 可用环境类型 */
export type IOSEnv = 'dev' | 'beta' | 'prod';
/** 单个环境的签名配置 */
export interface IOSEnvSigningConfig {
    /** 是否启用此环境 */
    enabled: boolean;
    /** 导出方式（simulator 表示模拟器构建，无需签名） */
    exportMethod: 'development' | 'ad-hoc' | 'app-store' | 'enterprise' | 'simulator';
    /** .ios-signing/ 下的 mobileprovision 文件名 */
    mobileprovisionFile: string;
    /** Provisioning Profile Name（从 mobileprovision 解析） */
    profileName: string;
    /** Provisioning Profile UUID（从 mobileprovision 解析） */
    profileUUID: string;
    /** Bundle Identifier（从 mobileprovision 解析） */
    bundleId: string;
}
/** iOS 打包配置 */
export interface IOSConfig {
    /** 共享配置：P12 证书 + Team ID（所有环境共用） */
    shared: {
        /** .ios-signing/ 下的 p12 文件名 */
        p12File: string;
        /** P12 密码（持久化） */
        p12Password: string;
        /** Team ID */
        teamId: string;
    };
    /** 每个环境的独立配置（不同环境对应不同导出方式和描述文件） */
    environments: {
        dev: IOSEnvSigningConfig;
        beta: IOSEnvSigningConfig;
        prod: IOSEnvSigningConfig;
    };
}
/** 多环境构建选项 */
export interface IOSBuildOptions {
    /** 项目根目录 */
    projectRoot: string;
    /** 版本号（时间戳格式 yyMMddHHmmss） */
    version: string;
    /** 需要构建的环境列表 */
    environments: IOSEnv[];
    /** 日志回调 */
    onLog: (message: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
}
/** 单次构建结果 */
export interface EnvBuildResult {
    env: IOSEnv;
    success: boolean;
    ipaPath?: string;
    error?: string;
}
/** mobileprovision 解析结果 */
export interface MobileProvisionInfo {
    name: string;
    uuid: string;
    teamId: string;
    bundleId: string;
    expirationDate: string;
    expired: boolean;
}
/** 加载 iOS 打包配置 */
export declare function loadIOSConfig(projectRoot: string): IOSConfig | null;
/** 保存 iOS 打包配置 */
export declare function saveIOSConfig(projectRoot: string, config: IOSConfig): void;
/** 获取有效配置（不存在配置文件时返回默认值） */
export declare function getEffectiveIOSConfig(projectRoot: string): IOSConfig;
/** 获取启用的环境列表 */
export declare function getEnabledIOSEnvironments(config: IOSConfig): IOSEnv[];
/** 检查共享签名配置是否完整（P12 + Team ID） */
export declare function isSharedSigningConfigured(config: IOSConfig): boolean;
/** 检查某个环境的签名配置是否完整（simulator 无需签名，始终返回 true） */
export declare function isEnvSigningConfigured(envConfig: IOSEnvSigningConfig): boolean;
/** 检查签名配置是否完整（共享 + 至少一个环境） */
export declare function isSigningConfigured(config: IOSConfig): boolean;
/**
 * 复制签名文件到 .ios-signing/ 目录
 * @returns 复制后的文件名
 */
export declare function copySigningFile(sourcePath: string, projectRoot: string, type: 'mobileprovision' | 'p12'): string;
/**
 * 解析 .mobileprovision 文件
 * 使用 security cms -D -i 解析内嵌的 plist
 */
export declare function parseMobileProvision(filePath: string): Promise<MobileProvisionInfo>;
/**
 * 安装 mobileprovision 到系统
 * 复制到 ~/Library/MobileDevice/Provisioning Profiles/{UUID}.mobileprovision
 */
export declare function installMobileProvision(projectRoot: string, envConfig: IOSEnvSigningConfig): void;
/**
 * 导入 P12 证书到钥匙串
 */
export declare function importP12ToKeychain(projectRoot: string, config: IOSConfig): void;
/**
 * 在 build/ios/proj/ 下查找 Xcode 工程
 * 返回工程路径和 scheme 名称
 */
export declare function findXcodeProject(buildDest: string): {
    projectPath: string;
    workspacePath?: string;
    schemeName: string;
} | null;
/**
 * 生成多环境 IPA
 *
 * 流程：
 * 1. 确认 Xcode 工程存在
 * 2. 安装签名文件
 * 3. 对每个环境串行执行：
 *    a. 写入 env.json
 *    b. xcodebuild archive
 *    c. xcodebuild -exportArchive
 *    d. 复制并重命名 IPA
 * 4. 写入 manifest.json
 * 5. 清理 env.json
 */
export declare function generateMultiEnvIpas(options: IOSBuildOptions): Promise<EnvBuildResult[]>;
