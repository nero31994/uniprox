export default async function handler(req, res) {
  try {
    // Extract path after /api/proxy/
    const path = req.url.replace(/^\/api\/proxy\//, "") || "";

    // Mirrors rotation
    const mirrors = ["https://vidfast.pro"];

    // User-agents rotation
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 Safari/605.1.15",
      "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 Chrome/127.0 Mobile Safari/537.36"
    ];

    // Referer rotation
    const referers = ["https://vidfast.pro"];

    // Random selection
    const mirror = mirrors[Math.floor(Math.random() * mirrors.length)];
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    const referer = referers[Math.floor(Math.random() * referers.length)];

    // Fetch upstream content
    const upstream = await fetch(`${mirror}/${path}`, {
      headers: { "User-Agent": userAgent, "Referer": referer }
    });

    if (!upstream.ok)
      throw new Error(`Upstream request failed: ${upstream.status}`);

    const contentType = upstream.headers.get("content-type") || "";

    // Pass-through for non-HTML (video, JSON, etc.)
    if (!contentType.includes("text/html")) {
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", contentType);
      return res.status(upstream.status).send(buffer);
    }

    // HTML: remove ads/popups safely
    let html = await upstream.text();

    // Remove inline popup scripts, but keep player scripts
    html = html.replace(
      /<script[^>]*>[^<]*(ads?|popup|popunder|redirect|click)[^<]*<\/script>/gi,
      ""
    );

    // Inject safe anti-popup + fullscreen fix
    const injection = `
      <script>
        (() => {
          const blockAds = () => {
            // Remove script tags that are clearly ads/popups
            document.querySelectorAll("script").forEach(s => {
              if (/ads?|popup|popunder|redirect|click/i.test(s.innerHTML)) s.remove();
            });

            // Prevent popup windows
            window.open = () => null;

            // Remove links to ad domains
            document.querySelectorAll("a").forEach(a => {
              if (/ads?|sponsor|popunder|click|redirect/i.test(a.href)) a.removeAttribute("href");
            });

            // Remove extra iframes (keep player)
            document.querySelectorAll("iframe").forEach(f => {
              const id = f.id || f.className || "";
              if (!/player/i.test(id)) f.remove();
            });
          };

          // Initial blocking
          blockAds();

          // Continuously monitor DOM for new ads/popups
          const observer = new MutationObserver(blockAds);
          observer.observe(document.documentElement, { childList: true, subtree: true });

          // Also run after page load
          window.addEventListener("load", blockAds);

          // Fullscreen player fix
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
          window.addEventListener("load", fixPlayer);
        })();
      </script>
      <style>
        html, body {margin:0; padding:0; background:#000; overflow:hidden; height:100vh;}
        iframe, video, #player, .player {width:100vw!important; height:100vh!important; border:none!important; display:block!important;}
      </style>
    `;

    html = html.replace(/<\/body>/i, `${injection}</body>`);

    // Send response
    res.status(upstream.status);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Content-Security-Policy",
      "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-src *; media-src * data: blob:;"
    );
    res.send(html);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Proxy failed", details: err.message });
  }
}
