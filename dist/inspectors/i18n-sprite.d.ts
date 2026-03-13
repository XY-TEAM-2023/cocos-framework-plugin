/**
 * I18nSprite 自定义 Inspector 面板
 *
 * 功能：
 * - basePath 输入框：设置基础资源路径
 * - bundleName 输入框：指定 Bundle
 * - 资源预览列表：自动列出所有语言和对应资源路径
 */
export declare const template = "\n<div class=\"i18n-sprite-inspector\">\n    <!-- \u57FA\u7840\u8DEF\u5F84 -->\n    <ui-prop>\n        <ui-label slot=\"label\" tooltip=\"\u57FA\u7840\u8DEF\u5F84\uFF0C\u8FD0\u884C\u65F6\u81EA\u52A8\u62FC\u63A5 basePath_{lang} \u52A0\u8F7D SpriteFrame\">\u57FA\u7840\u8DEF\u5F84</ui-label>\n        <div slot=\"content\">\n            <input id=\"base-path\" type=\"text\" placeholder='\u5982 \"textures/i18n/logo\"' />\n        </div>\n    </ui-prop>\n\n    <!-- Bundle \u540D\u79F0 -->\n    <ui-prop>\n        <ui-label slot=\"label\" tooltip=\"SpriteFrame \u6240\u5728 Bundle \u540D\u79F0\uFF0C\u7559\u7A7A\u4F7F\u7528 resources\">Bundle</ui-label>\n        <div slot=\"content\">\n            <input id=\"bundle-name\" type=\"text\" placeholder=\"\u7559\u7A7A\u4F7F\u7528 resources\" />\n        </div>\n    </ui-prop>\n\n    <!-- \u4F7F\u7528\u8BF4\u660E -->\n    <div id=\"hint-bar\" class=\"hint-bar\">\n        <span class=\"hint-icon\">\uD83D\uDCA1</span>\n        <span>\u8FD0\u884C\u65F6\u81EA\u52A8\u52A0\u8F7D <code id=\"path-example\">basePath_{lang}/spriteFrame</code></span>\n    </div>\n\n    <!-- \u8D44\u6E90\u9884\u89C8\u5217\u8868 -->\n    <div id=\"lang-preview\" class=\"lang-preview\"></div>\n</div>\n";
export declare const style = "\n.i18n-sprite-inspector { padding: 4px 0; }\n.i18n-sprite-inspector input {\n    width: 100%; box-sizing: border-box;\n    background: #232323; border: 1px solid #444; color: #ccc;\n    border-radius: 4px; padding: 4px 8px; font-size: 12px; outline: none;\n}\n.i18n-sprite-inspector input:focus { border-color: #007ACC; }\n\n.hint-bar {\n    display: flex; align-items: center; gap: 6px;\n    padding: 6px 12px; margin: 4px 0;\n    background: #1a2a1a; border-radius: 4px;\n    font-size: 11px; color: #6a6;\n}\n.hint-bar code {\n    background: #232323; padding: 1px 4px; border-radius: 3px;\n    font-family: 'SF Mono', Menlo, monospace; color: #4ec9b0;\n}\n.hint-icon { font-size: 13px; }\n\n.lang-preview { padding: 4px 0; }\n.lang-preview-title {\n    font-size: 11px; color: #888; padding: 6px 12px 4px;\n    font-weight: 600; text-transform: uppercase;\n}\n.lang-row {\n    display: flex; align-items: center; gap: 8px;\n    padding: 4px 12px; font-size: 12px;\n}\n.lang-code { color: #d4d4d4; font-weight: 600; min-width: 30px; }\n.lang-path { color: #666; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'SF Mono', Menlo, monospace; font-size: 11px; }\n.lang-status { font-size: 11px; flex-shrink: 0; }\n.lang-status.exists { color: #4c4; }\n.lang-status.missing { color: #a66; }\n";
export declare const $: {
    'base-path': string;
    'bundle-name': string;
    'path-example': string;
    'lang-preview': string;
};
export declare function update(this: any, dump: any): void;
export declare function ready(this: any): void;
