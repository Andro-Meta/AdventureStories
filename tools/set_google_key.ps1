# set_google_key.ps1 - paste a free Google AI Studio key into .env without it
# showing on screen. Run once per key:
#   powershell -File tools\set_google_key.ps1        -> GOOGLE_AI_KEY   (used first)
#   powershell -File tools\set_google_key.ps1 2      -> GOOGLE_AI_KEY_2 (second account, optional)
param([string]$Slot = '1')
$name = if ($Slot -eq '2') { 'GOOGLE_AI_KEY_2' } else { 'GOOGLE_AI_KEY' }
$envFile = Join-Path $PSScriptRoot '..\.env'
$secure = Read-Host "Paste your Google AI Studio key for $name (input is hidden), then press Enter" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

if ($key -notmatch '^AIza[0-9A-Za-z_\-]{30,}$') {
    Write-Host 'That does not look like a Google AI Studio key (should start with AIza). Nothing saved.' -ForegroundColor Red
    exit 1
}

$lines = @(Get-Content $envFile | Where-Object { $_ -notmatch "^$name=" })
$lines += "$name=$key"
Set-Content -Path $envFile -Value $lines -Encoding ascii
Write-Host ("Saved to .env as {0}: {1}...{2}" -f $name, $key.Substring(0, 6), $key.Substring($key.Length - 3)) -ForegroundColor Green
