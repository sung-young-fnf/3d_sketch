import { PLAN_PROMPT, PLAN_SCHEMA } from "@/lib/vmd-plan";

export const dynamic = "force-dynamic";

/**
 * 연출표 AI 도우미 for people who open this server from another PC (http://<server ip>:3939): the analysis must run on
 * THEIR Claude Code (their own subscription), not the server's. The page shows a line to paste into PowerShell:
 *   irm http://<server>/api/vmd-plan/helper?t=<token> | iex
 * The script asks ../relay for work under that browser's token, runs `claude -p` (no tools) on the brief and posts
 * claude's JSON back - the same call ../route.ts makes on the server's own PC. Nothing listens on their PC.
 */
export async function GET(request: Request) {
  const t = new URL(request.url).searchParams.get("t") ?? "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) return new Response("token missing", { status: 400 });
  const host = request.headers.get("host") ?? "localhost:3939";
  const origin = `${new URL(request.url).protocol}//${host}`;
  const schema = JSON.stringify(PLAN_SCHEMA);
  // function replacers: the texts go in as they are ($ patterns not expanded)
  const script = TEMPLATE.replace("__SERVER__", () => origin)
    .replace("__TOKEN__", () => t)
    .replace("__PROMPT__", () => PLAN_PROMPT)
    .replace("__SCHEMA__", () => schema);
  return new Response(script, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

const TEMPLATE = String.raw`# 매장연출 연출표 AI 도우미 - 이 PC 의 Claude Code(본인 구독)로 연출표를 분석합니다. 이 창을 닫으면 끝납니다.
$Server = '__SERVER__'
$Token = '__TOKEN__'
$Prompt = @'
__PROMPT__
'@
$Schema = @'
__SCHEMA__
'@
$NL = [string][char]10
$Claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $Claude) {
  $p = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
  if (Test-Path $p) { $Claude = $p }
}
if (-not $Claude) {
  Write-Host 'Claude Code(claude) 를 찾지 못했습니다. 설치하고 터미널에서 claude 로 로그인한 뒤 다시 실행하세요.' -ForegroundColor Red
  return
}
function Invoke-Claude([string]$argline, [string]$stdin) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Claude
  $psi.Arguments = $argline
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
  $psi.WorkingDirectory = $env:TEMP
  $psi.CreateNoWindow = $true
  $proc = [System.Diagnostics.Process]::Start($psi)
  if ($stdin) {
    $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($stdin)
    $proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  }
  $proc.StandardInput.Close()
  $out = $proc.StandardOutput.ReadToEnd()
  $proc.WaitForExit()
  return $out
}
$Version = (Invoke-Claude '--version' '').Trim()
$SchemaArg = '"' + (($Schema -replace '\s+', ' ') -replace '"', '\"') + '"'
$Ask = "$Server/api/vmd-plan/relay?t=$Token&wait=1&v=" + [uri]::EscapeDataString($Version)
Write-Host "연출표 AI 도우미 실행 중 - Claude Code $Version" -ForegroundColor Green
Write-Host "서버 $Server 에 연결했습니다. 이 창을 열어 둔 채로 웹에서 'AI 로 벽장 연결' 을 누르세요."
while ($true) {
  try {
    $r = Invoke-RestMethod -Uri $Ask -TimeoutSec 60
  } catch {
    Write-Host ('서버 연결 재시도... ' + $_.Exception.Message) -ForegroundColor DarkYellow
    Start-Sleep -Seconds 5
    continue
  }
  if (-not $r.job) { continue }
  Write-Host ("{0} 분석 중... (1~2분)" -f (Get-Date -Format 'HH:mm:ss'))
  $out = Invoke-Claude ('-p --output-format json --json-schema ' + $SchemaArg + ' --tools "" --strict-mcp-config --no-session-persistence') ($Prompt + $NL + $NL + '<data>' + $NL + $r.job.brief + $NL + '</data>')
  if ($out.Trim().StartsWith('{')) { Write-Host ("{0} 완료" -f (Get-Date -Format 'HH:mm:ss')) }
  else { Write-Host '실패 - 터미널에서 claude 로그인을 확인하세요' -ForegroundColor Red }
  $payload = @{ id = $r.job.id; out = $out } | ConvertTo-Json -Compress
  try {
    Invoke-RestMethod -Uri "$Server/api/vmd-plan/relay?t=$Token" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) | Out-Null
  } catch {
    Write-Host ('결과를 보내지 못했습니다: ' + $_.Exception.Message) -ForegroundColor Red
  }
}
`;
