/**
 * iOS 签名配置面板
 * 纯签名配置：共享配置（P12 + Team ID）+ 每个环境的描述文件
 * 环境启用和导出方式在构建面板中配置
 */
export declare const template: string;
export declare const style = "\n#ios-signing-panel ::-webkit-scrollbar { width: 8px; }\n#ios-signing-panel ::-webkit-scrollbar-track { background: #1e1e1e; }\n#ios-signing-panel ::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }\n#ios-signing-panel ::-webkit-scrollbar-thumb:hover { background: #777; }\n#ios-signing-panel input:focus, #ios-signing-panel select:focus { border-color: #0e639c !important; }\n#ios-signing-panel button:hover { opacity: 0.9; }\n";
export declare const $: {
    'p12-file': string;
    'btn-select-p12': string;
    'p12-password': string;
    'team-id': string;
    'btn-save': string;
    'status-text': string;
    'btn-select-mp-dev': string;
    'env-dev-mp-file': string;
    'env-dev-mp-info': string;
    'env-dev-mp-name': string;
    'env-dev-mp-bundleid': string;
    'env-dev-mp-expired': string;
    'btn-select-mp-beta': string;
    'env-beta-mp-file': string;
    'env-beta-mp-info': string;
    'env-beta-mp-name': string;
    'env-beta-mp-bundleid': string;
    'env-beta-mp-expired': string;
    'btn-select-mp-prod': string;
    'env-prod-mp-file': string;
    'env-prod-mp-info': string;
    'env-prod-mp-name': string;
    'env-prod-mp-bundleid': string;
    'env-prod-mp-expired': string;
};
export declare function ready(this: any): void;
export declare function close(): void;
export declare const methods: {
    /**
     * 接收某个环境的 mobileprovision 选择和解析结果
     * dataStr: { envKey, fileName, name, uuid, teamId, bundleId, expirationDate, expired }
     */
    setMobileProvisionResult(this: any, dataStr: string): void;
    /**
     * 接收 P12 选择结果
     */
    setP12Result(this: any, dataStr: string): void;
    /**
     * 加载已保存的配置到面板
     */
    loadConfig(this: any, configStr: string): void;
    /**
     * 设置状态信息
     */
    setStatus(this: any, dataStr: string): void;
};
