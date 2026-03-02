/**
 * 框架管理 - 日志面板
 * 实时显示框架操作的执行日志，置顶显示
 * 支持提交信息输入
 */
export declare const template = "\n<div id=\"log-panel\" style=\"display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: 'Courier New', monospace; font-size: 12px;\">\n    <div style=\"display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #2d2d2d; border-bottom: 1px solid #404040;\">\n        <span style=\"font-weight: bold; color: #569cd6;\">\uD83D\uDCCB \u6846\u67B6\u7BA1\u7406 - \u8FD0\u884C\u65E5\u5FD7</span>\n        <button id=\"btn-copy\" style=\"background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 2px 10px; cursor: pointer; font-size: 11px;\">\u590D\u5236</button>\n    </div>\n    <div id=\"log-container\" style=\"flex: 1; overflow-y: auto; padding: 8px 12px; line-height: 1.6;\"></div>\n    <div id=\"commit-input-area\" style=\"display: none; padding: 8px 12px; background: #2d2d2d; border-top: 1px solid #404040;\">\n        <div style=\"margin-bottom: 6px; color: #569cd6; font-weight: bold;\">\uD83D\uDCDD \u63D0\u4EA4\u4FE1\u606F\uFF1A</div>\n        <div style=\"display: flex; gap: 8px;\">\n            <input id=\"commit-input\" type=\"text\" placeholder=\"\u8BF7\u8F93\u5165\u63D0\u4EA4\u4FE1\u606F...\" style=\"flex: 1; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 6px 10px; font-size: 12px; outline: none; font-family: 'Courier New', monospace;\" />\n            <button id=\"btn-commit\" style=\"background: #0e639c; color: #fff; border: none; border-radius: 3px; padding: 6px 16px; cursor: pointer; font-size: 12px; white-space: nowrap;\">\u63A8\u9001</button>\n            <button id=\"btn-cancel\" style=\"background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 6px 12px; cursor: pointer; font-size: 12px; white-space: nowrap;\">\u53D6\u6D88</button>\n        </div>\n    </div>\n</div>\n";
export declare const style = "\n#log-panel ::-webkit-scrollbar {\n    width: 8px;\n}\n#log-panel ::-webkit-scrollbar-track {\n    background: #1e1e1e;\n}\n#log-panel ::-webkit-scrollbar-thumb {\n    background: #555;\n    border-radius: 4px;\n}\n#log-panel ::-webkit-scrollbar-thumb:hover {\n    background: #777;\n}\n#commit-input:focus {\n    border-color: #0e639c !important;\n}\n";
export declare const $: {
    'log-container': string;
    'btn-copy': string;
    'commit-input-area': string;
    'commit-input': string;
    'btn-commit': string;
    'btn-cancel': string;
};
export declare function ready(this: any): void;
export declare function close(): void;
export declare const methods: {
    /**
     * 追加日志
     */
    appendLog(dataStr: string): void;
    /**
     * 显示提交信息输入框
     */
    showCommitInput(target: string): void;
    /**
     * 显示 hash 输入框（切换版本用）
     */
    showHashInput(): void;
};
