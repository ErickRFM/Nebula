@echo off
set "CHROME_PATH=C:\Users\erik5\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe"
npx lighthouse http://localhost:3001 ^
  --chrome-path "%CHROME_PATH%" ^
  --output=json ^
  --output-path=./lighthouse-report-post.json
