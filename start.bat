@echo off
chcp 65001 >nul 2>&1
title 智慧课堂 - Class Assistant

echo.
echo   ╔══════════════════════════════════════╗
echo   ║       智慧课堂 Class Assistant       ║
echo   ╚══════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [!] 未检测到 Node.js，请先安装 Node.js 18+
    echo       下载地址: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Show Node version
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo   [OK] Node.js %NODE_VER%

:: Check if node_modules exists
if not exist "node_modules" (
    echo.
    echo   [..] 首次运行，正在安装依赖（约 1-2 分钟）...
    call npm install
    if %errorlevel% neq 0 (
        echo   [!] 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
    echo   [OK] 依赖安装完成
)

:: Check Playwright
if not exist "node_modules\playwright-core\.local-browsers" (
    echo.
    echo   [..] 首次运行，正在下载浏览器（约 100MB）...
    call npx playwright install chromium
    if %errorlevel% neq 0 (
        echo   [!] 浏览器下载失败，请检查网络连接
        pause
        exit /b 1
    )
    echo   [OK] 浏览器下载完成
)

:: Create .env from defaults if not exists
if not exist ".env" (
    copy ".env.default" ".env" >nul 2>&1
    echo   [OK] 已创建默认配置
)

echo.
echo   [>>] 正在启动...
echo   [>>] 面板地址: http://127.0.0.1:3000
echo   [>>] 浏览器窗口将自动打开，请在其中登录雨课堂
echo.
echo   提示: 按 Ctrl+C 停止程序
echo   ─────────────────────────────────────────
echo.

node src/server.js

if %errorlevel% neq 0 (
    echo.
    echo   [!] 程序异常退出
    pause
)
