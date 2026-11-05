#Requires -Version 7
<#
.SYNOPSIS
  Write process env RESEND_API_KEY into Oracle ~/pinata-private/app.env and recreate app.
.NOTES
  Never print the key. Call via Invoke-SecretScript.ps1 -ScrubEnv RESEND_API_KEY after
  injecting RESEND_API_KEY into the environment (bw get / secrets-mcp).
  Host: set PINATA_SSH_HOST (e.g. ubuntu@x.x.x.x from docs/private/oracle-host.md).
#>
$ErrorActionPreference = 'Stop'
$key = [Environment]::GetEnvironmentVariable('RESEND_API_KEY')
if ([string]::IsNullOrWhiteSpace($key) -or $key.Length -lt 8) {
  Write-Output 'ERROR missing_RESEND_API_KEY'
  exit 1
}
$hostSpec = $env:PINATA_SSH_HOST
if ([string]::IsNullOrWhiteSpace($hostSpec)) {
  Write-Output 'ERROR missing_PINATA_SSH_HOST'
  exit 1
}

# Key travels as env KEY_B64 on the remote only for this one-shot process — not via
# the same stdin as the script (that pipe already carries the decoded Python).
$keyB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($key))
$remotePy = @'
import base64, os, pathlib, re, subprocess, sys
raw = os.environ.get("KEY_B64", "")
try:
    key = base64.b64decode(raw.encode("ascii"), validate=True).decode("utf-8").rstrip("\n")
except Exception:
    print("ERROR bad_key"); raise SystemExit(1)
if len(key) < 8:
    print("ERROR bad_key"); raise SystemExit(1)
path = pathlib.Path.home() / "pinata-private" / "app.env"
text = path.read_text(encoding="utf-8") if path.exists() else ""
line = "RESEND_API_KEY=" + key
if re.search(r"(?m)^RESEND_API_KEY=", text):
    text = re.sub(r"(?m)^RESEND_API_KEY=.*$", line, text, count=1)
else:
    text = (text.rstrip() + "\n" + line + "\n") if text.strip() else (line + "\n")
path.write_text(text, encoding="utf-8")
path.chmod(0o600)
root = pathlib.Path.home() / "pinata" / "checkout"
envf = pathlib.Path.home() / "pinata-private" / "compose.env"
cmd = [
    "docker", "compose", "--project-directory", str(root), "--env-file", str(envf),
    "-f", "docs/deployment/docker-compose.oracle.yml", "up", "-d", "--force-recreate", "app",
]
r = subprocess.run(cmd, cwd=str(root), capture_output=True, text=True)
print("OK resync" if r.returncode == 0 else "ERROR recreate_failed")
raise SystemExit(r.returncode)
'@

$scriptB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remotePy))
# KEY_B64 is base64 of the secret; do not log argv. Scrub via Invoke-SecretScript.
$remoteCmd = "KEY_B64=$keyB64 python3 -c `"import base64,os; exec(base64.b64decode(os.environ['SCRIPT_B64']).decode())`" "
# Pass script via SCRIPT_B64 too so nothing secret-shaped lives only in shell history of KEY.
# Actually SCRIPT is not secret — keep SCRIPT_B64 in the same env for one process.
$remoteCmd = "SCRIPT_B64=$scriptB64 KEY_B64=$keyB64 python3 -c `"import base64,os; exec(base64.b64decode(os.environ['SCRIPT_B64']).decode())`""

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'ssh'
$psi.ArgumentList.Add('-o')
$psi.ArgumentList.Add('BatchMode=yes')
$psi.ArgumentList.Add($hostSpec)
$psi.ArgumentList.Add($remoteCmd)
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$p = [Diagnostics.Process]::Start($psi)
$stdout = $p.StandardOutput.ReadToEnd()
$stderr = $p.StandardError.ReadToEnd()
$p.WaitForExit(180000) | Out-Null
if ($stdout.Trim()) { Write-Output $stdout.Trim() }
if ($p.ExitCode -ne 0 -and $stderr) {
  Write-Output ("ERROR ssh_exit=" + $p.ExitCode)
}
exit $p.ExitCode
