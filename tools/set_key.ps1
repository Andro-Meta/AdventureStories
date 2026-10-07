# set_key.ps1 - paste your OpenRouter key into .env without it showing on screen.
$envFile = Join-Path $PSScriptRoot '..\.env'
$secure = Read-Host 'Paste your OpenRouter key (input is hidden), then press Enter' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

if ($key -notmatch '^sk-or-v1-[A-Za-z0-9]+$') {
    Write-Host 'That does not look like an OpenRouter key (should start with sk-or-v1-). Nothing saved.' -ForegroundColor Red
    exit 1
}

$lines = Get-Content $envFile | Where-Object { $_ -notmatch '^OPENROUTER_API_KEY=' }
$lines += "OPENROUTER_API_KEY=$key"
Set-Content -Path $envFile -Value $lines -Encoding ascii
Write-Host ("Saved to .env: {0}...{1}" -f $key.Substring(0, 12), $key.Substring($key.Length - 3)) -ForegroundColor Green
