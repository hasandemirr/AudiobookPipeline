$jobs = @()
for ($i = 0; $i -lt 10; $i++) {
    $jobs += Start-Job -ScriptBlock {
        curl.exe -s -X PATCH http://localhost:5000/api/books/test-slug/sections/section_0001/narrate
    }
}
Wait-Job -Job $jobs
Receive-Job -Job $jobs
