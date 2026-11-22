@echo off
rem Abre o sistema Nexos no Google Chrome, no perfil "Ever" (pasta Default), no endereco publico (o mesmo do celular).
rem Sem o Chrome instalado, abre no navegador padrao. Precisa de internet. O login e os dados sao os mesmos em qualquer aparelho.
set "NEXOS=https://aquecerandroi-oss.github.io/nexos/"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --profile-directory="Default" "%NEXOS%"
) else (
  start "" "%NEXOS%"
)
