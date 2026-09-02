import { publicRoute } from "@/server/public";

export const dynamic = "force-static";

/**
 * The embeddable widget (spec 10 §10.3, BE-9): one script tag, one target element,
 * an iframe that resizes itself through postMessage. Under 1 kB, no dependencies,
 * Apache-2.0 like the rest of the embed surface (LICENSE.md).
 *
 *   <div id="book"></div>
 *   <script src="https://pms.example/widget.js" data-property="…" data-target="#book"></script>
 */
const WIDGET = `(function(){var s=document.currentScript;if(!s)return;var p=s.getAttribute("data-property");var t=document.querySelector(s.getAttribute("data-target")||"#book");if(!p||!t)return;var base=new URL(s.src).origin;var q=new URLSearchParams(window.location.search);var u=base+"/book/"+encodeURIComponent(p)+"?embed=1";["arrival","departure","adults","children","promo"].forEach(function(k){if(q.get(k))u+="&"+k+"="+encodeURIComponent(q.get(k));});var f=document.createElement("iframe");f.src=u;f.title="Book direct";f.style.width="100%";f.style.border="0";f.style.minHeight="480px";f.setAttribute("allow","payment");t.appendChild(f);window.addEventListener("message",function(e){if(e.origin!==base||!e.data||e.data.type!=="pms:resize")return;f.style.height=(e.data.height+8)+"px";});})();`;

export const GET = publicRoute(
  "booking_engine",
  async () =>
    new Response(WIDGET, {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    }),
);
