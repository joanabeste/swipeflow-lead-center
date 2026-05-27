export const WEBDESIGN_GREETING_TEMPLATE = "{{anrede}},";

export const WEBDESIGN_HEADLINE_TEMPLATE =
  "Ihr neuer Webauftritt für {{company_name}}";

export const WEBDESIGN_INTRO_TEMPLATE =
  "vielen Dank für das nette Gespräch. Wie besprochen sende ich Ihnen hier eine kurze Übersicht, wie wir {{company_name}} online optimal aufstellen können.\n\nWir gestalten moderne, mobiloptimierte Websites, die Ihre Zielgruppe überzeugen und bei Google sichtbar sind.";

export const WEBDESIGN_OUTRO_TEMPLATE =
  "Ich freue mich darauf, gemeinsam mit Ihnen den nächsten Schritt zu gehen. Buchen Sie gerne direkt einen Termin — oder melden Sie sich bei Fragen jederzeit.\n\nHerzliche Grüße\n{{sender_name}}";

export interface PortfolioItem {
  title: string;
  description: string;
  imageUrl: string;
  linkUrl: string | null;
}

export const WEBDESIGN_PORTFOLIO: PortfolioItem[] = [
  {
    title: "Muster-Referenz 1",
    description: "Modernes Webdesign mit responsivem Layout und schneller Ladezeit.",
    imageUrl: "https://placehold.co/600x400/0f172a/white?text=Referenz+1",
    linkUrl: null,
  },
  {
    title: "Muster-Referenz 2",
    description: "SEO-optimierte Unternehmenswebsite mit Terminbuchung.",
    imageUrl: "https://placehold.co/600x400/0f172a/white?text=Referenz+2",
    linkUrl: null,
  },
  {
    title: "Muster-Referenz 3",
    description: "Kompletter Relaunch inklusive Corporate Design und Texterstellung.",
    imageUrl: "https://placehold.co/600x400/0f172a/white?text=Referenz+3",
    linkUrl: null,
  },
];
