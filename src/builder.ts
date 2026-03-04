/**
 * Build Plugin 入口配置
 * 为所有平台注册构建钩子
 */
export const configs: Record<string, { hooks: string }> = {
    '*': {
        hooks: './hooks',
    },
};
