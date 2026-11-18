; Инсталлятор Dinastia для Windows (D-069, docs/guide/windows.md). Собирает tools/windows/build.ps1:
;   ISCC /DAppVersion=<версия> /DStage=<out\windows\stage> /DOutDir=<out\windows> dinastia.iss
; Ставит в C:\Dinastia без прав администратора (путь — латиницей: PostgreSQL), запускает `Dinastia.exe --setup` — база,
; роли, хранилище, миграции, учебный центр АИР «Горизонт». Повторная установка — обновление: программа заменяется,
; data\ (база, файлы, письма, логи, пароли) остаётся, новые миграции применяются. Удаление спрашивает, удалять ли data\.

#ifndef AppVersion
  #define AppVersion "dev"
#endif
#ifndef Stage
  #define Stage "..\..\..\out\windows\stage"
#endif
#ifndef OutDir
  #define OutDir "..\..\..\out\windows"
#endif

[Setup]
AppId={{8C1F3E5A-4B7D-4E2A-9F61-2D3C5B7A9E10}
AppName=Dinastia
AppVersion={#AppVersion}
AppVerName=Dinastia {#AppVersion}
AppPublisher=Dinastia
DefaultDirName=C:\Dinastia
UsePreviousAppDir=yes
DefaultGroupName=Dinastia
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir={#OutDir}
OutputBaseFilename=DinastiaSetup-{#AppVersion}
SetupIconFile={#Stage}\dinastia.ico
UninstallDisplayIcon={app}\Dinastia.exe
UninstallDisplayName=Dinastia
Compression=lzma2/normal
SolidCompression=yes
LZMANumBlockThreads=4
WizardStyle=modern
CloseApplications=no
DiskSpanning=no

[Languages]
Name: "ru"; MessagesFile: "compiler:Languages\Russian.isl"

[Tasks]
Name: "desktopicon"; Description: "Ярлык на рабочем столе"; GroupDescription: "Ярлыки:"

[InstallDelete]
; программа — заново целиком (старые чанки и пакеты не копятся); data\ не трогаем
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{app}\_internal"

[Files]
Source: "{#Stage}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\data"

[Icons]
Name: "{autoprograms}\Dinastia"; Filename: "{app}\Dinastia.exe"; Comment: "Учебный центр АИР «Горизонт»"
Name: "{autodesktop}\Dinastia"; Filename: "{app}\Dinastia.exe"; Comment: "Учебный центр АИР «Горизонт»"; Tasks: desktopicon

[Run]
Filename: "{app}\Dinastia.exe"; Description: "Запустить Dinastia"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{app}\Dinastia.exe"; Parameters: "--stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopDinastia"

[Code]
function IsAsciiPath(const S: String): Boolean;
var
  I: Integer;
begin
  Result := True;
  for I := 1 to Length(S) do
    if (Ord(S[I]) > 127) or (S[I] = ' ') then
    begin
      Result := False;
      Exit;
    end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = wpSelectDir) and not IsAsciiPath(WizardDirValue) then
  begin
    MsgBox('Путь установки — только латиницей и без пробелов (например, C:\Dinastia): база данных PostgreSQL ' +
      'не работает с такими путями.', mbError, MB_OK);
    Result := False;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Result := '';
  // обновление: остановить запущенную платформу прежней версии
  if FileExists(ExpandConstant('{app}\Dinastia.exe')) then
    Exec(ExpandConstant('{app}\Dinastia.exe'), '--stop', '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
begin
  if CurStep <> ssPostInstall then
    Exit;
  WizardForm.StatusLabel.Caption := 'База данных, хранилище и демо-данные учебного центра (1–3 минуты)…';
  WizardForm.ProgressGauge.Style := npbstMarquee;
  try
    if not Exec(ExpandConstant('{app}\Dinastia.exe'), '--setup', '', SW_HIDE, ewWaitUntilTerminated, Code) then
      Code := -1;
  finally
    WizardForm.ProgressGauge.Style := npbstNormal;
  end;
  if Code <> 0 then
    SuppressibleMsgBox('Программа установлена, но подготовить базу данных не удалось (код ' + IntToStr(Code) + ').' + #13#10 +
      'Запустите Dinastia — лаунчер повторит подготовку. Подробности: ' +
      ExpandConstant('{app}\data\logs\launcher.log'), mbError, MB_OK, IDOK);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  // тихое удаление (CI) данные оставляет
  if (CurUninstallStep = usPostUninstall) and DirExists(ExpandConstant('{app}\data')) and not UninstallSilent then
    if MsgBox('Удалить и данные — базу, загруженные файлы, письма и логи?' + #13#10 +
      'Нет — они останутся в ' + ExpandConstant('{app}\data') + ' и подхватятся при новой установке.',
      mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      DelTree(ExpandConstant('{app}'), True, True, True);
end;
