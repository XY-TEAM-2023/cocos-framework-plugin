/**
 * Pages 清理版本面板
 *
 * 先选环境 → 显示部署列表（多选框）→ 锁定项不可选 → 确认清理
 */
export declare const template = "\n<div id=\"pages-cleanup-panel\" style=\"display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;\">\n    <!-- Header -->\n    <div style=\"padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;\">\n        <span style=\"font-weight: bold; color: #569cd6; font-size: 14px;\">\uD83E\uDDF9 \u6E05\u7406\u7248\u672C</span>\n    </div>\n\n    <!-- Env selector -->\n    <div id=\"env-selector\" style=\"padding: 10px 16px; background: #252525; border-bottom: 1px solid #404040; display: flex; gap: 6px;\"></div>\n\n    <!-- Loading -->\n    <div id=\"loading\" style=\"flex: 1; display: flex; align-items: center; justify-content: center; color: #888;\">\u52A0\u8F7D\u4E2D...</div>\n\n    <!-- Deployment list with checkboxes -->\n    <div id=\"deployment-list\" style=\"flex: 1; overflow-y: auto; padding: 8px 16px; display: none;\"></div>\n\n    <!-- Bottom bar -->\n    <div style=\"display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #2d2d2d; border-top: 1px solid #404040;\">\n        <span id=\"selected-count\" style=\"font-size: 12px; color: #888;\">\u5DF2\u9009\u62E9 0 \u4E2A\u7248\u672C</span>\n        <button id=\"btn-cleanup\" style=\"background: #c53030; color: #fff; border: none; border-radius: 4px; padding: 6px 14px; cursor: not-allowed; font-size: 12px; opacity: 0.5;\" disabled>\u6E05\u7406\u9009\u4E2D\u7248\u672C</button>\n    </div>\n</div>\n";
export declare const style = "\n#pages-cleanup-panel button:hover:not(:disabled) { opacity: 0.9; }\n.env-tab { padding: 4px 12px; border-radius: 4px; cursor: pointer; border: 1px solid #555; background: #3c3c3c; color: #d4d4d4; font-size: 12px; }\n.env-tab.active { background: #0e639c; border-color: #0e639c; color: #fff; }\n.env-tab.disabled { opacity: 0.4; cursor: not-allowed; }\n.cleanup-item { padding: 8px 12px; border-bottom: 1px solid #333; display: flex; align-items: center; gap: 8px; }\n.cleanup-item:last-child { border-bottom: none; }\n.cleanup-item.locked { opacity: 0.5; }\n";
export declare const $: {
    'env-selector': string;
    loading: string;
    'deployment-list': string;
    'selected-count': string;
    'btn-cleanup': string;
};
export declare function ready(this: any): void;
export declare function close(): void;
export declare const methods: {
    /** 设置环境标签页和部署数据 */
    setCleanupData(dataStr: string): void;
    /** 更新清理进度 */
    setCleanupProgress(dataStr: string): void;
    /** 清理完成 */
    setCleanupComplete(resultStr: string): void;
};
