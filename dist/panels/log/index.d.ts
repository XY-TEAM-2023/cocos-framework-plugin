/**
 * 框架管理 - 日志面板
 * 实时显示框架操作的执行日志，置顶显示
 */
export declare const template = "\n<div id=\"log-panel\" style=\"display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: 'Courier New', monospace; font-size: 12px;\">\n    <div style=\"display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #2d2d2d; border-bottom: 1px solid #404040;\">\n        <span style=\"font-weight: bold; color: #569cd6;\">\uD83D\uDCCB \u6846\u67B6\u7BA1\u7406 - \u8FD0\u884C\u65E5\u5FD7</span>\n        <button id=\"btn-clear\" style=\"background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 2px 10px; cursor: pointer; font-size: 11px;\">\u6E05\u7A7A</button>\n    </div>\n    <div id=\"log-container\" style=\"flex: 1; overflow-y: auto; padding: 8px 12px; line-height: 1.6;\"></div>\n</div>\n";
export declare const style = "\n#log-panel ::-webkit-scrollbar {\n    width: 8px;\n}\n#log-panel ::-webkit-scrollbar-track {\n    background: #1e1e1e;\n}\n#log-panel ::-webkit-scrollbar-thumb {\n    background: #555;\n    border-radius: 4px;\n}\n#log-panel ::-webkit-scrollbar-thumb:hover {\n    background: #777;\n}\n";
export declare const $: {
    'log-container': string;
    'btn-clear': string;
};
export declare function ready(this: any): void;
export declare function close(): void;
export declare const methods: {
    /**
     * 追加日志（由 main.ts 通过消息调用）
     */
    appendLog(dataStr: string): void;
};
