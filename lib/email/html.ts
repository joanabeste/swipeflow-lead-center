// HTML-Sanitizer für E-Mail-Bodies. Erlaubt Inline-Styles (Mails brauchen sie
// für ihr Layout), aber blockt Skripte, Iframes und alles, was zu Remote-Calls
// oder Auto-Submit führen könnte.

import DOMPurify from "isomorphic-dompurify";

const FORBIDDEN_TAGS = ["script", "iframe", "object", "embed", "form", "input", "button", "select", "textarea", "meta", "link", "base", "style"];
const FORBIDDEN_ATTR = ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit", "onreset", "onkeydown", "onkeyup", "onkeypress", "formaction"];

let hooksRegistered = false;
function ensureHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  // Alle Links target=_blank + rel hardening.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node instanceof Element) {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
      if (node.tagName === "IMG") {
        node.setAttribute("loading", "lazy");
        node.setAttribute("referrerpolicy", "no-referrer");
      }
    }
  });
}

export function sanitizeMailHtml(html: string): string {
  if (!html) return "";
  ensureHooks();
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: FORBIDDEN_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}
