@echo off
REM ============================================================
REM  Compile CKD_Chatbot_Report.tex to PDF
REM  Requires MiKTeX or TeX Live installed on this machine.
REM  Download MiKTeX: https://miktex.org/download
REM ============================================================

cd /d "%~dp0"

echo [1/2] First pass...
pdflatex -interaction=nonstopmode CKD_Chatbot_Report.tex
if ERRORLEVEL 1 (
    echo ERROR: pdflatex failed on first pass. Check the log above.
    pause
    exit /b 1
)

echo [2/2] Second pass (resolving cross-references)...
pdflatex -interaction=nonstopmode CKD_Chatbot_Report.tex
if ERRORLEVEL 1 (
    echo ERROR: pdflatex failed on second pass.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  SUCCESS: CKD_Chatbot_Report.pdf has been generated.
echo ============================================================
pause
