export default async function handler(req, res) {
  try {
    // Extract path after /api/proxy/
    const path = req.url.replace(/^\/api\/proxy\//, "") || "";

    // Mirrors to rotate per request
    const mirrors = [
      "https://vidsrc-embed.ru",    
      "https://vidsrc-embed.su",
      
    ];

    // User-agents rotation
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 Safari/605.1.15",
      "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 Chrome/127.0 Mobile Safari/537.36"
    ];

    // Referer rotation
    const referers = [
      "https://vidsrc-embed.ru",      
      "https://vidsrc-embed.su",
     
    ];

    // --- Randomly select one of each per request ---
    const mirror = mirrors[Math.floor(Math.random() * mirrors.length)];
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    const referer = referers[Math.floor(Math.random() * referers.length)];

    // Fetch upstream content
    const upstream = await fetch(mirror + "/" + path, {
      headers: {
        "User-Agent": userAgent,
        "Referer": referer
      }
    });

    if (!upstream.ok) throw new Error(`Upstream request failed: ${upstream.status}`);

    const contentType = upstream.headers.get("content-type") || "";

    // Pass-through for non-HTML
    if (!contentType.includes("text/html")) {
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("content-type", contentType);
      return res.status(upstream.status).send(buffer);
    }

    // HTML content: remove popups & ads
    let html = await upstream.text();
    html = html
      .replace(/window\.open\(.*?\);?/g, "")
      .replace(/<script[^>]*>[^<]*(popup|click|ad|redirect|atob)[^<]*<\/script>/gi, "")
      .replace(/eval\(atob\(.*?\)\);?/gi, "")
      .replace(/onbeforeunload=.*?['"]/gi, "");

    // Inject anti-popup & player fullscreen fix
    const injection = `
      <script>
        (() => {
          const blockAds = () => {
            document.querySelectorAll("script").forEach(s => {
              if (/atob|ads|popunder|redirect/i.test(s.innerHTML)) s.remove();
            });
            window.open = () => null;
            document.querySelectorAll("a").forEach(a => {
              if (/ads?|sponsor|click|redirect/i.test(a.href)) a.removeAttribute("href");
            });
          };
          new MutationObserver(blockAds).observe(document.documentElement, { childList: true, subtree: true });
          window.addEventListener("load", blockAds);

          const fixPlayer = () => {
            const p = document.querySelector("iframe, video, #player, .player");
            if (p) Object.assign(p.style, {
              width: "100vw",
              height: "100vh",
              position: "fixed",
              top: "0",
              left: "0",
              zIndex: "9999"
            });
          };
          new MutationObserver(fixPlayer).observe(document.body, { childList: true, subtree: true });
          window.addEventListener("load", fixPlayer);
        })();
      </script>
      <style>
        html,body {margin:0;padding:0;background:#000;overflow:hidden;height:100vh;}
        iframe,video,#player,.player {width:100vw!important;height:100vh!important;border:none!important;display:block!important;}
      </style>
    `;
    html = html.replace(/<\/body>/i, `${injection}</body>`);

    // Send response
    res.status(upstream.status);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader(
      "content-security-policy",
      "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-src *; media-src * data: blob:;"
    );
    res.send(html);

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Proxy failed", details: err.message });
  }
}
