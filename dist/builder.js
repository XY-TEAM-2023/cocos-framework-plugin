"use strict";
/**
 * Build Plugin 入口配置
 * 为所有平台注册构建钩子
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.configs = exports.unload = exports.load = void 0;
function load() {
    console.log('[framework-plugin builder] loaded');
}
exports.load = load;
function unload() {
    console.log('[framework-plugin builder] unloaded');
}
exports.unload = unload;
exports.configs = {
    '*': {
        hooks: './hooks',
    },
};
//# sourceMappingURL=builder.js.map