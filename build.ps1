# Builds dist\InterviewGym\InterviewGym.exe  (run from the project root: .\build.ps1)
# Needs: Node, the backend venv with requirements.txt, requirements-tts.txt,
# requirements-stt.txt and requirements-build.txt installed, and the Kokoro + Whisper
# models already downloaded once (they are copied from the Hugging Face cache).
param([switch]$SkipFrontend)  # reuse frontend\out instead of rebuilding it
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$py = Join-Path $root "backend\.venv\Scripts\python.exe"

if (-not $SkipFrontend) {
Write-Host "1/4 Building the frontend (static export)..."
Push-Location (Join-Path $root "frontend")
$env:IG_EXPORT = "1"; $env:NEXT_PUBLIC_STATIC = "1"
npx next build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
Remove-Item Env:IG_EXPORT, Env:NEXT_PUBLIC_STATIC -ErrorAction SilentlyContinue
Pop-Location
}

Write-Host "2/4 Bundling the backend with PyInstaller..."
Push-Location (Join-Path $root "backend")
& $py -m PyInstaller launcher.py --name InterviewGym --noconfirm --clean --console `
  --distpath ..\dist --workpath ..\build\work --specpath ..\build --paths . `
  --collect-all kokoro --collect-all misaki --collect-all espeakng_loader --collect-all spacy `
  --collect-all en_core_web_sm --collect-all faster_whisper --collect-all ctranslate2 --collect-all av --collect-all language_tags --collect-all csvw --collect-all segments --collect-all phonemizer --collect-all rfc3986 `
  --collect-submodules uvicorn --collect-submodules app `
  --hidden-import uvicorn.logging --hidden-import uvicorn.loops.auto --hidden-import uvicorn.protocols.http.auto `
  --hidden-import uvicorn.protocols.websockets.auto --hidden-import uvicorn.lifespan.on
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }
Pop-Location

$out = Join-Path $root "dist\InterviewGym"
Write-Host "3/4 Adding the web files..."
Copy-Item (Join-Path $root "frontend\out") (Join-Path $out "web") -Recurse -Force

Write-Host "4/4 Adding the voice models (works offline)..."
$hub = Join-Path $env:USERPROFILE ".cache\huggingface\hub"
New-Item -ItemType Directory -Force (Join-Path $out "models") | Out-Null
Copy-Item $hub (Join-Path $out "models\hub") -Recurse -Force

Write-Host "Done: $out\InterviewGym.exe"
