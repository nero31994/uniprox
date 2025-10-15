export default async function handler(req, res) {
  try {
    const path = req.url.replace(/^\/api\/proxy\//, "") || "";
    const mirror = "https://vidfast.pro";
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0 Safari/537.36";
    const referer = "https://vidfast.pro";

    const upstream = await fetch(`${mirror}/${path}`, {
      headers: {
        "User-Agent": userAgent,
        "Referer": referer
      }
    });

    if (!upstream.ok) {
      throw new Error(`Upstream request failed: ${upstream.status}`);
    }

    const contentType = upstream.headers.get("content-type") || "";

    // Handle non-HTML content (e.g., video streams)
    if (contentType.includes("video/")) {
      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      upstream.body.pipeTo(res);
      return;
    }

    // HTML content processing (e.g., removing popups)
    let html = await upstream.text();
    html = html.replace(/window\.open\(.*?\);?/g, "")
               .replace(/<script[^>]*>[^<]*(popup|click|ad|redirect|atob)[^<]*<\/script>/gi, "")
               .replace(/eval\(atob\(.*?\)\);?/gi, "")
               .replace(/onbeforeunload=.*?['"]/gi, "");

    // Inject anti-popup and player fullscreen fix
    const injection = `
      <script>
        (() => {
          const blockAds = () => {
            document.querySelectorAll("script").forEach(s => {
              if (/ads?|popup|popunder|redirect|click/i.test(s.innerHTML)) s.remove();
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

    res.status(upstream.status);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Security-Policy", "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-src *; media-src * data: blob:;");
    res.send(html);

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Proxy failed", details: err.message });
  }
}
