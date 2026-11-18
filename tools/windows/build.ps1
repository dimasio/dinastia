# Сборка инсталлятора Dinastia для Windows (D-069, docs/guide/windows.md) — на Windows x64 из корня репозитория:
#   pwsh tools/windows/build.ps1 -Release 2026.11.18-abc1234
# Нужны: Node 24 + pnpm (corepack), Python 3.12, интернет (среды выполнения скачиваются один раз в out\windows\cache).
# Inno Setup 6 ставится через choco, если его нет. Результат — out\windows\DinastiaSetup-<версия>.exe.
# В CI — .github/workflows/windows.yml (там же проверка установкой: tools/windows/selftest.ps1).
param(
	[string]$Release = 'dev',
	[switch]$SkipInstall
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# версии сред выполнения — как у локального окружения (docker/compose.yml, .nvmrc)
$NodeVersion = '24.22.3'
$PgVersion = '18.6-1'
$WeedVersion = '4.48'
$MailpitVersion = 'v1.32.0'

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$out = Join-Path $root 'out\windows'
$stage = Join-Path $out 'stage'
$cache = Join-Path $out 'cache'
$runtime = Join-Path $stage 'runtime'
New-Item -ItemType Directory -Force $cache | Out-Null

function Step($text) { Write-Host "`n=== $text" -ForegroundColor Cyan }
function Exec([string]$cmd, [string[]]$argv) {
	& $cmd @argv
	if ($LASTEXITCODE -ne 0) { throw "$cmd $($argv -join ' '): код $LASTEXITCODE" }
}
function Fetch([string]$url, [string]$name) {
	$file = Join-Path $cache $name
	if (-not (Test-Path $file)) {
		Write-Host "скачивание $url"
		Invoke-WebRequest -Uri $url -OutFile "$file.part"
		Move-Item "$file.part" $file
	}
	return $file
}
function Unpack([string]$zip, [string]$name) {
	$dir = Join-Path $cache "x-$name"
	if (-not (Test-Path $dir)) {
		New-Item -ItemType Directory -Force "$dir.part" | Out-Null
		Exec 'tar' @('-xf', $zip, '-C', "$dir.part")  # bsdtar Windows — быстрее Expand-Archive
		Move-Item "$dir.part" $dir
	}
	return $dir
}

Step 'Приложение: API, воркер, миграции, сид, веб, шлюз'
Push-Location $root
try {
	if (-not $SkipInstall) { Exec 'pnpm' @('install', '--frozen-lockfile') }
	$env:APP_RELEASE = $Release
	Exec 'pnpm' @('windows:app')
} finally { Pop-Location }

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $runtime | Out-Null
Copy-Item -Recurse (Join-Path $out 'app') (Join-Path $stage 'app')

Step "Node $NodeVersion"
$nodeZip = Fetch "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip" "node-$NodeVersion.zip"
$nodeDir = Join-Path (Unpack $nodeZip "node-$NodeVersion") "node-v$NodeVersion-win-x64"
New-Item -ItemType Directory -Force "$runtime\node" | Out-Null
Copy-Item "$nodeDir\node.exe", "$nodeDir\LICENSE" "$runtime\node\"

Step "PostgreSQL $PgVersion"
$pgZip = Fetch "https://get.enterprisedb.com/postgresql/postgresql-$PgVersion-windows-x64-binaries.zip" "pgsql-$PgVersion.zip"
$pgDir = Join-Path (Unpack $pgZip "pgsql-$PgVersion") 'pgsql'
# только сервер и клиенты: без pgAdmin, StackBuilder, документации, заголовков и символов
foreach ($d in 'bin', 'lib', 'share') {
	Copy-Item -Recurse "$pgDir\$d" "$runtime\pgsql\$d"
}
Get-ChildItem "$runtime\pgsql" -Recurse -Include *.pdb, *.lib | Remove-Item -Force
# среда выполнения MSVC рядом с postgres.exe (app-local): на чистой Windows её может не быть
foreach ($dll in 'vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll') {
	if (-not (Test-Path "$runtime\pgsql\bin\$dll")) {
		Copy-Item "$env:SystemRoot\System32\$dll" "$runtime\pgsql\bin\"
	}
}

Step "SeaweedFS $WeedVersion"
$weedZip = Fetch "https://github.com/seaweedfs/seaweedfs/releases/download/$WeedVersion/windows_amd64.zip" "weed-$WeedVersion.zip"
New-Item -ItemType Directory -Force "$runtime\weed" | Out-Null
Copy-Item (Get-ChildItem (Unpack $weedZip "weed-$WeedVersion") -Recurse -Filter weed.exe | Select-Object -First 1).FullName "$runtime\weed\"

Step "Mailpit $MailpitVersion"
$mailZip = Fetch "https://github.com/axllent/mailpit/releases/download/$MailpitVersion/mailpit-windows-amd64.zip" "mailpit-$MailpitVersion.zip"
New-Item -ItemType Directory -Force "$runtime\mailpit" | Out-Null
Copy-Item (Get-ChildItem (Unpack $mailZip "mailpit-$MailpitVersion") -Recurse -Filter mailpit.exe | Select-Object -First 1).FullName "$runtime\mailpit\"

Step 'Chromium для PDF (playwright-core, та же версия, что у API)'
$env:PLAYWRIGHT_BROWSERS_PATH = "$runtime\browsers"
Exec "$runtime\node\node.exe" @("$stage\app\api\node_modules\playwright-core\cli.js", 'install', 'chromium-headless-shell')
Remove-Item Env:PLAYWRIGHT_BROWSERS_PATH

Step 'Лаунчер Dinastia.exe (PyInstaller)'
$venv = Join-Path $out 'venv'
if (-not (Test-Path "$venv\Scripts\python.exe")) { Exec 'python' @('-m', 'venv', $venv) }
$py = "$venv\Scripts\python.exe"
Exec $py @('-m', 'pip', 'install', '--disable-pip-version-check', '-q', '-r', "$PSScriptRoot\launcher\requirements.txt")
Exec $py @("$PSScriptRoot\launcher\make_icon.py", "$stage\dinastia.ico")
Exec $py @('-m', 'PyInstaller', '--noconfirm', '--clean', '--windowed', '--name', 'Dinastia',
	'--icon', "$stage\dinastia.ico", '--distpath', "$out\pyi", '--workpath', "$out\pyi-build", '--specpath', "$out\pyi-build",
	"$PSScriptRoot\launcher\dinastia.py")
Copy-Item -Recurse "$out\pyi\Dinastia\*" $stage

Step 'Инсталлятор (Inno Setup)'
$iscc = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe") |
	Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
	Exec 'choco' @('install', 'innosetup', '-y', '--no-progress')
	$iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
}
Get-ChildItem $out -Filter 'DinastiaSetup-*.exe' | Remove-Item -Force
Exec $iscc @("/DAppVersion=$Release", "/DStage=$stage", "/DOutDir=$out", "$PSScriptRoot\installer\dinastia.iss")

$setup = Get-ChildItem $out -Filter 'DinastiaSetup-*.exe' | Select-Object -First 1
$stageMb = [math]::Round(((Get-ChildItem $stage -Recurse -File | Measure-Object Length -Sum).Sum / 1MB))
Write-Host "`nготово: $($setup.FullName) — $([math]::Round($setup.Length / 1MB)) МБ (распакованно $stageMb МБ)" -ForegroundColor Green
