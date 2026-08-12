# Qahramon O'qituvchilar - Ustozlar Catalog: SAFE FINALIZE
# Repo root papkasida ishga tushiring: .\finalize-catalog.ps1
$ErrorActionPreference = 'Stop'

if (-not (Test-Path .\src)) {
    Write-Host 'XATO: src papkasi topilmadi.' -ForegroundColor Red
    exit 1
}

$intended = @(
    "src/application/ports/repositories/teacher.repository.port.ts",
    "src/infrastructure/db/repositories/teacher.repository.ts",
    "src/infrastructure/telegram/public-bot/keyboards/main-menu.keyboard.ts",
    "src/infrastructure/telegram/public-bot/router.ts",
    "src/index.ts",
    "src/application/dto/public-teacher-catalog.dto.ts",
    "src/application/use-cases/teacher/get-public-teacher-catalog.use-case.ts",
    "src/application/use-cases/teacher/get-public-teacher-profile.use-case.ts",
    "src/infrastructure/telegram/public-bot/handlers/catalog.handler.ts"
)

Write-Host "===== 1. git status =====" -ForegroundColor Cyan
git status

Write-Host "`n===== 2/3. Inspecting changed files vs intended list =====" -ForegroundColor Cyan
$modified = git diff --name-only
$untracked = git ls-files --others --exclude-standard
$allChanged = @($modified) + @($untracked) | Where-Object { $_ -ne "" }

$unexpected = $allChanged | Where-Object { $intended -notcontains $_ }
$missing = $intended | Where-Object { $allChanged -notcontains $_ }

if ($unexpected.Count -gt 0) {
    Write-Host "OGOHLANTIRISH: Kutilmagan o'zgarishlar topildi (bular commit qilinmaydi):" -ForegroundColor Yellow
    $unexpected | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}
if ($missing.Count -gt 0) {
    Write-Host "XATO: Kutilgan fayllardan ba'zilari o'zgarmagan deb ko'rinmoqda:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host "To'xtatildi. Commit qilinmadi." -ForegroundColor Red
    exit 1
}

Write-Host "`n===== 4a. npx tsc --noEmit =====" -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "XATO: tsc muvaffaqiyatsiz. Commit qilinmadi." -ForegroundColor Red
    exit 1
}

Write-Host "`n===== 4b. git diff --check =====" -ForegroundColor Cyan
git diff --check
if ($LASTEXITCODE -ne 0) {
    Write-Host "XATO: git diff --check muvaffaqiyatsiz. Commit qilinmadi." -ForegroundColor Red
    exit 1
}

Write-Host "`n===== 5. Committing ONLY the 9 intended files =====" -ForegroundColor Cyan
git add -- $intended
git commit -m "feat: public Ustozlar catalog"

Write-Host "`n===== DONE =====" -ForegroundColor Green
Write-Host "COMMIT HASH:"
git rev-parse HEAD
Write-Host "FILES IN COMMIT:"
git show --stat --format="" HEAD
