$body = @{username="brian";email="brian@example.com";password="test1234"}
$json = $body | ConvertTo-Json
Invoke-WebRequest -Uri http://localhost:3000/api/auth/signup -Method Post -Headers @{ "Content-Type" = "application/json" } -Body $json
