param(
    [string]$Version = "latest"
)

$REPO_URL = "https://github.com/USER/agent-shepherd.git"

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
Write-Host "Downloading Agent Shepherd$($Version ? " $Version" : "")..."

if ($Version -eq "latest") {
    & git clone --depth 1 "$REPO_URL" "$tempDir" 2>$null
} else {
    & git clone --depth 1 --branch "$Version" "$REPO_URL" "$tempDir" 2>$null
}

# Backup existing config/plugins if upgrading
$backupConfig = Join-Path $tempDir "config-backup"
$backupPlugins = Join-Path $tempDir "plugins-backup"

if (Test-Path (Join-Path $installDir "config")) {
    Write-Host "Backing up existing config..."
    Copy-Item (Join-Path $installDir "config") $backupConfig -Recurse -Force
}

if (Test-Path (Join-Path $installDir "plugins")) {
    Write-Host "Backing up existing plugins..."
    Copy-Item (Join-Path $installDir "plugins") $backupPlugins -Recurse -Force
}

# Remove old installation (preserve config/plugins/logs)
if (Test-Path $installDir) {
    Get-ChildItem $installDir | Where-Object {
        $_.Name -notin @('config', 'plugins', 'logs')
    } | Remove-Item -Recurse -Force
}

# Copy new installation
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item (Join-Path $tempDir ".agent-shepherd\*") $installDir -Recurse -Force

# Restore backups
if (Test-Path $backupConfig) {
    Copy-Item $backupConfig (Join-Path $installDir "config") -Recurse -Force
}
if (Test-Path $backupPlugins) {
    Copy-Item $backupPlugins (Join-Path $installDir "plugins") -Recurse -Force
}

# Store version
$Version | Out-File -FilePath (Join-Path $installDir "VERSION") -Encoding UTF8

# Install dependencies
Write-Host "Installing dependencies..."
Push-Location $installDir
& bun install
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
Write-Host "✅ Agent Shepherd installed!" -ForegroundColor Green
Write-Host ""
if ($installMode -notmatch "^[Ll]$") {
    Write-Host "Run 'ashep init' in your project to create local config."
}