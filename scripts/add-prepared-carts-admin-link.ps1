$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$filePath = Join-Path $projectRoot "app\admin\page.tsx"
$backupPath = "$filePath.before-prepared-carts-link.bak"

if (-not (Test-Path -LiteralPath $filePath)) {
    throw "File not found: $filePath"
}

$content = [System.IO.File]::ReadAllText($filePath)

if ($content.Contains('/admin/bestandskunden-warenkoerbe')) {
    Write-Host "The admin link already exists. No change required." -ForegroundColor Yellow
    exit 0
}

$oldBlock = @'
          <div className="mb-4 flex justify-end">
            <AdminLogoutButton />
          </div>
'@

$newBlock = @'
          <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
            <Link
              href="/admin/bestandskunden-warenkoerbe"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] px-4 py-3 text-sm font-black text-[#12395F] transition hover:border-[#12395F] hover:bg-white"
            >
              <ShoppingBasket className="h-4 w-4" />
              Vorbereitete Warenk&ouml;rbe
            </Link>

            <AdminLogoutButton />
          </div>
'@

if (-not $content.Contains($oldBlock)) {
    throw "Expected header block was not found. The file was not changed."
}

Copy-Item -LiteralPath $filePath -Destination $backupPath -Force

$updated = $content.Replace($oldBlock, $newBlock)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

[System.IO.File]::WriteAllText(
    $filePath,
    $updated,
    $utf8NoBom
)

Write-Host ""
Write-Host "Prepared carts link added to the admin start page." -ForegroundColor Green
Write-Host "Backup: $backupPath" -ForegroundColor Yellow