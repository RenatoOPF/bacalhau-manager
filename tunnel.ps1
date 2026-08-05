while ($true) {
    ssh -N `
        -o "ServerAliveInterval=30" `
        -o "ServerAliveCountMax=3" `
        -o "ExitOnForwardFailure=yes" `
        -L 6379:localhost:6379 `
        -i C:\bacalhau-manager\keys\ssh-key-2026-07-09.key `
        ubuntu@137.131.162.0
    Start-Sleep -Seconds 5
}
