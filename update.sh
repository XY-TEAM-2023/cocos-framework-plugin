#!/bin/bash
# ============================================================
# Cocos Framework 更新脚本
# 更新 cocos-framework 和 cocos-framework-plugin 子模块
# ============================================================

set -e

# -------------------- 配置 --------------------
FRAMEWORK_PATH="assets/framework"
PLUGIN_PATH="extensions/framework-plugin"

# -------------------- 颜色 --------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# -------------------- 函数 --------------------
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# 获取最新的稳定版本 Tag
get_latest_tag() {
    git tag -l 'v*' --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1
}

# 获取当前版本
get_current_version() {
    local tag=$(git describe --tags --exact-match 2>/dev/null || echo "")
    if [ -z "$tag" ]; then
        echo "$(git rev-parse --short HEAD) (未标记版本)"
    else
        echo "$tag"
    fi
}

# -------------------- 前置检查 --------------------
echo ""
echo "============================================"
echo "  Cocos Framework 更新脚本"
echo "============================================"
echo ""

if [ ! -d ".git" ]; then
    error "当前目录不是 Git 仓库，请在 Cocos Creator 项目根目录下执行"
fi

if [ ! -d "$FRAMEWORK_PATH/.git" ] && [ ! -f "$FRAMEWORK_PATH/.git" ]; then
    error "未找到框架子模块 ($FRAMEWORK_PATH)，请先执行 install.sh 安装"
fi

info "当前目录: $(pwd)"
echo ""

# -------------------- 更新框架 --------------------
info "步骤 1/2：更新框架子模块..."

cd "$FRAMEWORK_PATH"

CURRENT_VERSION=$(get_current_version)
info "当前框架版本: $CURRENT_VERSION"

git fetch --tags 2>/dev/null
LATEST_TAG=$(get_latest_tag)

if [ -z "$LATEST_TAG" ]; then
    warn "未找到稳定版本 Tag，拉取最新代码"
    git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || warn "拉取失败，请检查远程分支"
else
    # 检查是否已是最新
    CURRENT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "")
    if [ "$CURRENT_TAG" = "$LATEST_TAG" ]; then
        success "框架已是最新版本 $LATEST_TAG ✅"
    else
        git checkout "$LATEST_TAG"
        success "框架已更新: $CURRENT_VERSION → $LATEST_TAG"
    fi
fi

cd - > /dev/null

# -------------------- 更新插件 --------------------
info "步骤 2/2：更新编辑器插件..."

if [ -d "$PLUGIN_PATH/.git" ] || [ -f "$PLUGIN_PATH/.git" ]; then
    cd "$PLUGIN_PATH"

    PLUGIN_CURRENT=$(get_current_version)
    info "当前插件版本: $PLUGIN_CURRENT"

    git fetch --tags 2>/dev/null
    PLUGIN_LATEST=$(get_latest_tag)

    if [ -z "$PLUGIN_LATEST" ]; then
        # 没有 Tag，拉取最新 main
        git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || warn "拉取失败"
        success "插件已更新到最新代码"
    else
        PLUGIN_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "")
        if [ "$PLUGIN_TAG" = "$PLUGIN_LATEST" ]; then
            success "插件已是最新版本 $PLUGIN_LATEST ✅"
        else
            git checkout "$PLUGIN_LATEST"
            success "插件已更新: $PLUGIN_CURRENT → $PLUGIN_LATEST"
        fi
    fi

    cd - > /dev/null
else
    warn "未找到插件子模块 ($PLUGIN_PATH)，跳过插件更新"
fi

# -------------------- 提交变更 --------------------
echo ""

# 检查是否有子模块指针变更
CHANGES=$(git diff --name-only "$FRAMEWORK_PATH" "$PLUGIN_PATH" 2>/dev/null || echo "")

if [ -n "$CHANGES" ]; then
    info "检测到子模块版本变更，建议提交："
    echo ""
    echo -e "  ${CYAN}git add $FRAMEWORK_PATH $PLUGIN_PATH${NC}"
    echo -e "  ${CYAN}git commit -m \"chore: 更新 framework 和插件到最新版本\"${NC}"
fi

# -------------------- 完成 --------------------
echo ""
echo "============================================"
echo -e "  ${GREEN}更新完成 ✅${NC}"
echo "============================================"
echo ""

cd "$FRAMEWORK_PATH" 2>/dev/null
FW_VER=$(get_current_version)
cd - > /dev/null

if [ -d "$PLUGIN_PATH/.git" ] || [ -f "$PLUGIN_PATH/.git" ]; then
    cd "$PLUGIN_PATH" 2>/dev/null
    PL_VER=$(get_current_version)
    cd - > /dev/null
else
    PL_VER="未安装"
fi

echo -e "  框架版本: ${GREEN}$FW_VER${NC}"
echo -e "  插件版本: ${GREEN}$PL_VER${NC}"
echo ""
