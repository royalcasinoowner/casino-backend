@echo off
color 0B
echo ========================================
echo        Backend Quick Git Push Utility
echo ========================================
echo.

set "msg="
set /p msg="Enter commit message (or press Enter for 'Auto-commit update'): "
if "%msg%"=="" set "msg=Auto-commit update"

echo.
echo [1/3] Adding changes...
git add .

echo [2/3] Committing changes...
git commit -m "%msg%"

echo [3/3] Pushing to remote main branch (force overriding)...
git push origin HEAD:main --force

if %errorlevel% neq 0 (
    echo.
    color 0C
    echo ========================================
    echo  ERROR: Push failed! 
    echo  If this says "No configured push destination",
    echo  you need to add your GitHub repository URL:
    echo  git remote add origin YOUR_URL_HERE
    echo  git branch -M main
    echo  git push -u origin main
    echo ========================================
    pause
    exit /b %errorlevel%
)

echo.
color 0A
echo ========================================
echo        Success! Code Pushed.
echo ========================================
pause
