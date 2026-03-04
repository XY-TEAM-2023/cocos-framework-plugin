/**
 * Build Plugin 入口配置
 * 为所有平台注册构建钩子
 */

export function load() {
    console.log('[framework-plugin builder] loaded');
}

export function unload() {
    console.log('[framework-plugin builder] unloaded');
}

export const configs: Record<string, { hooks: string }> = {
    '*': {
        hooks: './hooks',
    },
};
