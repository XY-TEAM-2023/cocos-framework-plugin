/**
 * I18nSprite 自定义 Inspector 面板
 *
 * 提供两种模式 UI：
 * - 约定路径：填 basePath / bundleName，运行时按 ${basePath}_{lang}/spriteFrame 加载
 * - 手动绑定：每行一个语言下拉框 + SpriteFrame 选择控件（cocos 默认控件）
 *
 * 架构（与 i18n-label / i18n-editbox 一致）：
 * - 模块级共享只读：i18n 数据快照（仅 languages + primaryLang），由 main.ts 推送
 * - 实例级独立状态：每个 inspector 实例的状态挂在 `panelThis._inst`
 * - SpriteFrame 字段通过 <ui-prop type="dump" no-label>.render(dump) 复用 cocos 默认渲染
 */
export declare const template = "\n<div class=\"i18n-sprite-inspector\">\n    <ui-prop>\n        <ui-label slot=\"label\" tooltip=\"\u7EA6\u5B9A\u8DEF\u5F84\u6A21\u5F0F\uFF1AbasePath_{lang}/spriteFrame \u81EA\u52A8\u52A0\u8F7D\uFF1B\u975E\u7A7A\u65F6\u4F18\u5148\u4E8E\u4E0B\u65B9 Entries\">\u57FA\u7840\u8DEF\u5F84</ui-label>\n        <div slot=\"content\">\n            <input id=\"base-path\" type=\"text\" placeholder='\u7559\u7A7A\u4F7F\u7528\u4E0B\u65B9\u624B\u52A8\u7ED1\u5B9A' />\n        </div>\n    </ui-prop>\n    <ui-prop>\n        <ui-label slot=\"label\" tooltip=\"\u7EA6\u5B9A\u8DEF\u5F84\u6A21\u5F0F\u4E0B\u52A0\u8F7D\u8D44\u6E90\u6240\u5728 Bundle\uFF0C\u7559\u7A7A\u4F7F\u7528 resources\">Bundle</ui-label>\n        <div slot=\"content\">\n            <input id=\"bundle-name\" type=\"text\" placeholder=\"\u7559\u7A7A\u4F7F\u7528 resources\" />\n        </div>\n    </ui-prop>\n    <div id=\"path-hint\" class=\"path-hint\" hidden>\n        <span class=\"hint-icon\">\uD83D\uDCA1</span>\n        <span>\u8FD0\u884C\u65F6\u81EA\u52A8\u52A0\u8F7D <code id=\"path-example\">basePath_{lang}/spriteFrame</code></span>\n    </div>\n    <div id=\"entries-section\" class=\"entries-section\"></div>\n</div>\n";
export declare const style = "\n.i18n-sprite-inspector { padding: 4px 0; }\n.i18n-sprite-inspector input[type=\"text\"] {\n    width: 100%; box-sizing: border-box;\n    background: #232323; border: 1px solid #444; color: #ccc;\n    border-radius: 4px; padding: 4px 8px; font-size: 12px; outline: none;\n}\n.i18n-sprite-inspector input[type=\"text\"]:focus { border-color: #007ACC; }\n.path-hint {\n    display: flex; align-items: center; gap: 6px;\n    padding: 6px 10px; margin: 6px 0;\n    background: #1a2a1a; border-radius: 4px;\n    font-size: 11px; color: #6a6;\n}\n.path-hint code {\n    background: #232323; padding: 1px 4px; border-radius: 3px;\n    font-family: 'SF Mono', Menlo, monospace; color: #4ec9b0;\n}\n.hint-icon { font-size: 13px; }\n.entries-section { margin-top: 4px; }\n.entries-header {\n    display: flex; align-items: center; justify-content: space-between;\n    padding: 6px 0 4px;\n}\n.entries-title {\n    font-size: 11px; color: #888; font-weight: 600;\n    text-transform: uppercase; letter-spacing: 0.5px;\n}\n.entries-add-btn {\n    background: none; border: 1px solid #444; color: #888;\n    border-radius: 3px; padding: 2px 8px; font-size: 10px; cursor: pointer;\n}\n.entries-add-btn:hover { background: #333; color: #ccc; }\n.entries-list {}\n.entry-row {\n    display: flex; align-items: center; gap: 6px;\n    padding: 4px 0;\n}\n.entry-row + .entry-row { border-top: 1px solid #1e1e1e; }\n.entry-lang-select {\n    flex-shrink: 0; min-width: 84px; height: 24px;\n    background: #232323; border: 1px solid #444; color: #ccc;\n    border-radius: 3px; padding: 0 6px; font-size: 12px; outline: none;\n    font-family: 'SF Mono', Menlo, monospace;\n}\n.entry-lang-select:focus { border-color: #007ACC; }\n.entry-sprite-wrap {\n    flex: 1; min-width: 0;\n}\n.entry-sprite-wrap ui-prop { display: block; }\n.entry-delete-btn {\n    flex-shrink: 0; background: none; border: none; color: #444;\n    cursor: pointer; font-size: 12px; padding: 0 4px;\n    transition: color 0.15s;\n}\n.entry-delete-btn:hover { color: #e44; }\n.entries-empty {\n    padding: 8px; text-align: center; font-size: 11px;\n    color: #4a4a4a; font-style: italic;\n    background: #1a1a1a; border-radius: 3px;\n}\n.entries-disabled-warn {\n    padding: 4px 8px; margin: 4px 0;\n    background: #2a2418; border-radius: 4px;\n    font-size: 11px; color: #c89042;\n}\n";
export declare const $: {
    'base-path': string;
    'bundle-name': string;
    'path-hint': string;
    'path-example': string;
    'entries-section': string;
};
export declare function ready(this: any): void;
export declare function update(this: any, dump: any): void;
export declare function close(this: any): void;
