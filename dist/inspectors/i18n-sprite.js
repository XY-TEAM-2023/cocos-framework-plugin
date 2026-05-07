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
const onI18nDataChanged = (_v) => {
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
        <ui-label slot="label" tooltip="约定路径模式：basePath_{lang}/spriteFrame 自动加载；非空时优先于下方 Entries">基础路径</ui-label>
        <div slot="content">
            <input id="base-path" type="text" placeholder='留空使用下方手动绑定' />
        </div>
    </ui-prop>
    <ui-prop>
        <ui-label slot="label" tooltip="约定路径模式下加载资源所在 Bundle，留空使用 resources">Bundle</ui-label>
        <div slot="content">
            <input id="bundle-name" type="text" placeholder="留空使用 resources" />
        </div>
    </ui-prop>
    <div id="path-hint" class="path-hint" hidden>
        <span class="hint-icon">💡</span>
        <span>运行时自动加载 <code id="path-example">basePath_{lang}/spriteFrame</code></span>
    </div>
    <div id="entries-section" class="entries-section"></div>
</div>
`;
exports.style = `
.i18n-sprite-inspector { padding: 4px 0; }
.i18n-sprite-inspector input[type="text"] {
    width: 100%; box-sizing: border-box;
    background: #232323; border: 1px solid #444; color: #ccc;
    border-radius: 4px; padding: 4px 8px; font-size: 12px; outline: none;
}
.i18n-sprite-inspector input[type="text"]:focus { border-color: #007ACC; }
.path-hint {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; margin: 6px 0;
    background: #1a2a1a; border-radius: 4px;
    font-size: 11px; color: #6a6;
}
.path-hint code {
    background: #232323; padding: 1px 4px; border-radius: 3px;
    font-family: 'SF Mono', Menlo, monospace; color: #4ec9b0;
}
.hint-icon { font-size: 13px; }
.entries-section { margin-top: 4px; }
.entries-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 0 4px;
}
.entries-title {
    font-size: 11px; color: #888; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
}
.entries-add-btn {
    background: none; border: 1px solid #444; color: #888;
    border-radius: 3px; padding: 2px 8px; font-size: 10px; cursor: pointer;
}
.entries-add-btn:hover { background: #333; color: #ccc; }
.entries-list {}
.entry-row {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 0;
}
.entry-row + .entry-row { border-top: 1px solid #1e1e1e; }
.entry-lang-select {
    flex-shrink: 0; min-width: 84px; height: 24px;
    background: #232323; border: 1px solid #444; color: #ccc;
    border-radius: 3px; padding: 0 6px; font-size: 12px; outline: none;
    font-family: 'SF Mono', Menlo, monospace;
}
.entry-lang-select:focus { border-color: #007ACC; }
.entry-sprite-wrap {
    flex: 1; min-width: 0;
}
.entry-sprite-wrap ui-prop { display: block; }
.entry-delete-btn {
    flex-shrink: 0; background: none; border: none; color: #444;
    cursor: pointer; font-size: 12px; padding: 0 4px;
    transition: color 0.15s;
}
.entry-delete-btn:hover { color: #e44; }
.entries-empty {
    padding: 8px; text-align: center; font-size: 11px;
    color: #4a4a4a; font-style: italic;
    background: #1a1a1a; border-radius: 3px;
}
.entries-disabled-warn {
    padding: 4px 8px; margin: 4px 0;
    background: #2a2418; border-radius: 4px;
    font-size: 11px; color: #c89042;
}
`;
exports.$ = {
    'base-path': '#base-path',
    'bundle-name': '#bundle-name',
    'path-hint': '#path-hint',
    'path-example': '#path-example',
    'entries-section': '#entries-section',
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
// ==================== 渲染 ====================
function renderAll(self) {
    var _a, _b, _c;
    const inst = getInst(self);
    if (!((_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value))
        return;
    const basePathInput = self.$['base-path'];
    const bundleNameInput = self.$['bundle-name'];
    if (basePathInput && document.activeElement !== basePathInput) {
        basePathInput.value = ((_b = inst.dump.value.basePath) === null || _b === void 0 ? void 0 : _b.value) || '';
    }
    if (bundleNameInput && document.activeElement !== bundleNameInput) {
        bundleNameInput.value = ((_c = inst.dump.value.bundleName) === null || _c === void 0 ? void 0 : _c.value) || '';
    }
    updatePathHint(self);
    renderEntries(self);
}
function updatePathHint(self) {
    var _a, _b, _c;
    const inst = getInst(self);
    const hint = self.$['path-hint'];
    const example = self.$['path-example'];
    if (!hint || !example)
        return;
    const basePath = ((_c = (_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.basePath) === null || _c === void 0 ? void 0 : _c.value) || '';
    if (basePath) {
        hint.removeAttribute('hidden');
        example.textContent = `${basePath}_{lang}/spriteFrame`;
    }
    else {
        hint.setAttribute('hidden', '');
    }
}
function renderEntries(self) {
    var _a, _b, _c, _d, _e, _f;
    const inst = getInst(self);
    const section = self.$['entries-section'];
    if (!section)
        return;
    const entriesDump = (_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.entries;
    const entries = (entriesDump === null || entriesDump === void 0 ? void 0 : entriesDump.value) || [];
    const hasBasePath = !!((_e = (_d = (_c = inst.dump) === null || _c === void 0 ? void 0 : _c.value) === null || _d === void 0 ? void 0 : _d.basePath) === null || _e === void 0 ? void 0 : _e.value);
    let html = '<div class="entries-header">';
    html += '<span class="entries-title">手动绑定 Entries</span>';
    html += '<button class="entries-add-btn" id="inner-btn-add-entry">+ 添加项</button>';
    html += '</div>';
    if (hasBasePath) {
        html += '<div class="entries-disabled-warn">⚠ Base Path 非空，下方 Entries 不生效（约定路径模式优先）</div>';
    }
    if (entries.length === 0) {
        html += '<div class="entries-empty">无项；点击右上角"+ 添加项"开始绑定</div>';
    }
    else {
        html += '<div class="entries-list" id="inner-entries-list"></div>';
    }
    section.innerHTML = html;
    // 添加项按钮
    (_f = section.querySelector('#inner-btn-add-entry')) === null || _f === void 0 ? void 0 : _f.addEventListener('click', () => {
        addEntry(self);
    });
    // 渲染每行
    if (entries.length > 0) {
        const listEl = section.querySelector('#inner-entries-list');
        entries.forEach((entry, idx) => {
            const row = buildEntryRow(self, entry, idx);
            listEl.appendChild(row);
        });
    }
}
function buildEntryRow(self, entry, idx) {
    var _a, _b, _c;
    const row = document.createElement('div');
    row.className = 'entry-row';
    // 1. lang 下拉框
    const langSelect = document.createElement('select');
    langSelect.className = 'entry-lang-select';
    const currentLang = ((_b = (_a = entry === null || entry === void 0 ? void 0 : entry.value) === null || _a === void 0 ? void 0 : _a.lang) === null || _b === void 0 ? void 0 : _b.value) || '';
    fillLangOptions(langSelect, currentLang);
    langSelect.addEventListener('change', () => {
        var _a, _b, _c, _d, _e;
        const inst = getInst(self);
        const entries = (_c = (_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.entries) === null || _c === void 0 ? void 0 : _c.value;
        if ((_e = (_d = entries === null || entries === void 0 ? void 0 : entries[idx]) === null || _d === void 0 ? void 0 : _d.value) === null || _e === void 0 ? void 0 : _e.lang) {
            entries[idx].value.lang.value = langSelect.value;
        }
        // 用精确路径写 lang 字段，避免被 cocos 数组合并行为吞掉
        void setEntryLang(self, idx, langSelect.value);
    });
    row.appendChild(langSelect);
    // 2. SpriteFrame 字段（cocos 默认控件）
    const sfWrap = document.createElement('div');
    sfWrap.className = 'entry-sprite-wrap';
    const sfDump = (_c = entry === null || entry === void 0 ? void 0 : entry.value) === null || _c === void 0 ? void 0 : _c.spriteFrame;
    if (sfDump) {
        const sfProp = document.createElement('ui-prop');
        sfProp.setAttribute('type', 'dump');
        sfProp.setAttribute('no-label', '');
        try {
            sfProp.render(sfDump);
        }
        catch (e) {
            console.warn(`${LOG_TAG} render spriteFrame 失败:`, e);
        }
        sfProp.addEventListener('change-dump', () => {
            commitProperty(self, 'entries');
        });
        sfWrap.appendChild(sfProp);
    }
    row.appendChild(sfWrap);
    // 3. 删除按钮
    const delBtn = document.createElement('button');
    delBtn.className = 'entry-delete-btn';
    delBtn.title = '删除该项';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
        removeEntry(self, idx);
    });
    row.appendChild(delBtn);
    return row;
}
function fillLangOptions(select, currentLang) {
    const langs = snapshot.languages.length > 0 ? snapshot.languages.slice() : [];
    // 主语言置顶
    langs.sort((a, b) => {
        if (a === snapshot.primaryLang)
            return -1;
        if (b === snapshot.primaryLang)
            return 1;
        return a.localeCompare(b);
    });
    // 当前语言不在 snapshot 中（比如 i18n 数据未加载、或用户填了未注册的语言），保留显示
    if (currentLang && !langs.includes(currentLang)) {
        langs.unshift(currentLang);
    }
    if (langs.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(无可选语言)';
        select.appendChild(opt);
        return;
    }
    for (const lang of langs) {
        const opt = document.createElement('option');
        opt.value = lang;
        opt.textContent = lang === snapshot.primaryLang ? `${lang}（主）` : lang;
        if (lang === currentLang)
            opt.selected = true;
        select.appendChild(opt);
    }
}
async function addEntry(self) {
    var _a, _b;
    const inst = getInst(self);
    const entriesDump = (_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.entries;
    if (!entriesDump)
        return;
    const entries = entriesDump.value;
    // 选个未占用的语言
    const usedLangs = new Set(entries.map((e) => { var _a, _b; return (_b = (_a = e === null || e === void 0 ? void 0 : e.value) === null || _a === void 0 ? void 0 : _a.lang) === null || _b === void 0 ? void 0 : _b.value; }).filter(Boolean));
    let candidate = snapshot.languages.find(l => !usedLangs.has(l));
    if (!candidate)
        candidate = snapshot.primaryLang || 'zh';
    const newIdx = entries.length;
    entries.push({
        value: {
            lang: { value: candidate },
            spriteFrame: { value: { uuid: '' } },
        },
    });
    await commitProperty(self, 'entries');
    // 数组 push 走 set-property 整体提交时，cocos 可能用 elementType 默认值覆盖 lang 字段，
    // 这里再用精确路径写一次 lang，确保持久化
    await setEntryLang(self, newIdx, candidate);
    renderEntries(self);
}
function removeEntry(self, idx) {
    var _a, _b, _c;
    const inst = getInst(self);
    const entries = (_c = (_b = (_a = inst.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.entries) === null || _c === void 0 ? void 0 : _c.value;
    if (!entries)
        return;
    entries.splice(idx, 1);
    commitProperty(self, 'entries');
    renderEntries(self);
}
// ==================== Scene API ====================
/**
 * 用精确路径单独写 entries[idx].lang 字段
 * 绕过数组整体 commit 时 cocos 用 elementType 默认值覆盖 lang 字段的行为
 */
async function setEntryLang(self, idx, lang) {
    const inst = getInst(self);
    const dump = inst.dump;
    if (!dump)
        return;
    // @ts-ignore
    const nodeUuids = Editor.Selection.getSelected('node');
    const nodeUuid = (nodeUuids === null || nodeUuids === void 0 ? void 0 : nodeUuids[0]) || '';
    if (!nodeUuid)
        return;
    const langPath = `${dump.path || ''}.entries.${idx}.lang`;
    try {
        // @ts-ignore
        await Editor.Message.request('scene', 'set-property', {
            uuid: nodeUuid,
            path: langPath,
            dump: { type: 'String', value: lang },
        });
    }
    catch (e) {
        console.warn(`${LOG_TAG} setEntryLang(${idx}, ${lang}) 失败:`, e);
    }
}
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
            dump: {
                type: propDump.type,
                value: propDump.value,
                isArray: propDump.isArray,
            },
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
//# sourceMappingURL=i18n-sprite.js.map