/**
 * Pages 配置面板
 *
 * API Token + 三环境项目名/域名配置
 */
export declare const template: string;
export declare const style = "\n#pages-config-panel input:focus {\n    border-color: #0e639c !important;\n}\n#pages-config-panel button:hover:not(:disabled) {\n    opacity: 0.9;\n}\n";
export declare const $: {
    'input-api-token': string;
    'token-help': string;
    'input-production-project': string;
    'input-production-domain': string;
    'input-staging-project': string;
    'input-staging-domain': string;
    'input-dev-project': string;
    'input-dev-domain': string;
    'btn-test': string;
    'btn-save': string;
    'status-text': string;
};
export declare function ready(this: any): void;
export declare function close(): void;
export declare const methods: {
    loadConfig(configStr: string): void;
    setStatus(dataStr: string): void;
};
