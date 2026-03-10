/**
 * Pages version switch panel
 *
 * Select env -> show deployment table -> rollback
 * Supports paginated loading
 */
export declare const template = "\n<div id=\"pages-versions-panel\" style=\"display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;\">\n    <!-- Header -->\n    <div style=\"padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040; display: flex; align-items: center; justify-content: space-between;\">\n        <span style=\"font-weight: bold; color: #569cd6; font-size: 14px;\">&#x1F504; \u5207\u6362\u7248\u672C</span>\n        <div id=\"status-text\" style=\"font-size: 12px; color: #888;\"></div>\n    </div>\n\n    <!-- Env selector -->\n    <div id=\"env-selector\" style=\"padding: 10px 16px; background: #252525; border-bottom: 1px solid #404040; display: flex; gap: 6px;\"></div>\n\n    <!-- Main Content -->\n    <div style=\"flex: 1; overflow-y: auto; padding: 0;\">\n        <table id=\"deployment-table\" style=\"width: 100%; border-collapse: collapse; display: none;\">\n            <thead>\n                <tr style=\"background: #252525; position: sticky; top: 0; z-index: 1;\">\n                    <th style=\"padding: 10px 12px; text-align: left; border-bottom: 1px solid #404040; color: #888; width: 40px;\">\u72B6\u6001</th>\n                    <th style=\"padding: 10px 12px; text-align: left; border-bottom: 1px solid #404040; color: #888;\">\u7248\u672C\u8BF4\u660E / URL</th>\n                    <th style=\"padding: 10px 12px; text-align: left; border-bottom: 1px solid #404040; color: #888; width: 140px;\">\u90E8\u7F72\u65F6\u95F4</th>\n                    <th style=\"padding: 10px 12px; text-align: center; border-bottom: 1px solid #404040; color: #888; width: 100px;\">\u64CD\u4F5C</th>\n                </tr>\n            </thead>\n            <tbody id=\"deployment-list\"></tbody>\n        </table>\n\n        <!-- Loading / Empty -->\n        <div id=\"loading\" style=\"display: flex; align-items: center; justify-content: center; padding: 40px; color: #888;\">\u52A0\u8F7D\u4E2D...</div>\n        <div id=\"empty-hint\" style=\"display: none; text-align: center; padding: 40px; color: #666;\">\u8BE5\u73AF\u5883\u6682\u65E0\u90E8\u7F72</div>\n\n        <!-- Load More -->\n        <div id=\"load-more-container\" style=\"padding: 12px; text-align: center; display: none;\">\n            <button id=\"btn-load-more\" style=\"background: transparent; color: #569cd6; border: 1px solid #569cd6; border-radius: 4px; padding: 6px 20px; cursor: pointer; font-size: 12px;\">\u52A0\u8F7D\u66F4\u591A...</button>\n        </div>\n        <div id=\"no-more-hint\" style=\"display: none; text-align: center; padding: 12px; color: #555; font-size: 12px;\">\u2014 \u6CA1\u6709\u66F4\u591A\u4E86 \u2014</div>\n    </div>\n\n    <!-- Status bar -->\n    <div id=\"status-bar\" style=\"padding: 8px 16px; background: #2d2d2d; border-top: 1px solid #404040; font-size: 12px; color: #888; min-height: 20px;\"></div>\n</div>\n";
export declare const style = "\n#pages-versions-panel button:hover:not(:disabled) { opacity: 0.8; }\n#pages-versions-panel button:active:not(:disabled) { opacity: 0.6; }\n.env-tab { padding: 4px 12px; border-radius: 4px; cursor: pointer; border: 1px solid #555; background: #3c3c3c; color: #d4d4d4; font-size: 12px; transition: all 0.2s; }\n.env-tab.active { background: #0e639c; border-color: #0e639c; color: #fff; }\n.env-tab.disabled { opacity: 0.4; cursor: not-allowed; }\n.deploy-row { cursor: pointer; transition: background 0.15s; }\n.deploy-row:hover { background: rgba(255, 255, 255, 0.05); }\n.deploy-row.selected { background: rgba(14, 99, 156, 0.25); border-left: 2px solid #569cd6; }\n.deploy-row td { padding: 10px 12px; border-bottom: 1px solid #333; vertical-align: middle; }\n.btn-rollback { background: #0e639c; color: #fff; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 11px; white-space: nowrap; }\n";
export declare const $: {
    'env-selector': string;
    loading: string;
    'deployment-table': string;
    'deployment-list': string;
    'empty-hint': string;
    'load-more-container': string;
    'no-more-hint': string;
    'btn-load-more': string;
    'status-bar': string;
    'status-text': string;
};
export declare function ready(this: any): void;
export declare function close(): void;
export declare const methods: {
    setVersionsData(dataStr: string): void;
    setStatus(dataStr: string): void;
};
