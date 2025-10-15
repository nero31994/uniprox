export default async function handler(req, res) {
  try {
    const path = req.url.replace(/^\/api\/proxy\//, "") || "";
    const mirror = "https://autoembed.co";
    const upstream = await fetch(`${mirror}/${path}`, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Referer: req.headers.referer || mirror
      },
    });

    if (!upstream.ok) throw new Error(`Upstream ${upstream.status}`);

    const contentType = upstream.headers.get("content-type") || "";
    const buffer = await upstream.arrayBuffer();

    // Pass-through non-HTML
    if (!contentType.includes("text/html")) {
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("content-type", contentType);
      return res.status(upstream.status).send(Buffer.from(buffer));
    }

    let html = Buffer.from(buffer).toString("utf8");

    // 1️⃣ Remove inline event handlers but keep Histats safe
    html = html.replace(/\s(on(?:click|mouseover|mouseout|mouseenter|mouseleave|beforeunload|load|error))\s*=\s*(['"]).*?\2/gi, " ");

    // 2️⃣ Remove ad/overlay iframes (not Histats)
    html = html.replace(/<iframe[^>]*(sponsor|ad|popup|popunder|overlay|doubleclick)[^>]*>[\s\S]*?<\/iframe>/gi, "");

    // 3️⃣ Remove ad-related <div> (safe for Histats)
    html = html.replace(/<div[^>]*(class|id)=['"][^'"]*(overlay|ad-|ads|popunder|sponsor|modal)[^'"]*['"][^>]*>[\s\S]*?<\/div>/gi, "");

    // 4️⃣ Remove malicious <script> tags but **keep Histats**
    html = html.replace(
      /<script\b[^>]*>[\s\S]*?<\/script>/gi,
      (match) => {
        if (/histats\.com|histats\.js/i.test(match)) return match; // ✅ whitelist Histats
        if (/popunder|popup|ads|sponsor|redirect|atob|document\.write|window\.open/i.test(match)) return "";
        return match;
      }
    );

    // 5️⃣ Decode base64 scripts & filter unsafe ones (still whitelist Histats)
    html = html.replace(
      /<script\b[^>]*>[\s\S]*?([A-Za-z0-9+/=]{80,})[\s\S]*?<\/script>/gi,
      (match, b64) => {
        if (/histats\.com|histats\.js/i.test(match)) return match;
        try {
          const decoded = Buffer.from(b64, "base64").toString("utf8");
          if (/window\.open|document\.write|eval|atob|popunder|redirect|ad_|sponsor|click/.test(decoded)) return "";
        } catch (e) {}
        return match;
      }
    );

    // 6️⃣ Clean eval(atob()) patterns
    html = html.replace(/eval\s*\(\s*atob\s*\(\s*(['"`])([A-Za-z0-9+/=]{40,})\1\s*\)\s*\)\s*;?/gi, "");

    // 7️⃣ Early guard & style
    const earlyGuard = `
      <script>
      (function(){
        try {
          window.open = () => null;
          window.onbeforeunload = null;
          window.onunload = null;
          Document.prototype.write = function(){};
          const origAppend = Element.prototype.appendChild;
          Element.prototype.appendChild = function(node){
            try {
              if (node && node.tagName === 'SCRIPT') {
                const s = node.textContent || node.src || "";
                if (!/histats\\.com|histats\\.js/i.test(s) && /atob|eval|document\\.write|window\\.open|ads?|popunder|redirect/i.test(s)) {
                  return node;
                }
              }
            } catch(e){}
            return origAppend.call(this, node);
          };
          new MutationObserver(()=>{
            document.querySelectorAll('iframe,div').forEach(el=>{
              const cls=(el.className||"")+" "+(el.id||"");
              if(/overlay|popunder|ads?|sponsor|modal/i.test(cls)) el.remove();
            });
          }).observe(document.documentElement,{childList:true,subtree:true});
        }catch(e){}
      })();
      </script>
      <style>
        html,body{margin:0;padding:0;height:100vh;background:#000;overflow:hidden}
        iframe,video,#player,.player{width:100%!important;height:100%!important;display:block!important;border:0!important}
      </style>
    `;

    // Inject early guard
    html = html.replace(/<head[^>]*>/i, m => m + earlyGuard);

    // 8️⃣ Content Security Policy
    res.setHeader("content-security-policy", "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-src *; media-src * data: blob:;");
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("content-type", "text/html; charset=utf-8");

    return res.status(200).send(html);

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Proxy failed", details: err.message });
  }
}
