/**
 * I18nLabel 自定义 Inspector 面板
 *
 * - Key 只读显示 + 选择按钮（通过 i18n 面板选择）
 * - 所有语言翻译预览
 * - 参数自动检测 + i18n 模式切换
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.close = exports.ready = exports.update = exports.$ = exports.style = exports.template = void 0;
const LOG_TAG = '[I18nLabel-Inspector]';
/** 所有可用的 key 及其翻译 {fullKey: primaryText} */
let allKeys = {};
/** 当前 key 的所有语言翻译 {lang: text} */
let allTranslations = {};
/** 所有支持的语言列表（排序后，主语言在前） */
let sortedLanguages = [];
/** 主语言 */
let primaryLang = 'zh';
/** i18n 参数值的翻译缓存 {i18nKeyValue: {lang: text}} */
let paramI18nTranslations = {};
/** 从翻译文本中检测到的占位符名称 */
let detectedPlaceholders = new Set();
/** 当前 dump 数据 */
let currentDump = null;
/** 上次自动同步过的 (nodeUuid + compPath + key)，避免 update 频繁触发重复同步 */
let lastAutoSyncSig = '';
/** 面板引用 */
let panelThis = null;
/** 是否处于 key 选择模式（模块级，跨 close/ready 生命周期） */
let isPickMode = false;
/** 正在为哪个参数选择 i18n key（null 表示为主 key 选择） */
let pickingParamIndex = null;
/** dump 结构是否已打印（调试用，只打印一次） */
let dumpStructureLogged = false;
exports.template = `
<div class="i18n-label-inspector">
    <!-- Key 显示 + 选择 -->
    <ui-prop>
        <ui-label slot="label" tooltip="i18n key，格式: namespace.key">Key</ui-label>
        <div slot="content" class="key-row">
            <span id="key-display" class="key-display">未设置</span>
            <button id="btn-pick-key" class="pick-btn" title="从国际化面板中选择 Key">选择</button>
        </div>
    </ui-prop>

    <!-- 所有语言翻译预览 -->
    <div id="preview-list" class="preview-list"></div>

    <!-- 参数区域 -->
    <div id="param-section" class="param-section"></div>
</div>
`;
exports.style = `
.i18n-label-inspector { padding: 4px 0; }

/* Key 行 */
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

/* 翻译预览列表 */
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

/* 参数区域 */
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

/* 参数分组 */
.param-group { margin: 2px 0; }
.param-group-label {
    font-size: 10px; color: #555; padding: 4px 0 2px 0;
    border-top: 1px solid #252525; margin-top: 2px;
    letter-spacing: 0.3px;
}
.param-group:first-child .param-group-label { border-top: none; margin-top: 0; }

/* 参数行 */
.param-row { padding: 3px 0; }
.param-row + .param-row { border-top: 1px solid #1e1e1e; }
.param-row-main {
    display: flex; align-items: center; gap: 5px;
}
.param-row.orphan .param-row-main { opacity: 0.75; }

/* 参数名：自动检测 tag */
.param-name-tag {
    flex-shrink: 0; padding: 2px 7px;
    background: #172a3a; border: 1px solid #2a4a5a; border-radius: 10px;
    color: #6ab; font-size: 10px; font-family: 'SF Mono', Menlo, monospace;
    min-width: 36px; text-align: center; letter-spacing: 0.3px;
}

/* 参数名：自定义输入 */
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

/* 参数值 */
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

/* i18n 切换按钮 */
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

/* i18n 模式下的选择按钮 */
.param-pick-btn {
    flex-shrink: 0; height: 22px; padding: 0 6px;
    background: #172a3a; border: 1px solid #2a4a5a; border-radius: 3px;
    color: #4ec9b0; font-size: 9px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    line-height: 1; white-space: nowrap;
    transition: all 0.15s ease;
}
.param-pick-btn:hover { background: #1a3a4a; border-color: #4ec9b0; color: #6eddd0; }

/* i18n 参数值预览（多语言翻译列表） */
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

/* 删除按钮 */
.param-delete-btn {
    flex-shrink: 0; background: none; border: none; color: #444; cursor: pointer;
    font-size: 12px; padding: 0 2px; line-height: 1;
    transition: color 0.15s;
}
.param-delete-btn:hover { color: #e44; }

/* 空状态和提示 */
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
function update(dump) {
    var _a, _b, _c, _d, _e, _f, _g;
    currentDump = dump;
    panelThis = this;
    if (!dump || !dump.value)
        return;
    const key = ((_a = dump.value.key) === null || _a === void 0 ? void 0 : _a.value) || '';
    // 一次性日志：输出 dump 结构（调试用）
    if (!dumpStructureLogged) {
        console.log(`${LOG_TAG} dump structure:`, JSON.stringify({
            path: dump.path,
            type: dump.type,
            cid: dump.cid,
            dumpKeys: Object.keys(dump),
            keyPath: (_c = (_b = dump.value) === null || _b === void 0 ? void 0 : _b.key) === null || _c === void 0 ? void 0 : _c.path,
            keyType: (_e = (_d = dump.value) === null || _d === void 0 ? void 0 : _d.key) === null || _e === void 0 ? void 0 : _e.type,
            paramListPath: (_g = (_f = dump.value) === null || _f === void 0 ? void 0 : _f.paramList) === null || _g === void 0 ? void 0 : _g.path,
        }));
        dumpStructureLogged = true;
    }
    console.log(`${LOG_TAG} update() key="${key}"`);
    // 更新 Key 显示
    const keyDisplay = this.$['key-display'];
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
    // 选择模式下也轮询检查（作为 interval 的备份）
    if (isPickMode) {
        checkPickedKey();
    }
    // 加载翻译预览（内部会检测占位符并渲染参数）
    updatePreview(this, key);
    // 自动同步 Label.string：编辑器中场景从磁盘加载时 Label.string 是 key 本身，
    // 这里让选中此 I18nLabel 的节点时自动写入翻译文本，避免编辑器看不到翻译
    if (key) {
        // @ts-ignore
        const nodeUuids = Editor.Selection.getSelected('node');
        const nodeUuid = (nodeUuids === null || nodeUuids === void 0 ? void 0 : nodeUuids[0]) || '';
        const sig = `${nodeUuid}|${dump.path || ''}|${key}`;
        if (sig !== lastAutoSyncSig) {
            lastAutoSyncSig = sig;
            syncLabelString(key);
        }
    }
    else {
        lastAutoSyncSig = '';
    }
}
exports.update = update;
function ready() {
    var _a;
    panelThis = this;
    console.log(`${LOG_TAG} ready() called, isPickMode=${isPickMode}`);
    // 加载所有 key
    loadAllKeys();
    // 如果之前进入了选择模式但 Inspector 被刷新了，恢复轮询
    if (isPickMode) {
        console.log(`${LOG_TAG} ready() 恢复选择模式轮询`);
        startPickPolling();
    }
    // 选择按钮：打开 i18n 面板进入选择模式，并传递当前 key 以便面板自动定位
    (_a = this.$['btn-pick-key']) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
        var _a, _b;
        const currentKey = ((_b = (_a = currentDump === null || currentDump === void 0 ? void 0 : currentDump.value) === null || _a === void 0 ? void 0 : _a.key) === null || _b === void 0 ? void 0 : _b.value) || '';
        console.log(`${LOG_TAG} 点击"选择"按钮, currentKey="${currentKey}"`);
        pickingParamIndex = null; // 主 key 选择，非参数
        isPickMode = true;
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
function close() {
    console.log(`${LOG_TAG} close() called, isPickMode=${isPickMode}, polling=${!!pickPollTimer}`);
}
exports.close = close;
/** 选择模式轮询 */
let pickPollTimer = null;
const PICK_POLL_TIMEOUT = 60000;
function startPickPolling() {
    stopPickPolling();
    let elapsed = 0;
    console.log(`${LOG_TAG} startPickPolling()`);
    pickPollTimer = setInterval(async () => {
        elapsed += 500;
        if (elapsed > PICK_POLL_TIMEOUT) {
            console.log(`${LOG_TAG} 轮询超时，停止`);
            isPickMode = false;
            stopPickPolling();
            return;
        }
        await checkPickedKey();
    }, 500);
}
function stopPickPolling() {
    if (pickPollTimer) {
        console.log(`${LOG_TAG} stopPickPolling()`);
        clearInterval(pickPollTimer);
        pickPollTimer = null;
    }
}
/** 检查并应用选中的 key（区分主 key 和参数值） */
async function checkPickedKey() {
    try {
        // @ts-ignore
        const key = await Editor.Message.request('framework-plugin', 'i18n-get-picked-key');
        if (key) {
            console.log(`${LOG_TAG} checkPickedKey() 收到 key="${key}", pickingParamIndex=${pickingParamIndex}`);
            if (pickingParamIndex !== null) {
                applyPickedParamKey(key);
            }
            else {
                applyPickedKey(key);
            }
        }
    }
    catch (e) {
        console.warn(`${LOG_TAG} checkPickedKey() 异常:`, e);
    }
}
/** 使用 Scene API 直接设置组件属性（绕过 dispatch 事件冒泡机制） */
async function setPropertyViaSceneAPI(propertyName) {
    var _a;
    const propDump = (_a = currentDump === null || currentDump === void 0 ? void 0 : currentDump.value) === null || _a === void 0 ? void 0 : _a[propertyName];
    if (!propDump) {
        console.warn(`${LOG_TAG} setPropertyViaSceneAPI: 属性 "${propertyName}" 不存在`);
        return false;
    }
    try {
        // 获取当前选中节点的 UUID（scene:set-property 需要节点 UUID，不是组件 UUID）
        // @ts-ignore
        const nodeUuids = Editor.Selection.getSelected('node');
        const nodeUuid = nodeUuids === null || nodeUuids === void 0 ? void 0 : nodeUuids[0];
        if (!nodeUuid) {
            console.warn(`${LOG_TAG} setPropertyViaSceneAPI: 没有选中节点`);
            return false;
        }
        // 优先使用属性自身的 path（如 __comps__.2.key），否则从组件 path 构建
        let propertyPath = propDump.path;
        if (!propertyPath) {
            const compPath = currentDump === null || currentDump === void 0 ? void 0 : currentDump.path;
            if (!compPath) {
                console.warn(`${LOG_TAG} setPropertyViaSceneAPI: 无法确定属性路径`);
                return false;
            }
            propertyPath = `${compPath}.${propertyName}`;
        }
        console.log(`${LOG_TAG} scene:set-property uuid=${nodeUuid}, path=${propertyPath}, value=`, propDump.value);
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
        console.log(`${LOG_TAG} scene:set-property 成功`);
        return true;
    }
    catch (e) {
        console.error(`${LOG_TAG} scene:set-property 失败:`, e);
        return false;
    }
}
/** 应用选中的 key 到组件 */
async function applyPickedKey(key) {
    var _a, _b, _c;
    console.log(`${LOG_TAG} applyPickedKey("${key}") 开始, currentDump.key="${(_b = (_a = currentDump === null || currentDump === void 0 ? void 0 : currentDump.value) === null || _a === void 0 ? void 0 : _a.key) === null || _b === void 0 ? void 0 : _b.value}"`);
    isPickMode = false;
    stopPickPolling();
    // 先修改 dump 中的值，然后通过 Scene API 直接设置
    if ((_c = currentDump === null || currentDump === void 0 ? void 0 : currentDump.value) === null || _c === void 0 ? void 0 : _c.key) {
        currentDump.value.key.value = key;
        const success = await setPropertyViaSceneAPI('key');
        if (!success) {
            // 回退到 dispatch 方式
            console.warn(`${LOG_TAG} Scene API 失败，回退到 dispatch`);
            panelThis === null || panelThis === void 0 ? void 0 : panelThis.dispatch('change-dump');
        }
    }
    else {
        console.warn(`${LOG_TAG} currentDump?.value?.key 不存在，无法设置 key`);
    }
    // 设置完 key 后，将翻译文本同步写入 Label.string（编辑器实时预览）
    await syncLabelString(key);
    // 立即更新显示
    const keyDisplay = panelThis === null || panelThis === void 0 ? void 0 : panelThis.$['key-display'];
    if (keyDisplay) {
        keyDisplay.textContent = key;
        keyDisplay.classList.remove('empty');
    }
    // 刷新翻译预览
    loadAllKeys();
    updatePreview(panelThis, key);
}
/**
 * 将 i18n 翻译文本同步写入同节点的 Label.string
 * 通过 scene:set-property 直接修改场景中 Label 组件的 string 属性
 */
async function syncLabelString(key) {
    try {
        // 获取翻译文本
        // @ts-ignore
        const text = await Editor.Message.request('framework-plugin', 'i18n-translate', key);
        if (!text || text === key)
            return;
        // 获取选中节点
        // @ts-ignore
        const nodeUuids = Editor.Selection.getSelected('node');
        const nodeUuid = nodeUuids === null || nodeUuids === void 0 ? void 0 : nodeUuids[0];
        if (!nodeUuid)
            return;
        // 从 I18nLabel 的组件路径推算 Label 组件路径
        // I18nLabel path 格式：__comps__.N，Label 通常在它前面
        const i18nCompPath = currentDump === null || currentDump === void 0 ? void 0 : currentDump.path;
        if (!i18nCompPath)
            return;
        // 查询节点的所有组件，找到 cc.Label 的索引
        // @ts-ignore
        const nodeDump = await Editor.Message.request('scene', 'query-node', nodeUuid);
        if (!(nodeDump === null || nodeDump === void 0 ? void 0 : nodeDump.__comps__))
            return;
        let labelCompPath = '';
        for (let i = 0; i < nodeDump.__comps__.length; i++) {
            const comp = nodeDump.__comps__[i];
            if ((comp === null || comp === void 0 ? void 0 : comp.type) === 'cc.Label') {
                labelCompPath = `__comps__.${i}`;
                break;
            }
        }
        if (!labelCompPath)
            return;
        // @ts-ignore
        await Editor.Message.request('scene', 'set-property', {
            uuid: nodeUuid,
            path: `${labelCompPath}.string`,
            dump: {
                type: 'cc.String',
                value: text,
            },
        });
        console.log(`${LOG_TAG} syncLabelString: Label.string 已设置为 "${text}"`);
    }
    catch (e) {
        console.warn(`${LOG_TAG} syncLabelString 失败:`, e);
    }
}
/** 应用选中的 key 到参数值 */
async function applyPickedParamKey(key) {
    var _a, _b, _c, _d;
    const idx = pickingParamIndex;
    console.log(`${LOG_TAG} applyPickedParamKey("${key}") paramIndex=${idx}`);
    isPickMode = false;
    pickingParamIndex = null;
    stopPickPolling();
    const params = (_b = (_a = currentDump === null || currentDump === void 0 ? void 0 : currentDump.value) === null || _a === void 0 ? void 0 : _a.paramList) === null || _b === void 0 ? void 0 : _b.value;
    if (idx !== null && ((_d = (_c = params === null || params === void 0 ? void 0 : params[idx]) === null || _c === void 0 ? void 0 : _c.value) === null || _d === void 0 ? void 0 : _d.value)) {
        params[idx].value.value.value = key;
        commitParamChange();
        // 清除旧缓存，重新加载翻译预览
        delete paramI18nTranslations[key];
        await loadAllKeys();
        await loadParamI18nTranslations();
        renderParamSection(panelThis);
    }
}
/** 加载所有可用 key */
async function loadAllKeys() {
    try {
        // @ts-ignore
        allKeys = await Editor.Message.request('framework-plugin', 'i18n-get-all-keys') || {};
    }
    catch (_a) {
        allKeys = {};
    }
}
/** 从翻译文本中提取所有 {xxx} 占位符 */
function extractPlaceholders(translations) {
    const result = new Set();
    for (const text of Object.values(translations)) {
        if (!text)
            continue;
        const matches = text.matchAll(/\{(\w+)\}/g);
        for (const m of matches) {
            result.add(m[1]);
        }
    }
    return result;
}
/** 加载所有 i18n 参数值的多语言翻译（缓存到 paramI18nTranslations） */
async function loadParamI18nTranslations() {
    var _a, _b, _c, _d, _e, _f;
    const params = ((_b = (_a = currentDump === null || currentDump === void 0 ? void 0 : currentDump.value) === null || _a === void 0 ? void 0 : _a.paramList) === null || _b === void 0 ? void 0 : _b.value) || [];
    const newCache = {};
    for (const p of params) {
        if (((_d = (_c = p.value) === null || _c === void 0 ? void 0 : _c.isI18n) === null || _d === void 0 ? void 0 : _d.value) && ((_f = (_e = p.value) === null || _e === void 0 ? void 0 : _e.value) === null || _f === void 0 ? void 0 : _f.value)) {
            const key = p.value.value.value;
            if (newCache[key])
                continue; // 同一个 key 不重复请求
            // 优先使用上次缓存
            if (paramI18nTranslations[key]) {
                newCache[key] = paramI18nTranslations[key];
                continue;
            }
            try {
                // @ts-ignore
                const translations = await Editor.Message.request('framework-plugin', 'i18n-translate-all', key) || {};
                newCache[key] = translations;
            }
            catch (_g) {
                newCache[key] = {};
            }
        }
    }
    paramI18nTranslations = newCache;
}
/** 自动同步参数：将检测到的占位符添加到 paramList */
function syncDetectedParams() {
    var _a;
    if (!((_a = currentDump === null || currentDump === void 0 ? void 0 : currentDump.value) === null || _a === void 0 ? void 0 : _a.paramList))
        return;
    const params = currentDump.value.paramList.value || [];
    const existingNames = new Set(params.map((p) => { var _a, _b; return ((_b = (_a = p.value) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.value) || ''; }).filter(Boolean));
    let changed = false;
    for (const name of detectedPlaceholders) {
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
        console.log(`${LOG_TAG} syncDetectedParams: 新增参数, 通过 Scene API 设置`);
        setPropertyViaSceneAPI('paramList').catch(e => {
            console.warn(`${LOG_TAG} syncDetectedParams Scene API 失败，回退到 dispatch:`, e);
            panelThis === null || panelThis === void 0 ? void 0 : panelThis.dispatch('change-dump');
        });
    }
}
/** 更新所有语言翻译预览 */
async function updatePreview(self, key) {
    const list = self === null || self === void 0 ? void 0 : self.$['preview-list'];
    if (!list)
        return;
    if (!key) {
        list.innerHTML = '';
        detectedPlaceholders = new Set();
        renderParamSection(self);
        return;
    }
    try {
        // @ts-ignore
        const translations = await Editor.Message.request('framework-plugin', 'i18n-translate-all', key) || {};
        allTranslations = translations;
        // 检测占位符
        detectedPlaceholders = extractPlaceholders(translations);
        // 获取所有支持的语言列表（确保每种语言都显示，未翻译的显示提示）
        let allLanguagesFetched = [];
        try {
            // @ts-ignore
            allLanguagesFetched = await Editor.Message.request('framework-plugin', 'i18n-get-languages') || [];
            if (allLanguagesFetched.length > 0)
                primaryLang = allLanguagesFetched[0];
        }
        catch (_a) { }
        // 合并：先用完整语言列表，再补充 translations 中可能多出的语言
        const langSet = new Set(allLanguagesFetched);
        for (const lang of Object.keys(translations)) {
            langSet.add(lang);
        }
        const langs = Array.from(langSet);
        if (langs.length === 0) {
            list.innerHTML = '<div class="preview-empty">无翻译数据</div>';
            renderParamSection(self);
            return;
        }
        // 主语言排在最前，存储到模块变量供参数预览复用
        langs.sort((a, b) => {
            if (a === primaryLang)
                return -1;
            if (b === primaryLang)
                return 1;
            return a.localeCompare(b);
        });
        sortedLanguages = langs;
        list.innerHTML = langs.map(lang => {
            const text = translations[lang];
            const isPrimary = lang === primaryLang;
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
        // 自动同步参数 → 加载 i18n 参数翻译 → 渲染参数区域
        syncDetectedParams();
        await loadParamI18nTranslations();
        renderParamSection(self);
    }
    catch (_b) {
        list.innerHTML = '<div class="preview-empty">加载翻译失败</div>';
        renderParamSection(self);
    }
}
/** 渲染参数区域 */
function renderParamSection(self) {
    var _a, _b;
    const section = self === null || self === void 0 ? void 0 : self.$['param-section'];
    if (!section)
        return;
    const params = ((_b = (_a = currentDump === null || currentDump === void 0 ? void 0 : currentDump.value) === null || _a === void 0 ? void 0 : _a.paramList) === null || _b === void 0 ? void 0 : _b.value) || [];
    const hasDetected = detectedPlaceholders.size > 0;
    const hasParams = params.length > 0;
    // 翻译中无占位符且无参数时，完全隐藏
    if (!hasDetected && !hasParams) {
        section.innerHTML = '';
        return;
    }
    // 分类参数
    const autoIndices = [];
    const customIndices = [];
    const orphanIndices = new Set();
    params.forEach((p, i) => {
        var _a, _b;
        const name = ((_b = (_a = p.value) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.value) || '';
        if (detectedPlaceholders.has(name)) {
            autoIndices.push(i);
        }
        else {
            customIndices.push(i);
            // 有名称但翻译中无对应占位符 → 孤儿参数
            if (name && hasDetected) {
                orphanIndices.add(i);
            }
        }
    });
    // 头部：标题 + 操作按钮
    let html = `<div class="param-header">
        <span class="param-title">参数</span>
        <div class="param-header-actions">`;
    if (orphanIndices.size > 0) {
        html += `<button class="param-cleanup-btn" id="inner-btn-cleanup" title="移除翻译中无对应占位符的自定义参数">清理 ⚠${orphanIndices.size}</button>`;
    }
    html += `<button class="param-add-btn" id="inner-btn-add-param">+ 自定义</button>
        </div></div>`;
    // 自动检测分组
    if (autoIndices.length > 0) {
        html += '<div class="param-group"><div class="param-group-label">自动检测</div>';
        for (const i of autoIndices) {
            html += renderParamRow(params[i], i, true, false);
        }
        html += '</div>';
    }
    else if (hasDetected && !hasParams) {
        html += '<div class="param-empty-hint">检测到占位符，正在同步...</div>';
    }
    // 自定义分组
    if (customIndices.length > 0) {
        html += `<div class="param-group">`;
        if (hasDetected) {
            html += '<div class="param-group-label">自定义</div>';
        }
        for (const i of customIndices) {
            html += renderParamRow(params[i], i, false, orphanIndices.has(i));
        }
        html += '</div>';
    }
    // 友好提示：自动检测到占位符但值为空
    if (autoIndices.length > 0) {
        const emptyCount = autoIndices.filter(i => { var _a, _b; return !((_b = (_a = params[i].value) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.value); }).length;
        if (emptyCount > 0) {
            html += `<div class="param-hint">运行时将用参数值替换翻译中的 {占位符}</div>`;
        }
    }
    section.innerHTML = html;
    bindParamEvents(section, params, orphanIndices);
}
/** 渲染单个参数行 */
function renderParamRow(p, i, isAutoDetected, isOrphan) {
    var _a, _b, _c, _d, _e, _f;
    const name = ((_b = (_a = p.value) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.value) || '';
    const value = ((_d = (_c = p.value) === null || _c === void 0 ? void 0 : _c.value) === null || _d === void 0 ? void 0 : _d.value) || '';
    const isI18n = ((_f = (_e = p.value) === null || _e === void 0 ? void 0 : _e.isI18n) === null || _f === void 0 ? void 0 : _f.value) === true;
    // 参数名
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
    // 值输入框
    const valuePlaceholder = isI18n ? 'i18n key，如 common.yes' : (isAutoDetected && !value ? '请填写参数值' : '值');
    const valueClass = isI18n ? 'param-value-input i18n-mode' : 'param-value-input';
    const i18nBtnClass = isI18n ? 'param-i18n-btn active' : 'param-i18n-btn';
    const i18nTitle = isI18n ? '当前为国际化模式，点击切换为纯文本' : '点击切换为国际化模式';
    // i18n 模式下显示"选"按钮，从面板选择 key
    const pickBtnHtml = isI18n
        ? `<button class="param-pick-btn" data-index="${i}" title="从国际化面板选择 Key">选</button>`
        : '';
    // 删除按钮（自动检测的参数不显示）
    const deleteHtml = isAutoDetected
        ? ''
        : `<button class="param-delete-btn" data-index="${i}" title="删除参数">✕</button>`;
    // i18n 值的多语言翻译预览（和主 key 预览保持一致风格）
    let previewHtml = '';
    if (isI18n && value) {
        const translations = paramI18nTranslations[value];
        if (translations && Object.keys(translations).length > 0) {
            // 使用排序好的语言列表，和主预览一致
            const langs = sortedLanguages.length > 0 ? sortedLanguages : Object.keys(translations);
            previewHtml = `<div class="param-i18n-translations">`;
            for (const lang of langs) {
                const text = translations[lang];
                const isPrimary = lang === primaryLang;
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
/** 提交参数列表变更到引擎 */
function commitParamChange() {
    setPropertyViaSceneAPI('paramList').catch(() => {
        console.warn(`${LOG_TAG} commitParamChange Scene API 失败，回退到 dispatch`);
        panelThis === null || panelThis === void 0 ? void 0 : panelThis.dispatch('change-dump');
    });
}
/** 绑定参数区域事件 */
function bindParamEvents(section, params, orphanIndices) {
    var _a, _b;
    // 添加自定义参数
    (_a = section.querySelector('#inner-btn-add-param')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
        var _a;
        if (!((_a = currentDump === null || currentDump === void 0 ? void 0 : currentDump.value) === null || _a === void 0 ? void 0 : _a.paramList))
            return;
        params.push({
            value: {
                name: { value: '' },
                value: { value: '' },
                isI18n: { value: false },
            }
        });
        commitParamChange();
        renderParamSection(panelThis);
    });
    // 一键清理无用参数（移除孤儿参数）
    (_b = section.querySelector('#inner-btn-cleanup')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => {
        if (orphanIndices.size === 0)
            return;
        // 从后往前删，避免索引偏移
        const sortedIndices = Array.from(orphanIndices).sort((a, b) => b - a);
        for (const idx of sortedIndices) {
            params.splice(idx, 1);
        }
        commitParamChange();
        renderParamSection(panelThis);
    });
    // 参数名编辑
    section.querySelectorAll('.param-name-input').forEach((input) => {
        input.addEventListener('change', () => {
            var _a, _b;
            const idx = parseInt(input.getAttribute('data-index'));
            if ((_b = (_a = params[idx]) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.name) {
                params[idx].value.name.value = input.value;
                commitParamChange();
            }
        });
    });
    // 参数值编辑
    section.querySelectorAll('.param-value-input').forEach((input) => {
        input.addEventListener('change', async () => {
            var _a, _b, _c, _d, _e;
            const idx = parseInt(input.getAttribute('data-index'));
            if ((_b = (_a = params[idx]) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.value) {
                const newValue = input.value;
                params[idx].value.value.value = newValue;
                commitParamChange();
                // i18n 模式下需要刷新翻译缓存并重新渲染预览
                if ((_e = (_d = (_c = params[idx]) === null || _c === void 0 ? void 0 : _c.value) === null || _d === void 0 ? void 0 : _d.isI18n) === null || _e === void 0 ? void 0 : _e.value) {
                    delete paramI18nTranslations[newValue];
                    await loadParamI18nTranslations();
                    renderParamSection(panelThis);
                }
            }
        });
    });
    // i18n 模式切换
    section.querySelectorAll('.param-i18n-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            var _a, _b;
            const idx = parseInt(btn.getAttribute('data-index'));
            if ((_b = (_a = params[idx]) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.isI18n) {
                params[idx].value.isI18n.value = !params[idx].value.isI18n.value;
                commitParamChange();
                // 切换到 i18n 模式后加载翻译
                if (params[idx].value.isI18n.value) {
                    await loadParamI18nTranslations();
                }
                renderParamSection(panelThis);
            }
        });
    });
    // i18n 模式下从面板选择 key
    section.querySelectorAll('.param-pick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            var _a, _b, _c;
            const idx = parseInt(btn.getAttribute('data-index'));
            const currentValue = ((_c = (_b = (_a = params[idx]) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.value) === null || _c === void 0 ? void 0 : _c.value) || '';
            console.log(`${LOG_TAG} 参数[${idx}] 点击"选"按钮, currentValue="${currentValue}"`);
            pickingParamIndex = idx;
            isPickMode = true;
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
            commitParamChange();
            renderParamSection(panelThis);
        });
    });
}
function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
//# sourceMappingURL=i18n-label.js.map