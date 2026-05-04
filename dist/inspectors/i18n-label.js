/**
 * I18nLabel 自定义 Inspector 面板
 *
 * 架构（F 方案重构）：
 * - 模块级共享只读：i18n 数据快照（snapshot），由 main.ts 推送变更
 * - 实例级独立状态：每个 inspector 实例的状态挂在 `panelThis._inst`
 * - update() 完全同步：所有翻译查询走本地快照，零 await
 * - async 边界（set-property 等）用闭包捕获 inst/dump/uuid，不读模块级
 * - selection 持久化：点"选择"按钮时缓存 nodeUuid，回写时不依赖当下 selection
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.close = exports.update = exports.ready = exports.$ = exports.style = exports.template = void 0;
const LOG_TAG = '[I18nLabel-Inspector]';
let snapshot = {
    allTranslations: {},
    languages: [],
    primaryLang: 'zh',
    version: -1,
};
/** 是否已发起首次拉取（避免每个 inspector 重复请求） */
let snapshotLoading = null;
/** 所有活跃的 inspector 实例集合（broadcast 触发时统一刷新） */
const liveInstances = new Set();
/** 当前发起 pick mode 的实例（只能有一个） */
let pickRequester = null;
/** pick 轮询定时器（全局单例） */
let pickPollTimer = null;
const PICK_POLL_TIMEOUT = 60000;
/** 是否已注册 broadcast 监听 */
let broadcastRegistered = false;
/** 上次 snapshot 拉取时间戳（兜底节流：broadcast 不可用时由 update 触发） */
let lastSnapshotFetchAt = 0;
const SNAPSHOT_FALLBACK_INTERVAL = 2000; // 2 秒
/** broadcast 监听器引用（unload 时取消用） */
const onI18nDataChanged = (_version) => {
    void refreshSnapshot(true);
};
function getInst(self) {
    if (!self._inst) {
        self._inst = {
            dump: null,
            placeholders: new Set(),
            sortedLangs: [],
            pickContext: null,
            lastAutoSyncSig: '',
            autoSyncTimer: null,
        };
    }
    return self._inst;
}
// ==================== 数据快照管理 ====================
/** 拉取最新快照（启动时 + broadcast 触发后） */
async function refreshSnapshot(force = false) {
    if (snapshotLoading && !force)
        return snapshotLoading;
    snapshotLoading = (async () => {
        try {
            // @ts-ignore
            const data = await Editor.Message.request('framework-plugin', 'i18n-get-snapshot');
            if (data) {
                const versionChanged = (data.version || 0) !== snapshot.version;
                snapshot = {
                    allTranslations: data.allTranslations || {},
                    languages: data.languages || [],
                    primaryLang: data.primaryLang || 'zh',
                    version: data.version || 0,
                };
                lastSnapshotFetchAt = Date.now();
                if (versionChanged || force) {
                    console.log(`${LOG_TAG} snapshot v${snapshot.version}, ${Object.keys(snapshot.allTranslations).length} keys`);
                    liveInstances.forEach(self => {
                        try {
                            renderAll(self);
                        }
                        catch (_a) { }
                    });
                }
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
/** 兜底节流刷新（broadcast 不可用时由 update 触发） */
function maybeFallbackRefresh() {
    if (snapshotLoading)
        return;
    const now = Date.now();
    if (now - lastSnapshotFetchAt < SNAPSHOT_FALLBACK_INTERVAL)
        return;
    lastSnapshotFetchAt = now;
    void refreshSnapshot();
}
/** 同步：根据 key 查 fullKey 的翻译（来自本地快照） */
function getTranslations(fullKey) {
    return snapshot.allTranslations[fullKey] || {};
}
/** 同步：根据 key 查主语言文本 */
function getPrimaryText(fullKey) {
    const t = snapshot.allTranslations[fullKey];
    if (!t)
        return '';
    return t[snapshot.primaryLang] || Object.values(t).find(v => v) || '';
}
// ==================== 模板 / 样式 ====================
exports.template = `
<div class="i18n-label-inspector">
    <ui-prop>
        <ui-label slot="label" tooltip="i18n key，格式: namespace.key">Key</ui-label>
        <div slot="content" class="key-row">
            <span id="key-display" class="key-display">未设置</span>
            <button id="btn-pick-key" class="pick-btn" title="从国际化面板中选择 Key">选择</button>
        </div>
    </ui-prop>
    <div id="preview-list" class="preview-list"></div>
    <div id="param-section" class="param-section"></div>
</div>
`;
exports.style = `
.i18n-label-inspector { padding: 4px 0; }
.key-row { display: flex; gap: 6px; align-items: center; width: 100%; }
.key-display {
    flex: 1; padding: 4px 8px;
    background: #1a1a1a; border: 1px solid #333; border-radius: 4px;
    color: #4ec9b0; font-size: 12px; font-family: 'SF Mono', Menlo, monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    min-height: 20px; line-height: 20px;
}
.key-display.empty { color: #666; font-style: italic; font-family: inherit; }
.pick-btn {
    flex-shrink: 0; padding: 4px 10px;
    background: #0e639c; border: none; color: #fff;
    border-radius: 4px; font-size: 11px; cursor: pointer; white-space: nowrap;
}
.pick-btn:hover { background: #1177bb; }
.preview-list {
    margin: 4px 0 6px 0; padding: 6px 10px;
    background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 4px;
}
.preview-item {
    display: flex; align-items: baseline; gap: 10px;
    padding: 3px 0; font-size: 12px;
}
.preview-item + .preview-item { border-top: 1px solid #252525; }
.preview-lang {
    color: #666; font-weight: 600; min-width: 26px; flex-shrink: 0;
    text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;
}
.preview-text { color: #d4d4d4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.preview-text.empty { color: #4a4a4a; font-style: italic; }
.preview-text.primary { color: #4ec9b0; }
.preview-empty { padding: 4px 0; font-size: 11px; color: #4a4a4a; font-style: italic; }
.param-section { margin-top: 2px; }
.param-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 0 4px 0;
}
.param-title {
    font-size: 11px; color: #888; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
}
.param-header-actions { display: flex; gap: 4px; align-items: center; }
.param-add-btn {
    background: none; border: 1px solid #444; color: #888;
    border-radius: 3px; padding: 2px 8px; font-size: 10px; cursor: pointer;
}
.param-add-btn:hover { background: #333; color: #ccc; }
.param-cleanup-btn {
    background: none; border: 1px solid #664; color: #aa8844;
    border-radius: 3px; padding: 2px 8px; font-size: 10px; cursor: pointer;
}
.param-cleanup-btn:hover { background: #332; color: #ccaa55; border-color: #886; }
.param-group { margin: 2px 0; }
.param-group-label {
    font-size: 10px; color: #555; padding: 4px 0 2px 0;
    border-top: 1px solid #252525; margin-top: 2px;
    letter-spacing: 0.3px;
}
.param-group:first-child .param-group-label { border-top: none; margin-top: 0; }
.param-row { padding: 3px 0; }
.param-row + .param-row { border-top: 1px solid #1e1e1e; }
.param-row-main {
    display: flex; align-items: center; gap: 5px;
}
.param-row.orphan .param-row-main { opacity: 0.75; }
.param-name-tag {
    flex-shrink: 0; padding: 2px 7px;
    background: #172a3a; border: 1px solid #2a4a5a; border-radius: 10px;
    color: #6ab; font-size: 10px; font-family: 'SF Mono', Menlo, monospace;
    min-width: 36px; text-align: center; letter-spacing: 0.3px;
}
.param-name-wrap {
    flex-shrink: 0; display: flex; align-items: center; gap: 2px;
}
.param-orphan-icon {
    color: #aa8844; font-size: 12px; flex-shrink: 0; cursor: help;
}
.param-name-input {
    flex-shrink: 0; width: 56px;
    background: #232323; border: 1px solid #444; color: #ccc;
    border-radius: 3px; padding: 3px 5px; font-size: 11px; outline: none;
    font-family: 'SF Mono', Menlo, monospace;
}
.param-name-input:focus { border-color: #007ACC; }
.param-value-wrap {
    flex: 1; display: flex; align-items: center; gap: 4px; min-width: 0;
}
.param-value-input {
    flex: 1; min-width: 0;
    background: #232323; border: 1px solid #444; color: #ccc;
    border-radius: 3px; padding: 3px 6px; font-size: 12px; outline: none;
}
.param-value-input:focus { border-color: #007ACC; }
.param-value-input.i18n-mode {
    color: #4ec9b0; font-family: 'SF Mono', Menlo, monospace; font-size: 11px;
    border-color: #2a4a5a; background: #1a2230;
}
.param-value-input::placeholder { color: #444; font-style: italic; font-size: 11px; }
.param-i18n-btn {
    flex-shrink: 0; width: 22px; height: 22px;
    background: #2a2a2a; border: 1px solid #444; border-radius: 3px;
    color: #555; font-size: 10px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    padding: 0; line-height: 1; font-weight: 600;
    transition: all 0.15s ease;
}
.param-i18n-btn:hover { background: #333; color: #999; border-color: #555; }
.param-i18n-btn.active {
    background: #172a3a; border-color: #4ec9b0; color: #4ec9b0;
}
.param-pick-btn {
    flex-shrink: 0; height: 22px; padding: 0 6px;
    background: #172a3a; border: 1px solid #2a4a5a; border-radius: 3px;
    color: #4ec9b0; font-size: 9px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    line-height: 1; white-space: nowrap;
    transition: all 0.15s ease;
}
.param-pick-btn:hover { background: #1a3a4a; border-color: #4ec9b0; color: #6eddd0; }
.param-i18n-translations {
    margin: 2px 0 1px 0; padding: 3px 8px;
    background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 3px;
}
.param-i18n-trans-item {
    display: flex; align-items: baseline; gap: 8px;
    padding: 1px 0; font-size: 11px;
}
.param-i18n-trans-item + .param-i18n-trans-item { border-top: 1px solid #222; }
.param-i18n-trans-lang {
    color: #555; font-weight: 600; min-width: 22px; flex-shrink: 0;
    text-transform: uppercase; font-size: 9px; letter-spacing: 0.3px;
}
.param-i18n-trans-text {
    color: #b0b0b0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
}
.param-i18n-trans-text.empty { color: #4a4a4a; font-style: italic; }
.param-i18n-trans-text.primary { color: #4ec9b0; }
.param-i18n-preview-warn {
    font-size: 10px; color: #886644; padding: 2px 0 1px 2px;
    font-family: 'SF Mono', Menlo, monospace;
}
.param-delete-btn {
    flex-shrink: 0; background: none; border: none; color: #444; cursor: pointer;
    font-size: 12px; padding: 0 2px; line-height: 1;
    transition: color 0.15s;
}
.param-delete-btn:hover { color: #e44; }
.param-empty-hint {
    padding: 6px 10px; font-size: 11px; color: #4a4a4a; font-style: italic;
    text-align: center; background: #1a1a1a; border-radius: 3px; margin: 2px 0;
}
.param-hint {
    font-size: 10px; color: #556; padding: 3px 2px 1px 2px;
    font-style: italic;
}
`;
exports.$ = {
    'key-display': '#key-display',
    'btn-pick-key': '#btn-pick-key',
    'preview-list': '#preview-list',
    'param-section': '#param-section',
};
// ==================== 生命周期 ====================
function ready() {
    var _a;
    liveInstances.add(this);
    console.log(`${LOG_TAG} ready(), instances=${liveInstances.size}`);
    // 注册 broadcast 监听（仅一次）
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
    // 首次拉取快照（异步，但不阻塞 UI；返回后 renderAll 自动重渲所有 inspector）
    if (snapshot.version < 0) {
        void refreshSnapshot();
    }
    // 选择按钮：发起 pick mode
    (_a = this.$['btn-pick-key']) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
        var _a, _b, _c, _d;
        const inst = getInst(this);
        const currentKey = ((_c = (_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.key) === null || _c === void 0 ? void 0 : _c.value) || '';
        // 持久化当前 selection（避免面板期间丢失）
        // @ts-ignore
        const nodeUuids = Editor.Selection.getSelected('node');
        const nodeUuid = (nodeUuids === null || nodeUuids === void 0 ? void 0 : nodeUuids[0]) || '';
        const compPath = ((_d = inst.dump) === null || _d === void 0 ? void 0 : _d.path) || '';
        inst.pickContext = { nodeUuid, compPath, key: currentKey };
        console.log(`${LOG_TAG} 点击"选择", currentKey="${currentKey}", nodeUuid=${nodeUuid}`);
        pickRequester = { panelThis: this, paramIndex: null };
        // @ts-ignore
        Editor.Message.send('framework-plugin', 'open-i18n-editor');
        setTimeout(() => {
            // @ts-ignore
            Editor.Message.send('framework-plugin', 'i18n-enter-pick-mode', currentKey);
        }, 800);
        startPickPolling();
    });
}
exports.ready = ready;
function update(dump) {
    var _a;
    const inst = getInst(this);
    inst.dump = dump;
    if (!dump || !dump.value)
        return;
    // 兜底：每 2 秒重拉一次快照（broadcast 不可用时的 safety net）
    maybeFallbackRefresh();
    renderAll(this);
    // pick mode 兜底（万一 polling 漏拍）
    if (pickRequester) {
        void checkPickedKey();
    }
    // 自动同步 Label.string —— 当前 inst 闭包，去抖
    const key = ((_a = dump.value.key) === null || _a === void 0 ? void 0 : _a.value) || '';
    if (key) {
        // @ts-ignore
        const nodeUuids = Editor.Selection.getSelected('node');
        const nodeUuid = (nodeUuids === null || nodeUuids === void 0 ? void 0 : nodeUuids[0]) || '';
        const sig = `${nodeUuid}|${dump.path || ''}|${key}|v${snapshot.version}`;
        if (sig !== inst.lastAutoSyncSig) {
            inst.lastAutoSyncSig = sig;
            if (inst.autoSyncTimer)
                clearTimeout(inst.autoSyncTimer);
            inst.autoSyncTimer = setTimeout(() => {
                inst.autoSyncTimer = null;
                void syncLabelString(nodeUuid, dump.path || '', key);
            }, 200);
        }
    }
    else {
        inst.lastAutoSyncSig = '';
    }
}
exports.update = update;
function close() {
    const inst = getInst(this);
    if (inst.autoSyncTimer) {
        clearTimeout(inst.autoSyncTimer);
        inst.autoSyncTimer = null;
    }
    // 如果当前 pick requester 是自己，清理
    if ((pickRequester === null || pickRequester === void 0 ? void 0 : pickRequester.panelThis) === this) {
        pickRequester = null;
        stopPickPolling();
    }
    liveInstances.delete(this);
    console.log(`${LOG_TAG} close(), remaining instances=${liveInstances.size}`);
}
exports.close = close;
// ==================== 渲染（同步） ====================
/** 完整重渲（key 显示 + 翻译预览 + 参数区域）— 全部同步 */
function renderAll(self) {
    var _a;
    const inst = getInst(self);
    const dump = inst.dump;
    if (!dump || !dump.value)
        return;
    const key = ((_a = dump.value.key) === null || _a === void 0 ? void 0 : _a.value) || '';
    // Key 显示
    const keyDisplay = self.$['key-display'];
    if (keyDisplay) {
        if (key) {
            keyDisplay.textContent = key;
            keyDisplay.classList.remove('empty');
        }
        else {
            keyDisplay.textContent = '未设置';
            keyDisplay.classList.add('empty');
        }
    }
    renderPreview(self, key);
    // 自动同步占位符到 paramList（基于当前 key 的占位符）
    syncDetectedParams(self);
    renderParamSection(self);
}
function renderPreview(self, key) {
    const inst = getInst(self);
    const list = self.$['preview-list'];
    if (!list)
        return;
    if (!key) {
        list.innerHTML = '';
        inst.placeholders = new Set();
        inst.sortedLangs = [];
        return;
    }
    const translations = getTranslations(key);
    inst.placeholders = extractPlaceholders(translations);
    // 合并支持的语言（snapshot.languages + translations 中实际出现的）
    const langSet = new Set(snapshot.languages);
    for (const lang of Object.keys(translations))
        langSet.add(lang);
    const langs = Array.from(langSet);
    if (langs.length === 0) {
        list.innerHTML = '<div class="preview-empty">无翻译数据</div>';
        return;
    }
    const primary = snapshot.primaryLang;
    langs.sort((a, b) => {
        if (a === primary)
            return -1;
        if (b === primary)
            return 1;
        return a.localeCompare(b);
    });
    inst.sortedLangs = langs;
    list.innerHTML = langs.map(lang => {
        const text = translations[lang];
        const isPrimary = lang === primary;
        if (text) {
            return `<div class="preview-item">
                <span class="preview-lang">${escHtml(lang)}</span>
                <span class="preview-text${isPrimary ? ' primary' : ''}">${escHtml(text)}</span>
            </div>`;
        }
        else {
            return `<div class="preview-item">
                <span class="preview-lang">${escHtml(lang)}</span>
                <span class="preview-text empty">未翻译</span>
            </div>`;
        }
    }).join('');
}
function renderParamSection(self) {
    var _a, _b, _c;
    const inst = getInst(self);
    const section = self.$['param-section'];
    if (!section)
        return;
    const params = ((_c = (_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.paramList) === null || _c === void 0 ? void 0 : _c.value) || [];
    const hasDetected = inst.placeholders.size > 0;
    const hasParams = params.length > 0;
    if (!hasDetected && !hasParams) {
        section.innerHTML = '';
        return;
    }
    const autoIndices = [];
    const customIndices = [];
    const orphanIndices = new Set();
    params.forEach((p, i) => {
        var _a, _b;
        const name = ((_b = (_a = p.value) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.value) || '';
        if (inst.placeholders.has(name)) {
            autoIndices.push(i);
        }
        else {
            customIndices.push(i);
            if (name && hasDetected)
                orphanIndices.add(i);
        }
    });
    let html = `<div class="param-header">
        <span class="param-title">参数</span>
        <div class="param-header-actions">`;
    if (orphanIndices.size > 0) {
        html += `<button class="param-cleanup-btn" id="inner-btn-cleanup" title="移除翻译中无对应占位符的自定义参数">清理 ⚠${orphanIndices.size}</button>`;
    }
    html += `<button class="param-add-btn" id="inner-btn-add-param">+ 自定义</button></div></div>`;
    if (autoIndices.length > 0) {
        html += '<div class="param-group"><div class="param-group-label">自动检测</div>';
        for (const i of autoIndices) {
            html += renderParamRow(self, params[i], i, true, false);
        }
        html += '</div>';
    }
    else if (hasDetected && !hasParams) {
        html += '<div class="param-empty-hint">检测到占位符，正在同步...</div>';
    }
    if (customIndices.length > 0) {
        html += `<div class="param-group">`;
        if (hasDetected)
            html += '<div class="param-group-label">自定义</div>';
        for (const i of customIndices) {
            html += renderParamRow(self, params[i], i, false, orphanIndices.has(i));
        }
        html += '</div>';
    }
    if (autoIndices.length > 0) {
        const emptyCount = autoIndices.filter(i => { var _a, _b; return !((_b = (_a = params[i].value) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.value); }).length;
        if (emptyCount > 0) {
            html += `<div class="param-hint">运行时将用参数值替换翻译中的 {占位符}</div>`;
        }
    }
    section.innerHTML = html;
    bindParamEvents(self, section, params, orphanIndices);
}
function renderParamRow(self, p, i, isAutoDetected, isOrphan) {
    var _a, _b, _c, _d, _e, _f;
    const inst = getInst(self);
    const name = ((_b = (_a = p.value) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.value) || '';
    const value = ((_d = (_c = p.value) === null || _c === void 0 ? void 0 : _c.value) === null || _d === void 0 ? void 0 : _d.value) || '';
    const isI18n = ((_f = (_e = p.value) === null || _e === void 0 ? void 0 : _e.isI18n) === null || _f === void 0 ? void 0 : _f.value) === true;
    let nameHtml;
    if (isAutoDetected) {
        nameHtml = `<span class="param-name-tag" title="从翻译文本中自动检测">{${escHtml(name)}}</span>`;
    }
    else if (isOrphan) {
        nameHtml = `<div class="param-name-wrap">
            <span class="param-orphan-icon" title="当前翻译中无 {${escHtml(name)}} 占位符">⚠</span>
            <input class="param-name-input" type="text" value="${escHtml(name)}" placeholder="名称" data-index="${i}" data-field="name">
        </div>`;
    }
    else {
        nameHtml = `<input class="param-name-input" type="text" value="${escHtml(name)}" placeholder="名称" data-index="${i}" data-field="name">`;
    }
    const valuePlaceholder = isI18n ? 'i18n key，如 common.yes' : (isAutoDetected && !value ? '请填写参数值' : '值');
    const valueClass = isI18n ? 'param-value-input i18n-mode' : 'param-value-input';
    const i18nBtnClass = isI18n ? 'param-i18n-btn active' : 'param-i18n-btn';
    const i18nTitle = isI18n ? '当前为国际化模式，点击切换为纯文本' : '点击切换为国际化模式';
    const pickBtnHtml = isI18n
        ? `<button class="param-pick-btn" data-index="${i}" title="从国际化面板选择 Key">选</button>`
        : '';
    const deleteHtml = isAutoDetected
        ? ''
        : `<button class="param-delete-btn" data-index="${i}" title="删除参数">✕</button>`;
    let previewHtml = '';
    if (isI18n && value) {
        const translations = getTranslations(value);
        if (Object.keys(translations).length > 0) {
            const langs = inst.sortedLangs.length > 0 ? inst.sortedLangs : Object.keys(translations);
            previewHtml = `<div class="param-i18n-translations">`;
            for (const lang of langs) {
                const text = translations[lang];
                const isPrimary = lang === snapshot.primaryLang;
                if (text) {
                    previewHtml += `<div class="param-i18n-trans-item">
                        <span class="param-i18n-trans-lang">${escHtml(lang)}</span>
                        <span class="param-i18n-trans-text${isPrimary ? ' primary' : ''}">${escHtml(text)}</span>
                    </div>`;
                }
                else {
                    previewHtml += `<div class="param-i18n-trans-item">
                        <span class="param-i18n-trans-lang">${escHtml(lang)}</span>
                        <span class="param-i18n-trans-text empty">未翻译</span>
                    </div>`;
                }
            }
            previewHtml += `</div>`;
        }
        else {
            previewHtml = `<div class="param-i18n-preview-warn">→ 未找到 key "${escHtml(value)}"</div>`;
        }
    }
    const rowClass = isOrphan ? 'param-row orphan' : 'param-row';
    return `<div class="${rowClass}" data-index="${i}">
        <div class="param-row-main">
            ${nameHtml}
            <div class="param-value-wrap">
                <input class="${valueClass}" type="text" value="${escHtml(value)}" placeholder="${valuePlaceholder}" data-index="${i}" data-field="value">
                <button class="${i18nBtnClass}" data-index="${i}" title="${i18nTitle}">T</button>
                ${pickBtnHtml}
            </div>
            ${deleteHtml}
        </div>
        ${previewHtml}
    </div>`;
}
// ==================== 事件 / 提交 ====================
function bindParamEvents(self, section, params, orphanIndices) {
    var _a, _b;
    const inst = getInst(self);
    // 添加自定义参数
    (_a = section.querySelector('#inner-btn-add-param')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
        var _a, _b;
        if (!((_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.paramList))
            return;
        params.push({
            value: {
                name: { value: '' },
                value: { value: '' },
                isI18n: { value: false },
            }
        });
        commitProperty(self, 'paramList');
        renderParamSection(self);
    });
    // 清理孤儿参数
    (_b = section.querySelector('#inner-btn-cleanup')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => {
        if (orphanIndices.size === 0)
            return;
        const sortedIndices = Array.from(orphanIndices).sort((a, b) => b - a);
        for (const idx of sortedIndices)
            params.splice(idx, 1);
        commitProperty(self, 'paramList');
        renderParamSection(self);
    });
    // 参数名编辑
    section.querySelectorAll('.param-name-input').forEach((input) => {
        input.addEventListener('change', () => {
            var _a, _b;
            const idx = parseInt(input.getAttribute('data-index'));
            if ((_b = (_a = params[idx]) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.name) {
                params[idx].value.name.value = input.value;
                commitProperty(self, 'paramList');
            }
        });
    });
    // 参数值编辑
    section.querySelectorAll('.param-value-input').forEach((input) => {
        input.addEventListener('change', () => {
            var _a, _b, _c, _d, _e;
            const idx = parseInt(input.getAttribute('data-index'));
            if ((_b = (_a = params[idx]) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.value) {
                params[idx].value.value.value = input.value;
                commitProperty(self, 'paramList');
                if ((_e = (_d = (_c = params[idx]) === null || _c === void 0 ? void 0 : _c.value) === null || _d === void 0 ? void 0 : _d.isI18n) === null || _e === void 0 ? void 0 : _e.value) {
                    renderParamSection(self); // i18n 值变了重渲翻译预览
                }
            }
        });
    });
    // i18n 模式切换
    section.querySelectorAll('.param-i18n-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            var _a, _b;
            const idx = parseInt(btn.getAttribute('data-index'));
            if ((_b = (_a = params[idx]) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.isI18n) {
                params[idx].value.isI18n.value = !params[idx].value.isI18n.value;
                commitProperty(self, 'paramList');
                renderParamSection(self);
            }
        });
    });
    // i18n 模式下的"选"按钮（参数 key 选择）
    section.querySelectorAll('.param-pick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            var _a, _b, _c, _d;
            const idx = parseInt(btn.getAttribute('data-index'));
            const currentValue = ((_c = (_b = (_a = params[idx]) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.value) === null || _c === void 0 ? void 0 : _c.value) || '';
            // @ts-ignore
            const nodeUuids = Editor.Selection.getSelected('node');
            const nodeUuid = (nodeUuids === null || nodeUuids === void 0 ? void 0 : nodeUuids[0]) || '';
            inst.pickContext = { nodeUuid, compPath: ((_d = inst.dump) === null || _d === void 0 ? void 0 : _d.path) || '', key: currentValue };
            console.log(`${LOG_TAG} 参数[${idx}] 点击"选", currentValue="${currentValue}"`);
            pickRequester = { panelThis: self, paramIndex: idx };
            // @ts-ignore
            Editor.Message.send('framework-plugin', 'open-i18n-editor');
            setTimeout(() => {
                // @ts-ignore
                Editor.Message.send('framework-plugin', 'i18n-enter-pick-mode', currentValue);
            }, 800);
            startPickPolling();
        });
    });
    // 删除参数
    section.querySelectorAll('.param-delete-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-index'));
            params.splice(idx, 1);
            commitProperty(self, 'paramList');
            renderParamSection(self);
        });
    });
}
/** 自动同步：把检测到的占位符添加到 paramList */
function syncDetectedParams(self) {
    var _a, _b;
    const inst = getInst(self);
    if (!((_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.paramList))
        return;
    const params = inst.dump.value.paramList.value || [];
    const existingNames = new Set(params.map((p) => { var _a, _b; return ((_b = (_a = p.value) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.value) || ''; }).filter(Boolean));
    let changed = false;
    for (const name of inst.placeholders) {
        if (!existingNames.has(name)) {
            params.push({
                value: {
                    name: { value: name },
                    value: { value: '' },
                    isI18n: { value: false },
                }
            });
            changed = true;
        }
    }
    if (changed) {
        console.log(`${LOG_TAG} syncDetectedParams: 自动添加占位符参数`);
        commitProperty(self, 'paramList');
    }
}
// ==================== Scene API（async 边界，闭包持有） ====================
/** 提交某个属性到引擎；闭包捕获 nodeUuid + propertyPath + dumpPayload */
async function commitProperty(self, propertyName) {
    var _a, _b;
    const inst = getInst(self);
    const dump = inst.dump;
    const propDump = (_a = dump === null || dump === void 0 ? void 0 : dump.value) === null || _a === void 0 ? void 0 : _a[propertyName];
    if (!propDump)
        return;
    // 优先用 selection；拿不到时回退到 pickContext.nodeUuid（场景仍是同一个）
    // @ts-ignore
    const nodeUuids = Editor.Selection.getSelected('node');
    const nodeUuid = (nodeUuids === null || nodeUuids === void 0 ? void 0 : nodeUuids[0]) || ((_b = inst.pickContext) === null || _b === void 0 ? void 0 : _b.nodeUuid) || '';
    if (!nodeUuid) {
        console.warn(`${LOG_TAG} commitProperty(${propertyName}): 没有可用 nodeUuid`);
        // 回退：dispatch 事件
        try {
            self.dispatch('change-dump');
        }
        catch (_c) { }
        return;
    }
    const propertyPath = propDump.path || `${dump.path || ''}.${propertyName}`;
    const payload = {
        uuid: nodeUuid,
        path: propertyPath,
        dump: {
            type: propDump.type,
            value: propDump.value,
            isArray: propDump.isArray,
        },
    };
    try {
        // @ts-ignore
        await Editor.Message.request('scene', 'set-property', payload);
    }
    catch (e) {
        console.error(`${LOG_TAG} commitProperty(${propertyName}) 失败, 回退 dispatch:`, e);
        try {
            self.dispatch('change-dump');
        }
        catch (_d) { }
    }
}
/**
 * 同步 Label.string；纯闭包（不读 inst/currentDump）
 * 入参：发起时的 nodeUuid + I18nLabel 组件路径 + key
 */
async function syncLabelString(nodeUuid, i18nCompPath, key) {
    var _a, _b, _c, _d;
    if (!nodeUuid || !i18nCompPath || !key)
        return;
    const text = getPrimaryText(key);
    if (!text || text === key)
        return;
    try {
        // @ts-ignore
        const nodeDump = await Editor.Message.request('scene', 'query-node', nodeUuid);
        if (!(nodeDump === null || nodeDump === void 0 ? void 0 : nodeDump.__comps__))
            return;
        let labelCompPath = '';
        for (let i = 0; i < nodeDump.__comps__.length; i++) {
            if (((_a = nodeDump.__comps__[i]) === null || _a === void 0 ? void 0 : _a.type) === 'cc.Label') {
                labelCompPath = `__comps__.${i}`;
                break;
            }
        }
        if (!labelCompPath)
            return;
        // 已是目标值时跳过
        const currentVal = (_d = (_c = (_b = nodeDump.__comps__.find(c => (c === null || c === void 0 ? void 0 : c.type) === 'cc.Label')) === null || _b === void 0 ? void 0 : _b.value) === null || _c === void 0 ? void 0 : _c.string) === null || _d === void 0 ? void 0 : _d.value;
        if (currentVal === text)
            return;
        // @ts-ignore
        await Editor.Message.request('scene', 'set-property', {
            uuid: nodeUuid,
            path: `${labelCompPath}.string`,
            dump: { type: 'cc.String', value: text },
        });
    }
    catch (e) {
        console.warn(`${LOG_TAG} syncLabelString 失败:`, e);
    }
}
// ==================== Pick Mode ====================
function startPickPolling() {
    stopPickPolling();
    let elapsed = 0;
    pickPollTimer = setInterval(async () => {
        elapsed += 500;
        if (elapsed > PICK_POLL_TIMEOUT) {
            console.log(`${LOG_TAG} pick 轮询超时`);
            pickRequester = null;
            stopPickPolling();
            return;
        }
        await checkPickedKey();
    }, 500);
}
function stopPickPolling() {
    if (pickPollTimer) {
        clearInterval(pickPollTimer);
        pickPollTimer = null;
    }
}
/** 检查是否拿到 picked key，拿到后回写到 pickRequester 对应的实例 */
async function checkPickedKey() {
    if (!pickRequester)
        return;
    let key = '';
    try {
        // @ts-ignore
        key = await Editor.Message.request('framework-plugin', 'i18n-get-picked-key');
    }
    catch (e) {
        console.warn(`${LOG_TAG} 拿 picked key 失败:`, e);
        return;
    }
    if (!key)
        return;
    // 闭包捕获 requester（防止异步期间被覆盖）
    const requester = pickRequester;
    pickRequester = null;
    stopPickPolling();
    console.log(`${LOG_TAG} picked key="${key}", paramIndex=${requester.paramIndex}`);
    if (requester.paramIndex !== null) {
        await applyPickedParamKey(requester.panelThis, requester.paramIndex, key);
    }
    else {
        await applyPickedKey(requester.panelThis, key);
    }
}
/** 把选中的 key 写入主 key（用 pickContext.nodeUuid，不依赖当下 selection） */
async function applyPickedKey(self, key) {
    var _a;
    const inst = getInst(self);
    const dump = inst.dump;
    const ctx = inst.pickContext;
    if (!((_a = dump === null || dump === void 0 ? void 0 : dump.value) === null || _a === void 0 ? void 0 : _a.key)) {
        console.warn(`${LOG_TAG} applyPickedKey: dump.value.key 不存在`);
        return;
    }
    // 修改 in-memory dump 值
    dump.value.key.value = key;
    // 用 pickContext.nodeUuid 兜底（场景里 selection 可能丢失）
    const nodeUuid = (ctx === null || ctx === void 0 ? void 0 : ctx.nodeUuid) || (() => {
        // @ts-ignore
        const u = Editor.Selection.getSelected('node');
        return (u === null || u === void 0 ? void 0 : u[0]) || '';
    })();
    if (!nodeUuid) {
        console.error(`${LOG_TAG} applyPickedKey: 拿不到 nodeUuid`);
        try {
            self.dispatch('change-dump');
        }
        catch (_b) { }
    }
    else {
        const propDump = dump.value.key;
        const propertyPath = propDump.path || `${dump.path || ''}.key`;
        try {
            // @ts-ignore
            await Editor.Message.request('scene', 'set-property', {
                uuid: nodeUuid,
                path: propertyPath,
                dump: {
                    type: propDump.type,
                    value: key,
                    isArray: propDump.isArray,
                },
            });
            console.log(`${LOG_TAG} applyPickedKey: scene:set-property 成功, key="${key}"`);
        }
        catch (e) {
            console.error(`${LOG_TAG} applyPickedKey: set-property 失败, 回退 dispatch:`, e);
            try {
                self.dispatch('change-dump');
            }
            catch (_c) { }
        }
    }
    // 立即同步 Label.string
    await syncLabelString(nodeUuid, dump.path || '', key);
    // 立即更新显示（不等下一次 update 触发）
    const keyDisplay = self.$['key-display'];
    if (keyDisplay) {
        keyDisplay.textContent = key;
        keyDisplay.classList.remove('empty');
    }
    renderPreview(self, key);
    syncDetectedParams(self);
    renderParamSection(self);
    inst.pickContext = null;
}
async function applyPickedParamKey(self, idx, key) {
    var _a, _b, _c, _d, _e;
    const inst = getInst(self);
    const params = (_c = (_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.paramList) === null || _c === void 0 ? void 0 : _c.value;
    if (!((_e = (_d = params === null || params === void 0 ? void 0 : params[idx]) === null || _d === void 0 ? void 0 : _d.value) === null || _e === void 0 ? void 0 : _e.value)) {
        console.warn(`${LOG_TAG} applyPickedParamKey: paramList[${idx}] 不存在`);
        return;
    }
    params[idx].value.value.value = key;
    await commitProperty(self, 'paramList');
    renderParamSection(self);
    inst.pickContext = null;
}
// ==================== 工具 ====================
function extractPlaceholders(translations) {
    const result = new Set();
    for (const text of Object.values(translations)) {
        if (!text)
            continue;
        const matches = text.matchAll(/\{(\w+)\}/g);
        for (const m of matches)
            result.add(m[1]);
    }
    return result;
}
function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
//# sourceMappingURL=i18n-label.js.map