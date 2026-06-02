# Start Vite in a new PowerShell window, then run the Rust backend in this window.
# Usage: Open PowerShell in the repo root and run: .\dev.ps1

$viteCmd = "npm --prefix frontend run dev"
Write-Host "Starting Vite dev server in a new window..."
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $viteCmd

# Give Vite a moment to start (optional)
Start-Sleep -Seconds 1

# Tell the Rust build script and server to use the running Vite dev server.
$env:VITE_DEV_SERVER = "http://localhost:5173"
Write-Host "Running cargo run (backend). VITE_DEV_SERVER=$env:VITE_DEV_SERVER"

cargo run
