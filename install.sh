#!/bin/bash
# ============================================================
# Cocos Framework 一键安装脚本
# 将 cocos-framework 和 cocos-framework-plugin 作为
# Git Submodule 添加到当前 Cocos Creator 项目
# ============================================================

set -e

# -------------------- 配置 --------------------
FRAMEWORK_REPO="git@github.com:XY-TEAM-2023/cocos-framework.git"
FRAMEWORK_PATH="assets/framework"

PLUGIN_REPO="git@github.com:XY-TEAM-2023/cocos-framework-plugin.git"
PLUGIN_PATH="extensions/framework-plugin"

# -------------------- 颜色 --------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# -------------------- 前置检查 --------------------
echo ""
echo "============================================"
echo "  Cocos Framework 安装脚本"
echo "============================================"
echo ""

# 检查是否在 Git 仓库中
if [ ! -d ".git" ]; then
    error "当前目录不是 Git 仓库，请在 Cocos Creator 项目根目录下执行"
fi

# 检查是否是 Cocos Creator 项目
if [ ! -f "package.json" ]; then
    error "未找到 package.json，请确认当前目录是 Cocos Creator 项目"
fi

# 检查 git 命令
if ! command -v git &> /dev/null; then
    error "未找到 git 命令，请先安装 Git"
fi

info "当前目录: $(pwd)"
echo ""

# -------------------- 辅助函数 --------------------
# 清理残留的子模块目录，确保 git submodule add 可重复执行
cleanup_submodule() {
    local sm_path="$1"
    # 清理 .git/modules 中的残留目录
    if [ -d ".git/modules/$sm_path" ]; then
        warn "清理残留的 .git/modules/$sm_path"
        rm -rf ".git/modules/$sm_path"
    fi
    # 清理 .gitmodules 中的残留条目
    if [ -f ".gitmodules" ] && grep -q "path = $sm_path" .gitmodules 2>/dev/null; then
        git config -f .gitmodules --remove-section "submodule.$sm_path" 2>/dev/null || true
    fi
    # 清理 .git/config 中的残留条目
    git config --remove-section "submodule.$sm_path" 2>/dev/null || true
}

# -------------------- 安装框架 --------------------
info "步骤 1/3：安装框架子模块..."

if [ -d "$FRAMEWORK_PATH" ] && [ -f "$FRAMEWORK_PATH/.git" -o -d "$FRAMEWORK_PATH/.git" ]; then
    warn "框架子模块已存在于 $FRAMEWORK_PATH，跳过"
else
    # 清理可能残留的子模块信息（支持重复运行）
    cleanup_submodule "$FRAMEWORK_PATH"
    [ -d "$FRAMEWORK_PATH" ] && rm -rf "$FRAMEWORK_PATH"
    git submodule add --force "$FRAMEWORK_REPO" "$FRAMEWORK_PATH"
    success "框架子模块已添加到 $FRAMEWORK_PATH"
fi

# -------------------- 切换框架版本 --------------------
info "步骤 2/3：切换到最新稳定版本..."

cd "$FRAMEWORK_PATH"

# 获取最新的稳定版本 Tag（排除 pre-release）
git fetch --tags 2>/dev/null
LATEST_TAG=$(git tag -l 'v*' --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)

if [ -n "$LATEST_TAG" ]; then
    git checkout "$LATEST_TAG"
    success "已切换到框架版本 $LATEST_TAG"
else
    warn "未找到稳定版本 Tag，保持在默认分支"
fi

cd - > /dev/null

# -------------------- 安装插件 --------------------
info "步骤 3/3：安装编辑器插件子模块..."

# 确保 extensions 目录存在
mkdir -p extensions

if [ -d "$PLUGIN_PATH" ] && [ -f "$PLUGIN_PATH/.git" -o -d "$PLUGIN_PATH/.git" ]; then
    warn "插件子模块已存在于 $PLUGIN_PATH，跳过"
else
    cleanup_submodule "$PLUGIN_PATH"
    [ -d "$PLUGIN_PATH" ] && rm -rf "$PLUGIN_PATH"
    git submodule add --force "$PLUGIN_REPO" "$PLUGIN_PATH"
    success "插件子模块已添加到 $PLUGIN_PATH"
fi

# -------------------- 完成 --------------------
echo ""
echo "============================================"
echo -e "  ${GREEN}安装完成 ✅${NC}"
echo "============================================"
echo ""

if [ -n "$LATEST_TAG" ]; then
    echo -e "  框架版本: ${GREEN}$LATEST_TAG${NC}"
else
    echo -e "  框架版本: ${YELLOW}默认分支${NC}"
fi

echo -e "  框架路径: $FRAMEWORK_PATH"
echo -e "  插件路径: $PLUGIN_PATH"
echo ""
echo "  后续步骤："
echo "  1. 用 Cocos Creator 打开项目"
echo "  2. 通过菜单 [Framework] 管理框架版本"
echo ""
echo "  提交安装结果："
echo "  git add .gitmodules $FRAMEWORK_PATH $PLUGIN_PATH"
echo "  git commit -m \"feat: 引入 cocos-framework 和编辑器插件\""
echo ""
