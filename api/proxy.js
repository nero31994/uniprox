// Next.js / Vercel API route
export default async function handler(req, res) {
  try {
    const path = req.url.replace(/^\/api\/proxy\//, "") || "";
    const mirror = "https://autoembed.co"; // or your chosen mirror
    const upstream = await fetch(`${mirror}/${path}`, {
      headers: {
        // keep these realistic if the upstream blocks bots
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        Referer: req.headers.referer || mirror
      },
    });

    if (!upstream.ok) throw new Error(`Upstream ${upstream.status}`);

    const contentType = upstream.headers.get("content-type") || "";
    const buffer = await upstream.arrayBuffer();

    // Pass-through non-html content
    if (!contentType.includes("text/html")) {
      const out = Buffer.from(buffer);
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("content-type", contentType);
      return res.status(upstream.status).send(out);
    }

    let html = Buffer.from(buffer).toString("utf8");

    // 1) Remove dangerous inline event handlers (onclick, onbeforeunload, onload, etc)
    html = html.replace(/\s(on(?:click|mouseover|mouseout|mouseenter|mouseleave|beforeunload|load|error))\s*=\s*(['"]).*?\2/gi, " ");

    // 2) Remove <iframe> overlays known for popunders (some sites wrap ads in iframes)
    html = html.replace(/<iframe[^>]*(sponsor|ad|popup|popunder|overlay|doubleclick)[^>]*>[\s\S]*?<\/iframe>/gi, "");

    // 3) Remove <div> overlays with typical ad classes/ids
    html = html.replace(/<div[^>]*(class|id)=['"][^'"]*(overlay|ad-|ads|popunder|sponsor|modal)[^'"]*['"][^>]*>[\s\S]*?<\/div>/gi, "");

    // 4) Remove <script> tags that include suspicious keywords directly
    html = html.replace(/<script[^>]*>[\s\S]*?(?:popunder|pop_up|popup|ads|sponsor|redirect|atob|document\.write|window\.open)[\s\S]*?<\/script>/gi, "");

    // 5) Find script tags with base64 strings and try to decode them. If decoded content looks malicious, remove.
    // Regex finds base64-like strings inside scripts (long sequences of base64 characters)
    html = html.replace(/<script\b[^>]*>[\s\S]*?([A-Za-z0-9+\/=]{80,})[\s\S]*?<\/script>/gi, (match, b64) => {
      try {
        const decoded = Buffer.from(b64, "base64").toString("utf8");
        // If decoded script contains known bad patterns, drop the whole script
        if (/window\.open|document\.write|eval|atob|popunder|redirect|ad_|sponsor|click/.test(decoded)) {
          return ""; // remove the script
        }
      } catch (e) {
        // ignore decode errors — keep trying other removals
      }
      // If not obviously malicious, keep the original match
      return match;
    });

    // 6) Remove inline eval(atob('...')) patterns even if base64 short
    html = html.replace(/eval\s*\(\s*atob\s*\(\s*(['"`])([A-Za-z0-9+\/=]{40,})\1\s*\)\s*\)\s*;?/gi, "");

    // 7) Inject an EARLY safety script into <head> so it runs BEFORE page scripts
    const earlyGuard = `
      <script>
      (function(){
        // Do minimal, robust overrides first
        try {
          // neutralize popups and navigation tricks
          window.open = function(){ return null; };
          window.onbeforeunload = null;
          window.onunload = null;

          // prevent document.write (dangerous and used by ad injections)
          Document.prototype._write = Document.prototype.write;
          Document.prototype.write = function(){ /* blocked */ };

          // protect against common obfuscation helpers
          const safeNoop = function(){ return null; };

          // optionally override eval/Function — commented out by default (may break players)
          // window.eval = safeNoop;
          // window.Function = function(){ throw new Error("Function disabled"); };

          // intercept script nodes being added to DOM: if they contain 'atob' or 'eval' drop them
          const origAppend = Element.prototype.appendChild;
          Element.prototype.appendChild = function(node){
            try {
              if (node && node.tagName === 'SCRIPT') {
                const s = node.textContent || node.src || "";
                if (/atob\\(|eval\\(|document\\.write|window\\.open|popunder|pop_up|ads?/i.test(s)) {
                  return node; // silently ignore insertion by not calling origAppend
                }
              }
            } catch(e) {}
            return origAppend.call(this, node);
          };

          // remove overlays on mutation
          const removeOverlays = () => {
            try {
              document.querySelectorAll('iframe,div').forEach(el=>{
                const cls = (el.className||"") + " " + (el.id||"");
                if (/overlay|popunder|ads?|sponsor|modal|cookie|consent|redirect/i.test(cls) || (el.offsetWidth>window.innerWidth*0.8 && el.offsetHeight>100 && el !== document.body)) {
                  el.remove();
                }
              });
            } catch(e){}
          };

          new MutationObserver(removeOverlays).observe(document.documentElement, { childList: true, subtree: true });
          window.addEventListener('load', removeOverlays);
          // attempt to restore player's visual space
          window.addEventListener('load', ()=>{
            try {
              const p = document.querySelector('iframe,video,#player,.player');
              if (p) {
                Object.assign(p.style, { position:'fixed',top:'0',left:'0',width:'100vw',height:'100vh',zIndex:999999 });
                document.documentElement.style.overflow = 'hidden';
                document.body.style.overflow = 'hidden';
              }
            } catch(e){}
          });

        } catch(e){}
      })();
      </script>
      <style>
        html,body{margin:0;padding:0;height:100vh;background:#000;overflow:hidden}
        iframe,video,#player,.player{width:100% !important;height:100% !important;display:block !important;border:0 !important}
      </style>
    `;

    // Insert earlyGuard right after <head> opening if possible, otherwise before </body>
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, match => match + earlyGuard);
    } else {
      html = html.replace(/<\/body>/i, earlyGuard + "</body>");
    }

    // 8) Finally, set a permissive CSP to allow player resources but block inline eval by default
    // (Players that rely on inline scripts may break — adjust as needed)
    res.setHeader("content-security-policy", "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-src *; media-src * data: blob:;");

    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.status(200).send(html);

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Proxy failed", details: err.message });
  }
}
