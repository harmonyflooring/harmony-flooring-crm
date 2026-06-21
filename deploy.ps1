cd "C:\Users\user\Desktop\Harmonay Flooring App"
git add .
git commit -m "Update CRM - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git push
Write-Host ""
Write-Host "Deployed! Netlify will update in ~30 seconds." -ForegroundColor Green
