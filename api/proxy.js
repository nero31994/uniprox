export default async function handler(req, res) {
  try {
    const path = req.url.replace(/^\/api\/proxy\//, "") || "";
    const target = `https://autoembed.co/${path}`;

    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36",
        "Referer": "https://autoembed.co"
      }
    });

    if (!upstream.ok) throw new Error("Upstream failed");

    let html = await upstream.text();
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["'][^>]*><\/iframe>/i);
    const iframeSrc = iframeMatch ? iframeMatch[1] : null;

    if (!iframeSrc) {
      return res.status(404).send("No iframe/player found");
    }

    const cleanHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ad-Free Player</title>
<style>
  html,body{margin:0;padding:0;height:100vh;background:#000;overflow:hidden;}
  iframe{width:100vw;height:100vh;border:none;display:block;}
</style>
<script>
  window.open = () => null;
  window.alert = () => null;
  window.confirm = () => true;
  window.eval = () => null;
  document.addEventListener('click', e => {
    if(e.target.tagName === 'A' && /ads?|click|sponsor|redirect/i.test(e.target.href)) e.preventDefault();
  });
</script>
</head>
<body>
<iframe src="${iframeSrc.startsWith('http') ? iframeSrc : 'https:' + iframeSrc}" allowfullscreen allow="autoplay; fullscreen"></iframe>
</body>
</html>`;

    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.status(200).send(cleanHTML);

  } catch (err) {
    console.error(err);
    res.status(500).send("Proxy error: " + err.message);
  }
}
