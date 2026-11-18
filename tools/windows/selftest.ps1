# Проверка инсталлятора на чистой Windows (CI, .github/workflows/windows.yml; D-069): тихая установка в C:\Dinastia →
# `Dinastia.exe --selftest` (службы, вход слушателя АИР «Горизонт», PDF через Chromium) → второй запуск, как при обычном
# включении (миграции на готовой базе) → тихое удаление. Код ≠ 0 — логи в вывод.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$out = Join-Path $root 'out\windows'
$app = 'C:\Dinastia'
$logs = "$app\data\logs"

# хвосты логов — в вывод и в аннотации запуска (их видно и без входа в GitHub: API check-runs)
function Annotate([string]$title, [string[]]$lines) {
	$text = ($lines -join "`n") -replace '%', '%25' -replace "`r", '' -replace "`n", '%0A'
	if ($text.Length -gt 3800) { $text = $text.Substring($text.Length - 3800) }
	Write-Host "::error title=$title::$text"
}
function DumpLogs {
	if (Test-Path "$out\install.log") {
		$t = Get-Content "$out\install.log" -Tail 25
		Write-Host '--- install.log'; $t | Write-Host
		Annotate 'install.log' $t
	}
	Get-ChildItem $logs -Filter *.log -ErrorAction SilentlyContinue | ForEach-Object {
		$t = Get-Content $_.FullName -Tail 40
		Write-Host "--- $($_.Name)"; $t | Write-Host
		Annotate $_.Name $t
	}
}
function Run([string]$exe, [string[]]$argv, [string]$what) {
	$p = Start-Process -FilePath $exe -ArgumentList $argv -Wait -PassThru
	if ($p.ExitCode -ne 0) {
		DumpLogs
		throw "$what — код $($p.ExitCode)"
	}
	Write-Host "$what — ok" -ForegroundColor Green
}

$setup = (Get-ChildItem $out -Filter 'DinastiaSetup-*.exe' | Select-Object -First 1).FullName
Run $setup @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=$out\install.log") 'установка'
if (-not (Test-Path "$app\data\config.json")) { DumpLogs; throw 'установка: нет data\config.json — --setup не запускался' }
$cfg = Get-Content "$app\data\config.json" -Raw | ConvertFrom-Json
if (-not $cfg.setupDone) { DumpLogs; throw 'установка: --setup не завершился (setupDone = false)' }
Write-Host "порты: $($cfg.ports | ConvertTo-Json -Compress)"
Get-Content "$app\data\accounts.txt"

Run "$app\Dinastia.exe" @('--selftest') 'проверка после установки'
Run "$app\Dinastia.exe" @('--selftest') 'проверка повторного запуска'
# повторная установка поверх — как обновление: данные остаются, миграции применяются
Run $setup @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=$out\install.log") 'обновление'
Run "$app\Dinastia.exe" @('--selftest') 'проверка после обновления'
Write-Host '--- launcher.log'
Get-Content "$logs\launcher.log" -Tail 30
Run "$app\unins000.exe" @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') 'удаление'
