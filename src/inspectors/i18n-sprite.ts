/**
 * I18nSprite 自定义 Inspector 面板
 *
 * 功能：
 * - basePath 输入框：设置基础资源路径
 * - bundleName 输入框：指定 Bundle
 * - 资源预览列表：自动列出所有语言和对应资源路径
 */

'use strict';

/** 当前 dump 数据 */
let currentDump: any = null;

/** 面板引用 */
let panelThis: any = null;

/** 语言列表 */
let langList: string[] = [];

export const template = `
<div class="i18n-sprite-inspector">
    <!-- 基础路径 -->
    <ui-prop>
        <ui-label slot="label" tooltip="基础路径，运行时自动拼接 basePath_{lang} 加载 SpriteFrame">基础路径</ui-label>
        <div slot="content">
            <input id="base-path" type="text" placeholder='如 "textures/i18n/logo"' />
        </div>
    </ui-prop>

    <!-- Bundle 名称 -->
    <ui-prop>
        <ui-label slot="label" tooltip="SpriteFrame 所在 Bundle 名称，留空使用 resources">Bundle</ui-label>
        <div slot="content">
            <input id="bundle-name" type="text" placeholder="留空使用 resources" />
        </div>
    </ui-prop>

    <!-- 使用说明 -->
    <div id="hint-bar" class="hint-bar">
        <span class="hint-icon">💡</span>
        <span>运行时自动加载 <code id="path-example">basePath_{lang}/spriteFrame</code></span>
    </div>

    <!-- 资源预览列表 -->
    <div id="lang-preview" class="lang-preview"></div>
</div>
`;

export const style = `
.i18n-sprite-inspector { padding: 4px 0; }
.i18n-sprite-inspector input {
    width: 100%; box-sizing: border-box;
    background: #232323; border: 1px solid #444; color: #ccc;
    border-radius: 4px; padding: 4px 8px; font-size: 12px; outline: none;
}
.i18n-sprite-inspector input:focus { border-color: #007ACC; }

.hint-bar {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 12px; margin: 4px 0;
    background: #1a2a1a; border-radius: 4px;
    font-size: 11px; color: #6a6;
}
.hint-bar code {
    background: #232323; padding: 1px 4px; border-radius: 3px;
    font-family: 'SF Mono', Menlo, monospace; color: #4ec9b0;
}
.hint-icon { font-size: 13px; }

.lang-preview { padding: 4px 0; }
.lang-preview-title {
    font-size: 11px; color: #888; padding: 6px 12px 4px;
    font-weight: 600; text-transform: uppercase;
}
.lang-row {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 12px; font-size: 12px;
}
.lang-code { color: #d4d4d4; font-weight: 600; min-width: 30px; }
.lang-path { color: #666; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'SF Mono', Menlo, monospace; font-size: 11px; }
.lang-status { font-size: 11px; flex-shrink: 0; }
.lang-status.exists { color: #4c4; }
.lang-status.missing { color: #a66; }
`;

export const $ = {
    'base-path': '#base-path',
    'bundle-name': '#bundle-name',
    'path-example': '#path-example',
    'lang-preview': '#lang-preview',
};

export function update(this: any, dump: any) {
    currentDump = dump;
    panelThis = this;

    if (!dump || !dump.value) return;

    // 更新输入框
    const basePathInput = this.$['base-path'] as HTMLInputElement;
    const bundleNameInput = this.$['bundle-name'] as HTMLInputElement;

    if (basePathInput && document.activeElement !== basePathInput) {
        basePathInput.value = dump.value.basePath?.value || '';
    }
    if (bundleNameInput && document.activeElement !== bundleNameInput) {
        bundleNameInput.value = dump.value.bundleName?.value || '';
    }

    // 更新路径示例
    updatePathExample(this);

    // 更新语言预览
    renderLangPreview(this);
}

export function ready(this: any) {
    panelThis = this;

    // 加载语言列表
    loadLanguages();

    const basePathInput = this.$['base-path'] as HTMLInputElement;
    const bundleNameInput = this.$['bundle-name'] as HTMLInputElement;

    basePathInput?.addEventListener('change', () => {
        if (currentDump?.value?.basePath) {
            currentDump.value.basePath.value = basePathInput.value.trim();
            panelThis.dispatch('change-dump');
        }
        updatePathExample(panelThis);
        renderLangPreview(panelThis);
    });

    bundleNameInput?.addEventListener('change', () => {
        if (currentDump?.value?.bundleName) {
            currentDump.value.bundleName.value = bundleNameInput.value.trim();
            panelThis.dispatch('change-dump');
        }
    });
}

/** 加载语言列表 */
async function loadLanguages() {
    try {
        // @ts-ignore
        langList = await Editor.Message.request('framework-plugin', 'i18n-get-languages') || [];
    } catch {
        langList = [];
    }
    if (panelThis) renderLangPreview(panelThis);
}

/** 更新路径示例 */
function updatePathExample(self: any) {
    const example = self.$['path-example'] as HTMLElement;
    if (!example) return;

    const basePath = currentDump?.value?.basePath?.value || 'basePath';
    example.textContent = `${basePath}_{lang}/spriteFrame`;
}

/** 渲染语言资源预览 */
function renderLangPreview(self: any) {
    const container = self.$['lang-preview'] as HTMLElement;
    if (!container) return;

    const basePath = currentDump?.value?.basePath?.value || '';

    if (!basePath || langList.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '<div class="lang-preview-title">各语言资源路径</div>';
    html += langList.map(lang => {
        const fullPath = `${basePath}_${lang}`;
        return `<div class="lang-row">
            <span class="lang-code">${escHtml(lang)}</span>
            <span class="lang-path">${escHtml(fullPath)}</span>
        </div>`;
    }).join('');

    container.innerHTML = html;
}

function escHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
