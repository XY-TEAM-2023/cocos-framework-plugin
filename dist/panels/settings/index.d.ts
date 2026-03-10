/**
 * 插件设置面板（合并 R2 + Pages 配置）
 *
 * 顶部两个 Tab 切换 R2 / Pages 配置区
 */
export declare const template = "\n<div id=\"settings-panel\" style=\"display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;\">\n    <!-- Auto Prompt Toggle -->\n    <div id=\"auto-prompt-bar\" style=\"display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #252525; border-bottom: 1px solid #404040;\">\n        <input type=\"checkbox\" id=\"r2-auto-prompt\" style=\"width: 15px; height: 15px; cursor: pointer; accent-color: #0e639c;\">\n        <label for=\"r2-auto-prompt\" style=\"cursor: pointer; font-size: 12px; color: #d4d4d4; user-select: none;\">\u6784\u5EFA\u540E\u81EA\u52A8\u8BE2\u95EE\u4E0A\u4F20\u5230 R2</label>\n    </div>\n\n    <!-- Section Tabs -->\n    <div id=\"section-tabs\" style=\"display: flex; background: #2d2d2d; border-bottom: 1px solid #404040;\"></div>\n\n    <!-- Content -->\n    <div id=\"section-content\" style=\"flex: 1; overflow-y: auto; padding: 16px;\"></div>\n\n    <!-- Status -->\n    <div id=\"status-bar\" style=\"min-height: 20px; font-size: 12px; color: #888; padding: 4px 16px;\"></div>\n\n    <!-- Buttons -->\n    <div id=\"btn-bar\" style=\"display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; background: #2d2d2d; border-top: 1px solid #404040;\"></div>\n</div>\n";
export declare const style = "\n#settings-panel input:focus { border-color: #0e639c !important; }\n#settings-panel button:hover:not(:disabled) { opacity: 0.9; }\n.section-tab {\n    flex: 1; padding: 10px 0; cursor: pointer; text-align: center; font-size: 13px; font-weight: 500;\n    background: #2d2d2d; color: #888; border: none; outline: none; transition: all 0.15s;\n    border-bottom: 2px solid transparent;\n}\n.section-tab:not(:last-child) { border-right: 1px solid #404040; }\n.section-tab.active { color: #569cd6; border-bottom-color: #569cd6; background: #1e1e1e; }\n.section-tab:hover:not(.active) { background: #383838; color: #d4d4d4; }\n.env-tab-btn {\n    flex: 1; padding: 7px 0; cursor: pointer; text-align: center; font-size: 12px;\n    background: #2d2d2d; color: #888; border: none; outline: none; transition: all 0.15s;\n}\n.env-tab-btn:not(:last-child) { border-right: 1px solid #404040; }\n.env-tab-btn.active { background: #0e639c; color: #fff; }\n.env-tab-btn:hover:not(.active) { background: #383838; color: #d4d4d4; }\n.settings-field { margin-bottom: 14px; }\n.settings-label { display: block; margin-bottom: 4px; color: #9cdcfe; font-size: 12px; }\n.settings-hint { margin-top: 3px; font-size: 11px; color: #666; }\n.settings-input {\n    width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4;\n    border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none;\n}\n.settings-btn {\n    background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 4px;\n    padding: 6px 14px; cursor: pointer; font-size: 12px;\n}\n.settings-btn-primary {\n    background: #0e639c; color: #fff; border: none; border-radius: 4px;\n    padding: 6px 16px; cursor: pointer; font-size: 12px;\n}\n.settings-btn-disabled {\n    background: #555; color: #888; border: none; border-radius: 4px;\n    padding: 6px 16px; cursor: not-allowed; font-size: 12px;\n}\n.settings-toggle {\n    display: flex; align-items: center; gap: 8px; padding: 10px 0; cursor: pointer; user-select: none;\n}\n.settings-toggle input[type=\"checkbox\"] {\n    width: 16px; height: 16px; cursor: pointer; accent-color: #0e639c;\n}\n.settings-toggle label {\n    cursor: pointer; font-size: 12px; color: #d4d4d4;\n}\n";
export declare const $: {
    'auto-prompt': string;
    'section-tabs': string;
    'section-content': string;
    'status-bar': string;
    'btn-bar': string;
};
export declare function ready(this: any): void;
export declare function close(): void;
export declare const methods: {
    /** 加载 R2 配置到表单 */
    loadR2Config(configStr: string): void;
    /** 设置 R2 状态（含连接验证结果） */
    setR2Status(dataStr: string): void;
    /** 加载 Pages 配置到表单 */
    loadPagesConfig(configStr: string): void;
    /** 设置 Pages 状态 */
    setPagesStatus(dataStr: string): void;
};
