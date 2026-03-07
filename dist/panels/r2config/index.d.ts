/**
 * R2 配置面板
 *
 * 提供 4 个输入框 + 提示文本 + 测试连接按钮 + 保存按钮
 * 只有测试连接成功后才能保存
 */
export declare const template = "\n<div id=\"r2-config-panel\" style=\"display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;\">\n    <!-- Header -->\n    <div style=\"padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;\">\n        <span style=\"font-weight: bold; color: #569cd6; font-size: 14px;\">\u2601\uFE0F \u914D\u7F6E R2</span>\n    </div>\n\n    <!-- Form -->\n    <div style=\"flex: 1; overflow-y: auto; padding: 16px;\">\n        <div style=\"margin-bottom: 14px;\">\n            <label style=\"display: block; margin-bottom: 4px; color: #9cdcfe; font-size: 12px;\">Cloudflare Account ID</label>\n            <input id=\"input-account-id\" type=\"text\" placeholder=\"\u8F93\u5165 Account ID\" style=\"width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none;\">\n            <div style=\"margin-top: 3px; font-size: 11px; color: #666;\">Cloudflare \u63A7\u5236\u53F0\u9996\u9875 \u2192 \u53F3\u4FA7\u680F\u300CAccount ID\u300D</div>\n        </div>\n\n        <div style=\"margin-bottom: 14px;\">\n            <label style=\"display: block; margin-bottom: 4px; color: #9cdcfe; font-size: 12px;\">Access Key ID</label>\n            <input id=\"input-access-key-id\" type=\"text\" placeholder=\"\u8F93\u5165 Access Key ID\" style=\"width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none;\">\n            <div style=\"margin-top: 3px; font-size: 11px; color: #666;\">\u521B\u5EFA API \u4EE4\u724C\u540E\u9875\u9762\u300C\u4E3A S3 \u5BA2\u6237\u7AEF\u4F7F\u7528\u4EE5\u4E0B\u51ED\u636E\u300D\u2192\u300C\u8BBF\u95EE\u5BC6\u94A5 ID\u300D</div>\n        </div>\n\n        <div style=\"margin-bottom: 14px;\">\n            <label style=\"display: block; margin-bottom: 4px; color: #9cdcfe; font-size: 12px;\">Secret Access Key</label>\n            <input id=\"input-secret-access-key\" type=\"password\" placeholder=\"\u8F93\u5165 Secret Access Key\" style=\"width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none;\">\n            <div style=\"margin-top: 3px; font-size: 11px; color: #666;\">\u540C\u4E0A\u9875\u9762\u300C\u4E3A S3 \u5BA2\u6237\u7AEF\u4F7F\u7528\u4EE5\u4E0B\u51ED\u636E\u300D\u2192\u300C\u673A\u5BC6\u8BBF\u95EE\u5BC6\u94A5\u300D\uFF0C\u4EC5\u663E\u793A\u4E00\u6B21</div>\n        </div>\n\n        <div style=\"margin-bottom: 14px;\">\n            <label style=\"display: block; margin-bottom: 4px; color: #9cdcfe; font-size: 12px;\">Bucket \u540D\u79F0</label>\n            <input id=\"input-bucket-name\" type=\"text\" placeholder=\"\u8F93\u5165 Bucket Name\" style=\"width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none;\">\n            <div style=\"margin-top: 3px; font-size: 11px; color: #666;\">R2 \u2192 \u6982\u8FF0 \u2192 \u9009\u62E9\u5DF2\u521B\u5EFA\u7684\u5B58\u50A8\u6876\u540D\u79F0</div>\n        </div>\n\n        <div id=\"status-text\" style=\"min-height: 20px; font-size: 12px; color: #888; padding: 4px 0;\"></div>\n    </div>\n\n    <!-- Buttons -->\n    <div style=\"display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; background: #2d2d2d; border-top: 1px solid #404040;\">\n        <button id=\"btn-test\" style=\"background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 6px 14px; cursor: pointer; font-size: 12px;\">\u6D4B\u8BD5\u8FDE\u63A5</button>\n        <button id=\"btn-save\" style=\"background: #555; color: #888; border: none; border-radius: 4px; padding: 6px 16px; cursor: not-allowed; font-size: 12px;\" disabled>\u4FDD\u5B58</button>\n    </div>\n</div>\n";
export declare const style = "\n#r2-config-panel input:focus {\n    border-color: #0e639c !important;\n}\n#r2-config-panel button:hover:not(:disabled) {\n    opacity: 0.9;\n}\n";
export declare const $: {
    'input-account-id': string;
    'input-access-key-id': string;
    'input-secret-access-key': string;
    'input-bucket-name': string;
    'btn-test': string;
    'btn-save': string;
    'status-text': string;
};
export declare function ready(this: any): void;
export declare function close(): void;
export declare const methods: {
    /**
     * 填充现有配置
     */
    loadConfig(configStr: string): void;
    /**
     * 设置状态文字（含连接验证结果）
     */
    setStatus(dataStr: string): void;
};
