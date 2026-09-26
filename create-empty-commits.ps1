$ErrorActionPreference = 'Stop'
$authorName = git config user.name
$authorEmail = git config user.email
if (-not $authorName -or -not $authorEmail) { throw 'Git user.name and user.email must be configured.' }
$funnyMessages = @(
    'The Commit That Could Have Been a Slack Message',
    'Oops, All Commits',
    'Commit Happens',
    'Ctrl Z Is for Quitters',
    'It Works on My Machine',
    'Ship It and Blame the Compiler',
    'A Small Step for Git, a Giant Leap for My Graph',
    'Here Lies a Perfectly Good Afternoon',
    'The Code Gremlins Were Here',
    'No Bugs Were Harmed in This Commit',
    'Adding Absolutely Nothing, with Confidence',
    'This Commit Has No Feature, Only Vibes',
    'Git Happens to the Best of Us',
    'One Does Not Simply Make One Commit',
    'The Commitening',
    'A Wild Commit Appears',
    'Please Clap for This Empty Commit',
    'Technically Progress',
    'Proof That I Was Here',
    'Because the Graph Looked Lonely'
)
for ($i = 1; $i -le 1000; $i++) {
    $message = "$($funnyMessages[($i - 1) % $funnyMessages.Count]) #$i"
    $null = git -c user.name="$authorName" -c user.email="$authorEmail" commit --allow-empty --no-gpg-sign -m $message
    if ($LASTEXITCODE -ne 0) { throw "Commit $i failed (git exit code $LASTEXITCODE)." }
}
