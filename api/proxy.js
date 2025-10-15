export default async function handler(req, res) {
  try {
    const path = req.url.replace(/^\/api\/proxy/, "");
    const target = `https://spencerdevs.xyz${path}`;

    const upstream = await fetch(target, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36",
        referer: "https://spencerdevs.xyz",
      },
    });

    const contentType = upstream.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("content-type", contentType);
      const buffer = Buffer.from(await upstream.arrayBuffer());
      return res.status(upstream.status).send(buffer);
    }

    let html = await upstream.text();

    // Remove ad scripts
    html = html
      .replace(/<script[^>]*>[^<]*(ads|popunder|atob|redirect)[^<]*<\/script>/gi, "")
      .replace(/eval\(atob\([^)]*\)\);?/gi, "")
      .replace(/window\.open\s*=\s*[^;]+;/gi, "window.open = () => null;");

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
              width: "100vw", height: "100vh", position: "fixed",
              top: "0", left: "0", zIndex: "9999"
            });
          };
          new MutationObserver(fixPlayer).observe(document.body, { childList: true, subtree: true });
          window.addEventListener("load", fixPlayer);
        })();
      </script>
      <style>
        html,body {margin:0;padding:0;background:#000;overflow:hidden;height:100vh;}
        iframe,video,#player,.player {
          width:100vw!important;height:100vh!important;
          border:none!important;display:block!important;
        }
      </style>
    `;
    html = html.replace(/<\/body>/i, `${injection}</body>`);

    res.status(upstream.status);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader(
      "content-security-policy",
      "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-src *; media-src * data: blob:;"
    );
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: "Proxy failed", details: err.message });
  }
}
