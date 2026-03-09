/**
 * Pages 配置面板
 *
 * API Token + Tab 切换三环境配置
 */
export declare const template = "\n<div id=\"pages-config-panel\" style=\"display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;\">\n    <!-- Header -->\n    <div style=\"padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;\">\n        <span style=\"font-weight: bold; color: #569cd6; font-size: 14px;\">\uD83D\uDCC4 \u914D\u7F6E Cloudflare Pages</span>\n    </div>\n\n    <!-- Form -->\n    <div style=\"flex: 1; overflow-y: auto; padding: 16px;\">\n        <!-- API Token -->\n        <div style=\"margin-bottom: 20px;\">\n            <label style=\"display: block; margin-bottom: 6px; color: #9cdcfe; font-size: 12px;\">API Token</label>\n            <input id=\"input-api-token\" type=\"password\" placeholder=\"\u8F93\u5165 Cloudflare API Token\" style=\"width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none;\">\n            <div id=\"token-help\" style=\"margin-top: 6px; font-size: 11px; color: #569cd6; cursor: pointer; opacity: 0.8;\">\u2139\uFE0F \u5982\u4F55\u83B7\u53D6 API Token\uFF1F</div>\n        </div>\n\n        <!-- Divider -->\n        <div style=\"height: 1px; background: #404040; margin-bottom: 16px;\"></div>\n\n        <!-- Env Tabs -->\n        <div style=\"margin-bottom: 12px;\">\n            <label style=\"display: block; margin-bottom: 8px; color: #9cdcfe; font-size: 12px;\">\u73AF\u5883\u914D\u7F6E</label>\n            <div id=\"env-tabs\" style=\"display: flex; gap: 0; border-radius: 6px; overflow: hidden; border: 1px solid #404040;\"></div>\n        </div>\n\n        <!-- Tab Content -->\n        <div id=\"tab-content\" style=\"background: #252525; border: 1px solid #404040; border-radius: 6px; padding: 14px;\"></div>\n\n        <div id=\"status-text\" style=\"min-height: 20px; font-size: 12px; color: #888; padding: 8px 0 0 0;\"></div>\n    </div>\n\n    <!-- Buttons -->\n    <div style=\"display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; background: #2d2d2d; border-top: 1px solid #404040;\">\n        <button id=\"btn-test\" style=\"background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 6px 14px; cursor: pointer; font-size: 12px;\">\u6D4B\u8BD5\u8FDE\u63A5</button>\n        <button id=\"btn-save\" style=\"background: #0e639c; color: #fff; border: none; border-radius: 4px; padding: 6px 16px; cursor: pointer; font-size: 12px;\">\u4FDD\u5B58</button>\n    </div>\n</div>\n";
export declare const style = "\n#pages-config-panel input:focus {\n    border-color: #0e639c !important;\n}\n#pages-config-panel button:hover:not(:disabled) {\n    opacity: 0.9;\n}\n.env-tab-btn {\n    flex: 1; padding: 7px 0; cursor: pointer; text-align: center; font-size: 12px;\n    background: #2d2d2d; color: #888; border: none; outline: none; transition: all 0.15s;\n}\n.env-tab-btn:not(:last-child) { border-right: 1px solid #404040; }\n.env-tab-btn.active { background: #0e639c; color: #fff; }\n.env-tab-btn:hover:not(.active) { background: #383838; color: #d4d4d4; }\n";
export declare const $: {
    'input-api-token': string;
    'token-help': string;
    'env-tabs': string;
    'tab-content': string;
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
