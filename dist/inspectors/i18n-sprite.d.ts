/**
 * I18nSprite 自定义 Inspector 面板
 *
 * 架构（与 i18n-label 保持一致）：
 * - 模块级共享只读：i18n 数据快照（snapshot），由 main.ts 推送变更
 * - 实例级独立状态：每个 inspector 实例的状态挂在 `panelThis._inst`
 * - update() 完全同步
 */
export declare const template = "\n<div class=\"i18n-sprite-inspector\">\n    <ui-prop>\n        <ui-label slot=\"label\" tooltip=\"\u57FA\u7840\u8DEF\u5F84\uFF0C\u8FD0\u884C\u65F6\u81EA\u52A8\u62FC\u63A5 basePath_{lang} \u52A0\u8F7D SpriteFrame\">\u57FA\u7840\u8DEF\u5F84</ui-label>\n        <div slot=\"content\">\n            <input id=\"base-path\" type=\"text\" placeholder='\u5982 \"textures/i18n/logo\"' />\n        </div>\n    </ui-prop>\n    <ui-prop>\n        <ui-label slot=\"label\" tooltip=\"SpriteFrame \u6240\u5728 Bundle \u540D\u79F0\uFF0C\u7559\u7A7A\u4F7F\u7528 resources\">Bundle</ui-label>\n        <div slot=\"content\">\n            <input id=\"bundle-name\" type=\"text\" placeholder=\"\u7559\u7A7A\u4F7F\u7528 resources\" />\n        </div>\n    </ui-prop>\n    <div id=\"hint-bar\" class=\"hint-bar\">\n        <span class=\"hint-icon\">\uD83D\uDCA1</span>\n        <span>\u8FD0\u884C\u65F6\u81EA\u52A8\u52A0\u8F7D <code id=\"path-example\">basePath_{lang}/spriteFrame</code></span>\n    </div>\n    <div id=\"lang-preview\" class=\"lang-preview\"></div>\n</div>\n";
export declare const style = "\n.i18n-sprite-inspector { padding: 4px 0; }\n.i18n-sprite-inspector input {\n    width: 100%; box-sizing: border-box;\n    background: #232323; border: 1px solid #444; color: #ccc;\n    border-radius: 4px; padding: 4px 8px; font-size: 12px; outline: none;\n}\n.i18n-sprite-inspector input:focus { border-color: #007ACC; }\n.hint-bar {\n    display: flex; align-items: center; gap: 6px;\n    padding: 6px 12px; margin: 4px 0;\n    background: #1a2a1a; border-radius: 4px;\n    font-size: 11px; color: #6a6;\n}\n.hint-bar code {\n    background: #232323; padding: 1px 4px; border-radius: 3px;\n    font-family: 'SF Mono', Menlo, monospace; color: #4ec9b0;\n}\n.hint-icon { font-size: 13px; }\n.lang-preview { padding: 4px 0; }\n.lang-preview-title {\n    font-size: 11px; color: #888; padding: 6px 12px 4px;\n    font-weight: 600; text-transform: uppercase;\n}\n.lang-row {\n    display: flex; align-items: center; gap: 8px;\n    padding: 4px 12px; font-size: 12px;\n}\n.lang-code { color: #d4d4d4; font-weight: 600; min-width: 30px; }\n.lang-path { color: #666; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'SF Mono', Menlo, monospace; font-size: 11px; }\n.lang-status { font-size: 11px; flex-shrink: 0; }\n.lang-status.exists { color: #4c4; }\n.lang-status.missing { color: #a66; }\n";
export declare const $: {
    'base-path': string;
    'bundle-name': string;
    'path-example': string;
    'lang-preview': string;
};
export declare function ready(this: any): void;
export declare function update(this: any, dump: any): void;
export declare function close(this: any): void;
