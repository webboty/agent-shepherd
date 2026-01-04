param(
    [string]$Version = "latest"
)

$REPO_URL = "https://github.com/webboty/agent-shepherd.git"

Write-Host "Agent Shepherd Installer" -ForegroundColor Green
Write-Host "========================" -ForegroundColor Green
Write-Host ""

Write-Host "1. Where should Agent Shepherd be installed?"
Write-Host ""
Write-Host "   [H] Hybrid (recommended)" -ForegroundColor Yellow
Write-Host "       Binary: ~/.agent-shepherd/"
Write-Host "       Config: per-project (./.agent-shepherd/config/)"
Write-Host ""
Write-Host "   [L] Local (self-contained)" -ForegroundColor Yellow
Write-Host "       Everything: ./.agent-shepherd/"
Write-Host ""

$installMode = Read-Host "> "
if ($installMode -match "^[Ll]$") {
    $installDir = Join-Path (Get-Location) ".agent-shepherd"
    Write-Host "Installing locally to: $installDir"
} else {
    $installDir = Join-Path $env:USERPROFILE ".agent-shepherd"
    Write-Host "Installing globally to: $installDir"
}

Write-Host ""
Write-Host "2. How do you want to run 'ashep'?"
Write-Host ""
Write-Host "   [G] Global link (recommended)" -ForegroundColor Yellow
Write-Host "       Run 'ashep' from anywhere"
Write-Host ""
Write-Host "   [N] No global link" -ForegroundColor Yellow
Write-Host "       Run via: bunx ashep"
Write-Host ""

$linkMode = Read-Host "> "

# Create temp directory
$tempDir = New-TemporaryFile | %{ $_.DirectoryName + "\agent-shepherd-temp-" + [guid]::NewGuid().ToString() }
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

Write-Host ""
$versionText = if ($Version -ne "latest") { " $Version" } else { "" }
Write-Host "Downloading Agent Shepherd$versionText..."

if ($Version -eq "latest") {
    & git clone --depth 1 "$REPO_URL" "$tempDir" 2>$null
} else {
    & git clone --depth 1 --branch "$Version" "$REPO_URL" "$tempDir" 2>$null
}

# Check if Agent Shepherd is already installed
if (Test-Path $installDir) {
    Write-Host ""
    Write-Host "⚠️  Agent Shepherd is already installed in: $installDir" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "What would you like to do?"
    Write-Host ""
    Write-Host "   [U] Update to latest version (recommended)" -ForegroundColor Yellow
    Write-Host "       Keeps your config and plugins intact"
    Write-Host "       Updates CLI with latest changes"
    Write-Host ""
    Write-Host "   [F] Fresh installation" -ForegroundColor Yellow
    Write-Host "       Removes all existing files and reinstalls clean"
    Write-Host "       Creates fresh Agent Shepherd with latest CLI"
    Write-Host ""

    $updateOrFresh = Read-Host "> "

    # Set action message based on user choice
    if ($updateOrFresh -match "^[Uu]$") {
        $updateAction = "Updated"
    } else {
        $updateAction = "Freshly installed"
    }
} else {
    Write-Host "Fresh installation..."
    Write-Host ""
    $updateAction = "Freshly installed"
    $updateOrFresh = "F"
}

# Backup existing config/plugins if upgrading
$backupConfig = Join-Path $tempDir "config-backup"
$backupPlugins = Join-Path $tempDir "plugins-backup"

if ($updateOrFresh -match "^[Uu]$") {
    if (Test-Path (Join-Path $installDir "config")) {
        Write-Host "Backing up existing config..."
        Copy-Item (Join-Path $installDir "config") $backupConfig -Recurse -Force
    }

    if (Test-Path (Join-Path $installDir "plugins")) {
        Write-Host "Backing up existing plugins..."
        Copy-Item (Join-Path $installDir "plugins") $backupPlugins -Recurse -Force
    }
}

# Remove old installation
if (Test-Path $installDir) {
    if ($updateOrFresh -match "^[Ff]$") {
        # Fresh install: remove everything including config, plugins, logs
        Get-ChildItem $installDir | Remove-Item -Recurse -Force
    } else {
        # Update: preserve config, plugins, logs
        Get-ChildItem $installDir | Where-Object {
            $_.Name -notin @('config', 'plugins', 'logs')
        } | Remove-Item -Recurse -Force
    }
}

# Copy new installation
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item (Join-Path $tempDir ".agent-shepherd\*") $installDir -Recurse -Force

# Restore backups (only on update)
if ($updateOrFresh -match "^[Uu]$") {
    if (Test-Path $backupConfig) {
        # Copy contents of backup, not the directory itself
        Get-ChildItem $backupConfig | ForEach-Object {
            Copy-Item $_.FullName (Join-Path $installDir "config") -Recurse -Force
        }
    }
    if (Test-Path $backupPlugins) {
        # Copy contents of backup, not the directory itself
        Get-ChildItem $backupPlugins | ForEach-Object {
            Copy-Item $_.FullName (Join-Path $installDir "plugins") -Recurse -Force
        }
    }
    # Store version
    $Version | Out-File -FilePath (Join-Path $installDir "VERSION") -Encoding UTF8
}

# Install dependencies
Write-Host "Installing dependencies..."
Push-Location $installDir
& bun install

# Rebuild binary to ensure latest code is used
Write-Host "Building CLI binary..."
& bun run build

Pop-Location

# Link globally if requested
if ($linkMode -match "^[Gg]$") {
    Write-Host "Linking ashep command globally..."
    Push-Location $installDir
    & bun link
    Pop-Location
}

# Cleanup
Remove-Item $tempDir -Recurse -Force

Write-Host ""
Write-Host "✅ Agent Shepherd $updateAction!" -ForegroundColor Green
Write-Host ""
if ($installMode -notmatch "^[Ll]$") {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    Write-Host "  🎯 NEXT STEP"
    Write-Host ""
    Write-Host "  Run 'ashep init' in your project"
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}
