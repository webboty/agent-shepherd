#!/bin/bash
set -e

# Check if --auto flag was passed for automated testing
AUTO_MODE=false
VERSION="latest"

# Parse arguments
for arg in "$@"; do
  if [[ "$arg" = "--auto" ]]; then
    AUTO_MODE=true
  elif [[ "$VERSION" = "latest" ]]; then
    VERSION="$arg"
  fi
done

REPO_URL="https://github.com/webboty/agent-shepherd.git"

echo "Agent Shepherd Installer"
echo "========================"

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

# Check if Agent Shepherd is already installed
if [ -d "$INSTALL_DIR" ]; then
  echo ""
  echo "⚠️  Agent Shepherd is already installed in: $INSTALL_DIR"
  echo ""
  echo "What would you like to do?"
  echo ""
  echo "   [U] Update to latest version (recommended)"
  echo "       Keeps your config and plugins intact"
  echo "       Updates CLI with latest changes"
  echo ""
  echo "   [F] Fresh installation"
  echo "       Removes all existing files and reinstalls clean"
  echo "       Creates fresh Agent Shepherd with latest CLI"
  echo ""
  if [ "$AUTO_MODE" = true ]; then
    read -t 5 -p "> " UPDATE_OR_FRESH
  else
    read -p "> " UPDATE_OR_FRESH
  fi
  
  # Set action message based on user choice
  if [[ "$UPDATE_OR_FRESH" =~ ^[Uu]$ ]]; then
    UPDATE_ACTION="Updated"
  else
    UPDATE_ACTION="Freshly installed"
  fi
else
  echo "Fresh installation..."
  echo ""
  UPDATE_ACTION="Freshly installed"
  UPDATE_OR_FRESH="F"
fi

# Backup existing config/plugins if upgrading (only on update, not fresh install)
if [[ "$UPDATE_OR_FRESH" =~ ^[Uu]$ ]]; then
  if [ -d "$INSTALL_DIR/config" ]; then
    echo "Backing up existing config..."
    cp -r "$INSTALL_DIR/config" "$TEMP_DIR/config-backup"
  fi
  if [ -d "$INSTALL_DIR/plugins" ]; then
    echo "Backing up existing plugins..."
    cp -r "$INSTALL_DIR/plugins" "$TEMP_DIR/plugins-backup"
  fi
fi

# Remove old installation (only if directory exists)
if [ -d "$INSTALL_DIR" ]; then
  if [[ "$UPDATE_OR_FRESH" =~ ^[Ff]$ ]]; then
    # Fresh install: remove everything including config, plugins, logs
    find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  else
    # Update: keep config, plugins, logs
    find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
      ! -name 'config' ! -name 'plugins' ! -name 'logs' \
      -exec rm -rf {} +
  fi
fi

# Copy new installation
mkdir -p "$INSTALL_DIR"
cp -r "$TEMP_DIR/.agent-shepherd/"* "$INSTALL_DIR/"

# Restore backups and install
if [[ "$UPDATE_OR_FRESH" =~ ^[Uu]$ ]]; then
  # Update mode: restore backups
  if [ -d "$TEMP_DIR/config-backup" ]; then
    cp -r "$TEMP_DIR/config-backup" "$INSTALL_DIR/config"
  fi
  if [ -d "$TEMP_DIR/plugins-backup" ]; then
    cp -r "$TEMP_DIR/plugins-backup" "$INSTALL_DIR/plugins"
  fi
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
else
  # Fresh install mode: full installation
  echo "Installing dependencies..."
  cd "$INSTALL_DIR"
  bun install
  # Link globally if requested
  if [[ "$LINK_MODE" =~ ^[Gg]$ ]]; then
    echo "Linking ashep command globally..."
    bun link
  fi
fi

# Cleanup
rm -rf "$TEMP_DIR"
echo ""
echo "✅ Agent Shepherd ${UPDATE_ACTION}!"
echo ""
if [[ ! "$INSTALL_MODE" =~ ^[Ll]$ ]]; then
  echo "Run 'ashep init' in your project to create local config."
fi
