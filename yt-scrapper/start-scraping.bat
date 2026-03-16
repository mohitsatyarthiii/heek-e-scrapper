@echo off
REM YouTube Email Scraper - Quick Start Script
REM Just run this batch file to start scraping!

echo.
echo ====================================================
echo YouTube Email Scraper - Quick Start
echo ====================================================
echo.

REM Test server is running
echo Testing server...
curl -s http://localhost:3000/health >nul
if errorlevel 1 (
    echo ERROR: Server is not running on port 3000
    echo Please start the server first:
    echo   cd yt-scrapper
    echo   npm start
    pause
    exit /b 1
)

echo Server is running! ✓
echo.

REM Get user input
set /p keyword="Enter keyword to scrape (e.g., 'digital marketing agency'): "
set /p emails="Enter target number of emails (e.g., 500, default 100): "

if "%emails%"=="" set emails=100

echo.
echo Starting scraping job...
echo Keyword: %keyword%
echo Target Emails: %emails%
echo.

REM Start the job
for /f "tokens=*" %%i in ('powershell -Command "Invoke-WebRequest -Uri 'http://localhost:3000/api/scraper/jobs' -Method POST -Headers @{'Content-Type'='application/json'} -Body ('{\"keyword\":\"%keyword%\",\"targetEmails\":%emails%}') -UseBasicParsing | ConvertFrom-Json | Select-Object -ExpandProperty 'job' | Select-Object -ExpandProperty 'jobId'"') do set JOBID=%%i

if "%JOBID%"=="" (
    echo ERROR: Failed to create job
    pause
    exit /b 1
)

echo.
echo ✓ Job created successfully!
echo Job ID: %JOBID%
echo.

REM Show progress
echo Scraping in progress...
echo Checking status every 30 seconds...
echo (Press Ctrl+C to stop)
echo.

setlocal enabledelayedexpansion

set counter=0
:loop
set /a counter+=1

REM Check status
for /f "tokens=*" %%i in ('powershell -Command "Invoke-WebRequest -Uri 'http://localhost:3000/api/scraper/jobs/%JOBID%' -UseBasicParsing | ConvertFrom-Json | Select-Object -ExpandProperty 'job' | Select-Object -ExpandProperty 'progress' | ConvertTo-Json"') do (
    echo [!counter!] Progress Check at !date! !time!
)

timeout /t 30 /nobreak

goto loop

pause
