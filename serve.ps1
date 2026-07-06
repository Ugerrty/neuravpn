$root = $PSScriptRoot
$port = 4175

# try to listen on all interfaces (phones on the same Wi-Fi can connect);
# falls back to localhost-only if the urlacl reservation is missing
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$port/")
try {
  $listener.Start()
  Write-Host "Serving $root on ALL interfaces, port $port"
} catch {
  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://localhost:$port/")
  $listener.Prefixes.Add("http://127.0.0.1:$port/")
  $listener.Start()
  Write-Host "Serving $root at http://localhost:$port/ (localhost only)"
}

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".mjs"  = "text/javascript; charset=utf-8"
  ".json" = "application/json"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".ico"  = "image/x-icon"
  ".woff" = "font/woff"
  ".woff2" = "font/woff2"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    # dev-хук: страница может прислать картинку (dataURL) для визуальной проверки
    if ($ctx.Request.HttpMethod -eq "POST" -and $path -eq "/__save") {
      $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream)
      $data = $reader.ReadToEnd()
      $b64 = $data -replace "^data:image/\w+;base64,", ""
      [System.IO.File]::WriteAllBytes((Join-Path $root "_debug.jpg"), [System.Convert]::FromBase64String($b64))
      $ctx.Response.StatusCode = 200
      try { $ctx.Response.OutputStream.Close() } catch {}
      continue
    }
    if ($path -eq "/") { $path = "/index.html" }
    $file = Join-Path $root ($path.TrimStart("/") -replace "/", "\")
    $full = [System.IO.Path]::GetFullPath($file)
    if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $full -PathType Leaf)) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] } else { $ctx.Response.ContentType = "application/octet-stream" }
      $ctx.Response.Headers.Add("Cache-Control", "no-cache, must-revalidate")
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
  } catch {
    try { $ctx.Response.StatusCode = 500 } catch {}
  }
  try { $ctx.Response.OutputStream.Close() } catch {}
}
