/**
 * Pages 版本切换面板
 *
 * 先选环境 → 显示该环境的部署列表 → 点击回滚
 */
export declare const template = "\n<div id=\"pages-versions-panel\" style=\"display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;\">\n    <!-- Header -->\n    <div style=\"padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;\">\n        <span style=\"font-weight: bold; color: #569cd6; font-size: 14px;\">\uD83D\uDD04 \u5207\u6362\u7248\u672C</span>\n    </div>\n\n    <!-- Env selector -->\n    <div id=\"env-selector\" style=\"padding: 10px 16px; background: #252525; border-bottom: 1px solid #404040; display: flex; gap: 6px;\"></div>\n\n    <!-- Loading -->\n    <div id=\"loading\" style=\"flex: 1; display: flex; align-items: center; justify-content: center; color: #888;\">\u52A0\u8F7D\u4E2D...</div>\n\n    <!-- Deployment list -->\n    <div id=\"deployment-list\" style=\"flex: 1; overflow-y: auto; padding: 8px 16px; display: none;\"></div>\n\n    <!-- Status bar -->\n    <div id=\"status-bar\" style=\"padding: 8px 16px; background: #2d2d2d; border-top: 1px solid #404040; font-size: 12px; color: #888; min-height: 20px;\"></div>\n</div>\n";
export declare const style = "\n#pages-versions-panel button:hover:not(:disabled) { opacity: 0.9; }\n.env-tab { padding: 4px 12px; border-radius: 4px; cursor: pointer; border: 1px solid #555; background: #3c3c3c; color: #d4d4d4; font-size: 12px; }\n.env-tab.active { background: #0e639c; border-color: #0e639c; color: #fff; }\n.env-tab.disabled { opacity: 0.4; cursor: not-allowed; }\n.deploy-item { padding: 10px 12px; border-bottom: 1px solid #333; }\n.deploy-item:last-child { border-bottom: none; }\n";
export declare const $: {
    'env-selector': string;
    loading: string;
    'deployment-list': string;
    'status-bar': string;
};
export declare function ready(this: any): void;
export declare function close(): void;
export declare const methods: {
    /** 设置环境标签页和部署数据 */
    setVersionsData(dataStr: string): void;
    /** 更新状态栏 */
    setStatus(dataStr: string): void;
    /** 刷新部署列表 */
    refreshDeployments(deploymentsStr: string): void;
};
