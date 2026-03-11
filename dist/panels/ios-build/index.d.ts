/**
 * iOS 多环境构建面板
 * 环境勾选 + 导出方式选择 + 构建按钮 + 实时日志输出
 */
export declare const template: string;
export declare const style = "\n#ios-build-panel ::-webkit-scrollbar { width: 8px; }\n#ios-build-panel ::-webkit-scrollbar-track { background: #1e1e1e; }\n#ios-build-panel ::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }\n#ios-build-panel ::-webkit-scrollbar-thumb:hover { background: #777; }\n#ios-build-panel button:hover { opacity: 0.9; }\n#ios-build-panel select:focus { border-color: #0e639c !important; }\n";
export declare const $: {
    'signing-status': string;
    'env-dev': string;
    'env-dev-method': string;
    'env-dev-hint': string;
    'env-beta': string;
    'env-beta-method': string;
    'env-beta-hint': string;
    'env-prod': string;
    'env-prod-method': string;
    'env-prod-hint': string;
    'btn-build': string;
    'btn-copy': string;
    'btn-clear': string;
    'log-container': string;
};
export declare function ready(this: any): void;
export declare function close(): void;
export declare const methods: {
    /**
     * 加载配置到面板（签名状态、环境选择、导出方式）
     */
    loadConfig(this: any, dataStr: string): void;
    /**
     * 追加构建日志
     */
    appendLog(this: any, dataStr: string): void;
    /**
     * 构建开始，禁用按钮
     */
    setBuildStarted(this: any): void;
    /**
     * 构建完成，恢复按钮
     */
    setBuildComplete(this: any, dataStr: string): void;
};
