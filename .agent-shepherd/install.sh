#!/bin/bash
set -e
VERSION="${1:-latest}"
REPO_URL="https://github.com/USER/agent-shepherd.git"
echo "Agent Shepherd Installer"
echo "========================
"

echo "1. Where should Agent Shepherd be installed?"
echo ""
echo "   [H] Hybrid (recommended)"
echo "       Binary: ~/.agent-shepherd/"
echo "       Config: per-project (./.agent-shepherd/config/)"
echo ""
echo "   [L] Local (self-contained)"
echo "       Everything: ./.agent-shepherd/"
echo ""
read -p "> " INSTALL_MODE
if [[ "$INSTALL_MODE" =~ ^[Ll]$ ]]; then
  INSTALL_DIR="$(pwd)/.agent-shepherd"
  echo "Installing locally to: $INSTALL_DIR"
else
  INSTALL_DIR="$HOME/.agent-shepherd"
  echo "Installing globally to: $INSTALL_DIR"
fi
echo ""
echo "2. How do you want to run 'ashep'?"
echo ""
echo "   [G] Global link (recommended)"
echo "       Run 'ashep' from anywhere"
echo ""
echo "   [N] No global link"
echo "       Run via: bunx ashep"
echo ""
read -p "> " LINK_MODE
# Clone to temp
TEMP_DIR=$(mktemp -d)
echo ""
echo "Downloading Agent Shepherd${VERSION:+ $VERSION}..."
if [ "$VERSION" = "latest" ]; then
  git clone --depth 1 "$REPO_URL" "$TEMP_DIR" 2>/dev/null
else
  git clone --depth 1 --branch "$VERSION" "$REPO_URL" "$TEMP_DIR" 2>/dev/null
fi
# Backup existing config/plugins if upgrading
if [ -d "$INSTALL_DIR/config" ]; then
  echo "Backing up existing config..."
  cp -r "$INSTALL_DIR/config" "$TEMP_DIR/config-backup"
fi
if [ -d "$INSTALL_DIR/plugins" ]; then
  echo "Backing up existing plugins..."
  cp -r "$INSTALL_DIR/plugins" "$TEMP_DIR/plugins-backup"
fi
# Remove old installation (preserve config/plugins/logs)
if [ -d "$INSTALL_DIR" ]; then
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
    ! -name 'config' ! -name 'plugins' ! -name 'logs' \
    -exec rm -rf {} +
fi
# Copy new installation
mkdir -p "$INSTALL_DIR"
cp -r "$TEMP_DIR/.agent-shepherd/"* "$INSTALL_DIR/"
# Restore backups
[ -d "$TEMP_DIR/config-backup" ] && cp -r "$TEMP_DIR/config-backup" "$INSTALL_DIR/config"
[ -d "$TEMP_DIR/plugins-backup" ] && cp -r "$TEMP_DIR/plugins-backup" "$INSTALL_DIR/plugins"
# Store version
echo "$VERSION" > "$INSTALL_DIR/VERSION"
# Install dependencies
echo "Installing dependencies..."
cd "$INSTALL_DIR"
bun install
# Link globally if requested
if [[ "$LINK_MODE" =~ ^[Gg]$ ]]; then
  echo "Linking ashep command globally..."
  bun link
fi
# Cleanup
rm -rf "$TEMP_DIR"
echo ""
echo "✅ Agent Shepherd installed!"
echo ""
if [[ ! "$INSTALL_MODE" =~ ^[Ll]$ ]]; then
  echo "Run 'ashep init' in your project to create local config."
fi