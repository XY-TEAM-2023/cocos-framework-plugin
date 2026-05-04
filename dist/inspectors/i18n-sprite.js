/**
 * I18nSprite 自定义 Inspector 面板
 *
 * 架构（与 i18n-label 保持一致）：
 * - 模块级共享只读：i18n 数据快照（snapshot），由 main.ts 推送变更
 * - 实例级独立状态：每个 inspector 实例的状态挂在 `panelThis._inst`
 * - update() 完全同步
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.close = exports.update = exports.ready = exports.$ = exports.style = exports.template = void 0;
const LOG_TAG = '[I18nSprite-Inspector]';
let snapshot = {
    languages: [],
    primaryLang: 'zh',
    version: -1,
};
let snapshotLoading = null;
const liveInstances = new Set();
let broadcastRegistered = false;
const onI18nDataChanged = (_version) => {
    void refreshSnapshot(true);
};
async function refreshSnapshot(force = false) {
    if (snapshotLoading && !force)
        return snapshotLoading;
    snapshotLoading = (async () => {
        try {
            // @ts-ignore
            const data = await Editor.Message.request('framework-plugin', 'i18n-get-snapshot');
            if (data) {
                snapshot = {
                    languages: data.languages || [],
                    primaryLang: data.primaryLang || 'zh',
                    version: data.version || 0,
                };
                console.log(`${LOG_TAG} snapshot v${snapshot.version}, ${snapshot.languages.length} langs`);
                liveInstances.forEach(self => {
                    try {
                        renderAll(self);
                    }
                    catch (_a) { }
                });
            }
        }
        catch (e) {
            console.warn(`${LOG_TAG} 拉取快照失败:`, e);
        }
        finally {
            snapshotLoading = null;
        }
    })();
    return snapshotLoading;
}
function getInst(self) {
    if (!self._inst) {
        self._inst = { dump: null };
    }
    return self._inst;
}
// ==================== 模板 ====================
exports.template = `
<div class="i18n-sprite-inspector">
    <ui-prop>
        <ui-label slot="label" tooltip="基础路径，运行时自动拼接 basePath_{lang} 加载 SpriteFrame">基础路径</ui-label>
        <div slot="content">
            <input id="base-path" type="text" placeholder='如 "textures/i18n/logo"' />
        </div>
    </ui-prop>
    <ui-prop>
        <ui-label slot="label" tooltip="SpriteFrame 所在 Bundle 名称，留空使用 resources">Bundle</ui-label>
        <div slot="content">
            <input id="bundle-name" type="text" placeholder="留空使用 resources" />
        </div>
    </ui-prop>
    <div id="hint-bar" class="hint-bar">
        <span class="hint-icon">💡</span>
        <span>运行时自动加载 <code id="path-example">basePath_{lang}/spriteFrame</code></span>
    </div>
    <div id="lang-preview" class="lang-preview"></div>
</div>
`;
exports.style = `
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
exports.$ = {
    'base-path': '#base-path',
    'bundle-name': '#bundle-name',
    'path-example': '#path-example',
    'lang-preview': '#lang-preview',
};
// ==================== 生命周期 ====================
function ready() {
    liveInstances.add(this);
    if (!broadcastRegistered) {
        try {
            // @ts-ignore
            Editor.Message.addBroadcastListener('framework-plugin:i18n-data-changed', onI18nDataChanged);
            broadcastRegistered = true;
        }
        catch (e) {
            console.warn(`${LOG_TAG} 注册 broadcast 监听失败:`, e);
        }
    }
    if (snapshot.version < 0)
        void refreshSnapshot();
    const basePathInput = this.$['base-path'];
    const bundleNameInput = this.$['bundle-name'];
    basePathInput === null || basePathInput === void 0 ? void 0 : basePathInput.addEventListener('change', () => {
        var _a, _b;
        const inst = getInst(this);
        if ((_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.basePath) {
            inst.dump.value.basePath.value = basePathInput.value.trim();
            commitProperty(this, 'basePath');
        }
        renderAll(this);
    });
    bundleNameInput === null || bundleNameInput === void 0 ? void 0 : bundleNameInput.addEventListener('change', () => {
        var _a, _b;
        const inst = getInst(this);
        if ((_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.bundleName) {
            inst.dump.value.bundleName.value = bundleNameInput.value.trim();
            commitProperty(this, 'bundleName');
        }
    });
}
exports.ready = ready;
function update(dump) {
    const inst = getInst(this);
    inst.dump = dump;
    if (!dump || !dump.value)
        return;
    renderAll(this);
}
exports.update = update;
function close() {
    liveInstances.delete(this);
}
exports.close = close;
// ==================== 渲染（同步） ====================
function renderAll(self) {
    var _a, _b;
    const inst = getInst(self);
    if (!inst.dump || !inst.dump.value)
        return;
    const basePathInput = self.$['base-path'];
    const bundleNameInput = self.$['bundle-name'];
    if (basePathInput && document.activeElement !== basePathInput) {
        basePathInput.value = ((_a = inst.dump.value.basePath) === null || _a === void 0 ? void 0 : _a.value) || '';
    }
    if (bundleNameInput && document.activeElement !== bundleNameInput) {
        bundleNameInput.value = ((_b = inst.dump.value.bundleName) === null || _b === void 0 ? void 0 : _b.value) || '';
    }
    updatePathExample(self);
    renderLangPreview(self);
}
function updatePathExample(self) {
    var _a, _b, _c;
    const inst = getInst(self);
    const example = self.$['path-example'];
    if (!example)
        return;
    const basePath = ((_c = (_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.basePath) === null || _c === void 0 ? void 0 : _c.value) || 'basePath';
    example.textContent = `${basePath}_{lang}/spriteFrame`;
}
function renderLangPreview(self) {
    var _a, _b, _c;
    const inst = getInst(self);
    const container = self.$['lang-preview'];
    if (!container)
        return;
    const basePath = ((_c = (_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.basePath) === null || _c === void 0 ? void 0 : _c.value) || '';
    const langs = snapshot.languages;
    if (!basePath || langs.length === 0) {
        container.innerHTML = '';
        return;
    }
    let html = '<div class="lang-preview-title">各语言资源路径</div>';
    html += langs.map(lang => {
        const fullPath = `${basePath}_${lang}`;
        return `<div class="lang-row">
            <span class="lang-code">${escHtml(lang)}</span>
            <span class="lang-path">${escHtml(fullPath)}</span>
        </div>`;
    }).join('');
    container.innerHTML = html;
}
// ==================== Scene API ====================
async function commitProperty(self, propertyName) {
    var _a;
    const inst = getInst(self);
    const dump = inst.dump;
    const propDump = (_a = dump === null || dump === void 0 ? void 0 : dump.value) === null || _a === void 0 ? void 0 : _a[propertyName];
    if (!propDump)
        return;
    // @ts-ignore
    const nodeUuids = Editor.Selection.getSelected('node');
    const nodeUuid = (nodeUuids === null || nodeUuids === void 0 ? void 0 : nodeUuids[0]) || '';
    if (!nodeUuid) {
        try {
            self.dispatch('change-dump');
        }
        catch (_b) { }
        return;
    }
    const propertyPath = propDump.path || `${dump.path || ''}.${propertyName}`;
    try {
        // @ts-ignore
        await Editor.Message.request('scene', 'set-property', {
            uuid: nodeUuid,
            path: propertyPath,
            dump: { type: propDump.type, value: propDump.value, isArray: propDump.isArray },
        });
    }
    catch (e) {
        console.error(`${LOG_TAG} commitProperty(${propertyName}) 失败:`, e);
        try {
            self.dispatch('change-dump');
        }
        catch (_c) { }
    }
}
function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
//# sourceMappingURL=i18n-sprite.js.map