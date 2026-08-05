# Robustece a tarefa Redis-SSH-Tunnel: além de "ao logon", passa a rodar também
# na inicialização do Windows e a cada 5 min (self-heal caso a sessão SSH caia
# sem que o usuário faça um novo logon interativo, ex.: após dormir/acordar).
# Execute como Administrador.

$ErrorActionPreference = "Stop"

$existingLogon = New-ScheduledTaskTrigger -AtLogOn -User "Carol"
$startup       = New-ScheduledTaskTrigger -AtStartup
$repeat        = New-ScheduledTaskTrigger -Once -At (Get-Date "2026-08-05T00:00:00") `
                    -RepetitionInterval (New-TimeSpan -Minutes 5) `
                    -RepetitionDuration (New-TimeSpan -Days 3650)

Set-ScheduledTask -TaskName "Redis-SSH-Tunnel" -Trigger @($existingLogon, $startup, $repeat)

Write-Host "Triggers atualizados:"
Get-ScheduledTask -TaskName "Redis-SSH-Tunnel" | Select-Object -ExpandProperty Triggers |
    Format-Table CimClass, Enabled, StartBoundary -AutoSize

Write-Host "MultipleInstances policy (deve ser IgnoreNew para não duplicar o túnel):"
Get-ScheduledTask -TaskName "Redis-SSH-Tunnel" | Select-Object -ExpandProperty Settings |
    Select-Object MultipleInstances
