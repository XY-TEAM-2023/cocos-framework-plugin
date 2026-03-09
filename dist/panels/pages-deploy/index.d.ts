/**
 * Pages 部署面板
 *
 * 步骤一：选择版本 + 环境
 * 步骤二：输入部署说明（必填，多行）
 * 点击部署时弹出确认框
 */
export declare const template = "\n<div id=\"pages-deploy-panel\" style=\"display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;\">\n    <!-- Header -->\n    <div style=\"padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;\">\n        <span id=\"header-title\" style=\"font-weight: bold; color: #569cd6; font-size: 14px;\">\uD83D\uDE80 \u90E8\u7F72\u5230 Pages</span>\n    </div>\n\n    <!-- Step 1: Select version + env -->\n    <div id=\"step1\" style=\"flex: 1; overflow-y: auto; padding: 16px;\">\n        <div style=\"margin-bottom: 14px;\">\n            <label style=\"display: block; margin-bottom: 6px; color: #9cdcfe; font-size: 12px; font-weight: bold;\">\u9009\u62E9\u7248\u672C\uFF08R2\uFF09</label>\n            <div id=\"version-list\" style=\"max-height: 200px; overflow-y: auto; border-radius: 4px;\"></div>\n        </div>\n        <div style=\"margin-bottom: 14px;\">\n            <label style=\"display: block; margin-bottom: 6px; color: #9cdcfe; font-size: 12px; font-weight: bold;\">\u90E8\u7F72\u76EE\u6807</label>\n            <div id=\"env-list\"></div>\n        </div>\n        <div id=\"step1-status\" style=\"font-size: 12px; color: #888; min-height: 20px;\"></div>\n    </div>\n\n    <!-- Step 2: Commit message -->\n    <div id=\"step2\" style=\"flex: 1; overflow-y: auto; padding: 16px; display: none;\">\n        <div id=\"deploy-summary\" style=\"margin-bottom: 12px; padding: 10px; background: #2d2d2d; border-radius: 4px; font-size: 12px; border: 1px solid #404040;\"></div>\n        <div style=\"margin-bottom: 14px;\">\n            <label style=\"display: block; margin-bottom: 4px; color: #9cdcfe; font-size: 12px; font-weight: bold;\">\u90E8\u7F72\u8BF4\u660E\uFF08\u5FC5\u586B\uFF09</label>\n            <textarea id=\"input-commit-msg\" rows=\"5\" placeholder=\"\u8BF7\u8F93\u5165\u90E8\u7F72\u8BF4\u660E\uFF0C\u652F\u6301\u591A\u884C&#10;\u5982\uFF1A&#10;\u4FEE\u590D\u767B\u5F55 Bug&#10;\u4F18\u5316\u52A0\u8F7D\u901F\u5EA6\" style=\"width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none; resize: vertical; font-family: inherit;\"></textarea>\n        </div>\n        <div id=\"step2-status\" style=\"font-size: 12px; color: #888; min-height: 20px;\"></div>\n    </div>\n\n    <!-- Deploying status -->\n    <div id=\"deploying\" style=\"flex: 1; overflow-y: auto; padding: 16px; display: none;\">\n        <div style=\"text-align: center; padding: 40px 0;\">\n            <div id=\"deploy-icon\" style=\"font-size: 24px; margin-bottom: 12px;\">\u23F3</div>\n            <div id=\"deploy-msg\" style=\"color: #569cd6; font-size: 14px;\">\u6B63\u5728\u90E8\u7F72...</div>\n            <div id=\"deploy-log\" style=\"margin-top: 16px; text-align: left; font-size: 11px; color: #888; max-height: 200px; overflow-y: auto;\"></div>\n        </div>\n    </div>\n\n    <!-- Buttons -->\n    <div style=\"display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; background: #2d2d2d; border-top: 1px solid #404040;\">\n        <button id=\"btn-back\" style=\"background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 6px 14px; cursor: pointer; font-size: 12px; display: none;\">\u4E0A\u4E00\u6B65</button>\n        <button id=\"btn-next\" style=\"background: #0e639c; color: #fff; border: none; border-radius: 4px; padding: 6px 16px; cursor: pointer; font-size: 12px;\">\u4E0B\u4E00\u6B65</button>\n    </div>\n</div>\n";
export declare const style = "\n#pages-deploy-panel textarea:focus, #pages-deploy-panel input:focus {\n    border-color: #0e639c !important;\n}\n#pages-deploy-panel button:hover:not(:disabled) {\n    opacity: 0.9;\n}\n.sel-item { padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; border-radius: 4px; margin-bottom: 2px; border: 1px solid transparent; }\n.sel-item:hover { background: #2a2d2e; }\n.sel-item.selected { border-color: #0e639c; background: #0e639c1a; }\n.sel-item .sel-icon { font-size: 13px; width: 20px; text-align: center; }\n.env-item { padding: 8px 12px; cursor: pointer; border-radius: 4px; margin-bottom: 2px; display: flex; align-items: center; gap: 8px; border: 1px solid transparent; }\n.env-item:hover:not(.disabled) { background: #2a2d2e; }\n.env-item.selected { border-color: #0e639c; background: #0e639c1a; }\n.env-item.disabled { opacity: 0.4; cursor: not-allowed; }\n.env-item .sel-icon { font-size: 13px; width: 20px; text-align: center; }\n";
export declare const $: {
    'header-title': string;
    step1: string;
    step2: string;
    deploying: string;
    'deploy-icon': string;
    'deploy-msg': string;
    'version-list': string;
    'env-list': string;
    'input-commit-msg': string;
    'deploy-summary': string;
    'deploy-log': string;
    'step1-status': string;
    'step2-status': string;
    'btn-back': string;
    'btn-next': string;
};
export declare function ready(this: any): void;
export declare function close(): void;
export declare const methods: {
    /** 设置版本列表和环境数据 */
    setDeployData(dataStr: string): void;
    /** 追加部署日志 */
    appendDeployLog(logStr: string): void;
    /** 部署完成 */
    setDeployComplete(resultStr: string): void;
};
