// Vertrags-Template: rendert den Dienstleistungs- & Auftragsverarbeitungsvertrag
// (Webdesign) als vollständiges HTML-Dokument. Einzige Quelle der Wahrheit für
// die Lese-Ansicht (öffentliche Route) und das finale PDF.
//
// Bei jeder inhaltlichen Änderung am Vertragstext TEMPLATE_VERSION erhöhen —
// die Version wird beim Versand in terms_snapshot eingefroren.

import { formatEuro, splitInstallments } from "./format";
import type { ContractType } from "./types";

export const TEMPLATE_VERSION = "webdesign-v4";
export const RECRUITING_TEMPLATE_VERSION = "recruiting-v2";
export const CONTENT_TEMPLATE_VERSION = "content-v1";

/** Eingefrorene Template-Version pro Vertragstyp (für terms_snapshot). */
export function templateVersion(type: ContractType): string {
  if (type === "recruiting") return RECRUITING_TEMPLATE_VERSION;
  if (type === "content") return CONTENT_TEMPLATE_VERSION;
  return TEMPLATE_VERSION;
}

// Markenlogo (swipeflow „s") als Inline-SVG — muss inline sein, da das PDF via
// Headless-Chromium aus reinem HTML (setContent, ohne Base-URL) gerendert wird.
export const LOGO_SVG = `<svg viewBox="0 0 1920 700" width="88" height="32" xmlns="http://www.w3.org/2000/svg"><path fill="#020f13" d="m 69.734727,636.18159 c -4.735986,-0.17253 -5.050722,-0.22499 -6.29411,-1.04902 -1.464439,-0.97053 -2.634939,-2.41801 -3.309474,-4.09259 C 59.744099,630.07911 59.68,588.40532 59.68,337.73224 V 45.544498 l 1.170094,-1.762285 c 1.258386,-1.895262 3.581608,-3.660169 5.195905,-3.947231 0.546701,-0.09722 15.960219,-0.135858 34.252261,-0.08587 l 33.25826,0.09089 0.41179,2.438041 c 0.90171,5.338635 2.85448,9.085061 6.55634,12.578488 2.93255,2.767437 6.3967,4.61626 10.83535,5.782861 l 3.04,0.798995 42.72,-0.0014 c 41.80187,-0.0014 42.77846,-0.01538 45.44,-0.650193 1.496,-0.356817 4.07337,-1.305416 5.72749,-2.107998 2.5232,-1.224255 3.45099,-1.90526 5.76155,-4.229 4.20585,-4.229835 6.14147,-7.958157 6.63561,-12.78125 l 0.2137,-2.085778 33.84802,0.174737 33.84803,0.174737 1.73703,0.795239 c 1.85941,0.851266 2.99584,2.087766 4.04544,4.401656 l 0.64907,1.430899 0.009,291.359994 c 0.008,275.66461 -0.0213,291.44338 -0.54626,292.90801 -0.73177,2.04156 -2.29596,3.82136 -4.16915,4.74384 l -1.51914,0.74814 -127.04,0.0216 c -69.872,0.0119 -129.283373,-0.0601 -132.025273,-0.16 z M 219.73758,581.44982 c 6.28789,-1.32738 10.96832,-3.79311 15.16374,-7.98853 5.25649,-5.25649 7.95384,-11.39659 9.77939,-22.26131 0.73449,-4.37128 0.73035,-14.083 -0.008,-18.88 -1.84637,-11.99497 -6.63255,-21.04325 -13.59417,-25.6998 -5.06882,-3.39048 -11.10052,-4.71966 -17.95743,-3.95721 -7.53142,0.83745 -13.09179,3.939 -17.44587,9.7312 -1.67022,2.22189 -3.94424,6.74633 -4.93199,9.81281 -1.70753,5.30105 -3.07899,13.9637 -3.56557,22.52136 -0.69806,12.27716 -3.18119,17.04594 -9.6208,18.47644 -2.53377,0.56285 -4.90752,0.28546 -7.33577,-0.85724 -3.51375,-1.65352 -5.82429,-4.52049 -7.48668,-9.28963 -1.77335,-5.08747 -1.93838,-13.48447 -0.3685,-18.75019 2.02853,-6.80413 4.9741,-10.20714 9.91111,-11.45029 L 173.76,522.484 v -8.64796 -8.64796 l -2.28478,0.21234 c -3.64996,0.33923 -8.9624,2.41145 -12.74422,4.97112 -2.03896,1.38004 -5.30906,4.67639 -6.7881,6.84261 -4.47794,6.5584 -6.61462,15.77937 -6.24388,26.94583 0.50849,15.31554 5.23858,26.29866 13.77109,31.97599 5.3183,3.53867 9.91042,4.80736 16.52989,4.56678 5.10389,-0.18549 7.0843,-0.65894 11.2,-2.67756 2.52164,-1.23679 3.47651,-1.93542 5.6,-4.09725 6.46707,-6.58385 9.41082,-15.62787 10.56017,-32.44374 0.8681,-12.70119 3.18453,-18.24633 8.70652,-20.84197 1.69244,-0.79554 4.99097,-0.8576 7.47523,-0.14064 5.6095,1.61891 8.82509,6.79968 10.24417,16.50477 1.06527,7.28548 -1.03896,17.34542 -4.59841,21.98408 -2.23836,2.91702 -6.91407,5.48954 -9.97759,5.48954 H 214.08 v 8.8 8.8 l 1.36,-0.005 c 0.748,-0.003 2.68191,-0.28407 4.29758,-0.62514 z M 196.64,485.32544 l 47.68,-15.4635 -0.11618,-6.53098 c -0.0639,-3.59204 -0.17685,-6.63325 -0.25101,-6.75824 -0.29588,-0.4987 -35.81551,-11.50793 -56.5902,-17.54001 -4.92657,-1.43046 -8.99767,-2.64112 -9.0469,-2.69035 -0.0492,-0.0492 2.2536,-0.77661 5.11739,-1.6164 27.48978,-8.06122 59.05345,-17.69635 60.53546,-18.47907 0.57165,-0.3019 0.59601,-0.61519 0.40161,-5.16415 -0.27582,-6.45432 -0.50476,-8.16726 -1.13634,-8.50196 -0.49901,-0.26446 -37.0101,-12.14819 -76.03383,-24.7477 l -19.2,-6.19907 -0.20214,0.82299 c -0.26732,1.08838 -0.33421,15.02123 -0.0782,16.30102 0.19691,0.98459 0.28493,1.02595 6.53428,3.07078 12.41136,4.06108 20.88235,6.57227 39.98611,11.8537 10.648,2.94376 19.53625,5.44707 19.75166,5.56293 0.21541,0.11586 -7.12859,2.33496 -16.32,4.93132 -34.68478,9.79767 -49.23436,14.13919 -49.60632,14.80227 -0.4414,0.78686 -0.71837,12.70719 -0.32954,14.18272 l 0.28506,1.08176 16.94957,4.86999 c 9.32226,2.67849 24.25499,6.93942 33.18383,9.46873 8.92884,2.52931 16.05684,4.69542 15.84,4.81359 -0.3631,0.19786 -19.494,5.66197 -33.51426,9.57223 -7.17355,2.00071 -15.9924,4.67412 -25.48267,7.72501 l -7.08267,2.27691 -0.19733,1.43967 c -0.25673,1.87304 -0.24946,13.95231 0.009,15.51822 0.153,0.92575 0.32035,1.16737 0.71648,1.03448 0.28427,-0.0954 21.97285,-7.13197 48.19685,-15.63689 z m -71.11672,-121.2892 c 4.51694,-1.06291 7.28882,-5.01485 7.26627,-10.35969 -0.0278,-6.58504 -3.4665,-10.28944 -10.06965,-10.84761 -1.94729,-0.16461 -2.46354,-0.0907 -3.69188,0.52843 -2.51296,1.26665 -4.04729,2.75947 -5.16066,5.02104 -0.94199,1.91345 -1.04252,2.39159 -1.02435,4.87163 0.0426,5.81627 3.3376,10.19503 8.20678,10.90617 2.4282,0.35464 2.46023,0.35378 4.47349,-0.11997 z m 118.24186,-10.51625 -0.0851,-8.72 -48.56,-0.081 -48.56,-0.081 v 8.80103 8.80103 h 48.64514 48.64515 z M 272,316.95999 v -8.8 h -10.02782 c -5.51529,0 -14.57262,-0.0949 -20.12738,-0.211 l -10.09957,-0.211 2.72546,-2.57988 c 4.02554,-3.81051 6.9806,-8.46721 8.34992,-13.15812 4.77325,-16.3519 2.54331,-32.97663 -6.13797,-45.76 -2.36777,-3.48659 -7.80438,-9.00053 -11.08264,-11.24027 -6.08061,-4.15435 -14.82188,-7.38032 -22.88,-8.44387 -4.00554,-0.52868 -11.81719,-0.45257 -15.84,0.15433 -13.55577,2.04506 -24.31643,8.11478 -31.50307,17.76981 -4.35709,5.85363 -6.78234,11.39706 -8.53999,19.52 -0.99647,4.60515 -1.08084,15.71299 -0.15678,20.64 1.8886,10.06989 5.53056,17.1222 11.15466,21.6 l 1.80864,1.44 -2.14173,0.20025 c -1.17795,0.11014 -3.90573,0.21814 -6.06173,0.24 l -3.92,0.0397 v 8.8 8.8 H 209.76 272 Z m -81.6226,-9.13006 c -2.81031,-0.32873 -7.76488,-1.66973 -10.73044,-2.9043 -6.41974,-2.67254 -12.43169,-8.69611 -15.55552,-15.58556 -3.96773,-8.75064 -3.60307,-20.52043 0.90423,-29.1848 3.20248,-6.15614 9.44868,-11.42439 16.66961,-14.0597 2.99916,-1.09456 10.46812,-2.57558 12.98894,-2.57558 10.23884,0 22.07304,4.83167 27.30256,11.14709 3.56374,4.30374 5.77526,8.5466 7.03297,13.49291 0.83659,3.29014 0.84888,10.56141 0.0243,14.39497 -1.58446,7.36665 -5.79647,14.28402 -11.25409,18.48255 -2.85146,2.19363 -8.5349,4.98916 -11.84,5.82378 -4.71768,1.19134 -10.53784,1.55406 -15.5426,0.96864 z M 203.68,217.08447 c 8.45888,-1.24512 14.67751,-3.60547 21.44,-8.13779 7.5397,-5.05321 14.79386,-15.15746 18.02487,-25.10669 1.71526,-5.28176 2.13795,-8.51958 2.10965,-16.16 -0.0216,-5.82482 -0.13422,-7.38941 -0.73451,-10.20147 -3.49368,-16.36621 -12.0247,-27.53757 -26.28001,-34.41362 l -3.68,-1.77505 -0.22156,1.19507 c -0.27842,1.50179 -0.3204,13.1131 -0.0554,15.31879 0.1766,1.46982 0.32017,1.71312 1.35722,2.29984 5.0982,2.88438 10.19793,9.38051 12.36429,15.74987 1.87384,5.50932 2.42486,13.12413 1.31395,18.15796 -2.44861,11.09531 -9.87249,20.39079 -19.10186,23.91753 -1.99236,0.76132 -6.32761,1.82454 -9.33666,2.2898 l -1.2,0.18555 v -40.81671 -40.8167 l -1.0185,-0.2237 c -1.89929,-0.41716 -9.93388,-0.21792 -13.0615,0.32389 -6.24399,1.08167 -12.97435,3.84212 -18.75726,7.69327 -9.93761,6.61798 -16.2763,15.82243 -19.28268,28.00051 -1.21816,4.93447 -1.6419,8.33374 -1.63381,13.10678 0.018,10.60752 3.02937,20.69816 8.81005,29.52082 6.32176,9.64847 17.73024,17.13664 29.86366,19.60157 5.41909,1.1009 12.80988,1.21342 19.08004,0.29048 z m -21.64516,-18.69956 c -12.56415,-4.09745 -19.58844,-13.99218 -20.32091,-28.62492 -0.79894,-15.96075 6.55471,-27.92202 19.72607,-32.08594 1.144,-0.36166 2.476,-0.74502 2.96,-0.85191 l 0.88,-0.19434 -0.0429,21.3661 c -0.0236,11.75135 -0.1316,25.8496 -0.24,31.32944 L 184.8,199.28669 Z M 1000,635.18681 c -34.85614,-2.13776 -68.83147,-10.81106 -98.08,-25.0381 -21.87846,-10.64209 -40.26447,-23.56286 -57.23295,-40.22045 -11.33445,-11.12678 -18.48971,-19.62717 -26.1986,-31.12373 -14.68838,-21.90532 -25.37316,-46.84189 -31.09382,-72.56798 -9.30402,-41.84065 -7.96692,-86.23302 3.83953,-127.47457 4.28449,-14.96633 12.41643,-33.28604 21.36992,-48.14239 15.46108,-25.65426 36.15343,-47.2742 61.50353,-64.26059 14.69222,-9.84485 27.47232,-16.50178 44.77239,-23.32114 22.92187,-9.03536 44.7073,-14.3832 68.96,-16.92813 11.03787,-1.15824 14.171,-1.30096 28.48,-1.29733 14.7032,0.004 20.8852,0.3149 31.9946,1.61038 14.0032,1.63293 30.8794,5.15168 44.4623,9.27056 17.7167,5.37239 38.2194,14.04884 51.0631,21.6092 47.4324,27.92074 78.3414,66.29796 95.3501,118.38855 10.3135,31.586 13.6862,73.79408 8.7824,109.90889 -4.0846,30.0818 -14.361,60.07696 -28.5593,83.36 -16.5009,27.059 -37.2156,48.20469 -65.7205,67.08783 -8.8076,5.83462 -11.9239,7.62094 -21.6927,12.43459 -14.6279,7.20798 -29.2054,12.80927 -45.28,17.39844 -14.4489,4.12504 -32.7093,7.33303 -50.4,8.85424 -6.8504,0.58906 -29.4897,0.87064 -36.32,0.45173 z m 33.28,-71.1656 c 20.3032,-2.27944 40.4533,-7.99272 57.12,-16.19554 28.6358,-14.09368 49.5302,-34.33674 64.5581,-62.54569 5.3416,-10.02674 8.663,-18.81984 12.0387,-31.87127 7.7499,-29.96285 7.1594,-64.32914 -1.605,-93.40574 -8.7059,-28.88252 -25.1203,-53.12308 -48.7927,-72.05644 -14.647,-11.71469 -37.0622,-22.59719 -57.2391,-27.78935 -25.9809,-6.68569 -50.0178,-7.33603 -76.32,-2.06487 -25.41282,5.09292 -46.31684,14.26034 -65.92,28.90912 -10.75009,8.03318 -21.99472,19.64314 -29.63569,30.59856 -10.30628,14.77684 -18.45073,32.58977 -22.36104,48.90638 -6.53491,27.2683 -6.86442,55.69172 -0.95031,81.97361 8.79282,39.0747 29.20618,68.96045 61.58704,90.16525 7.32613,4.79755 19.07856,11.07509 25.61586,13.68266 15.80759,6.30526 35.67355,10.94316 51.98414,12.13621 6.0092,0.43954 24.4978,0.16586 29.92,-0.44289 z m 394.1106,66.01253 c -5.4392,-0.14626 -9.9171,-0.3037 -9.9509,-0.34985 -0.072,-0.0985 -46.6764,-143.79671 -102.2529,-315.2839 -21.6178,-66.704 -39.4018,-121.532 -39.5201,-121.84 -0.2041,-0.53117 1.5367,-0.55996 33.8191,-0.55926 18.7188,4e-4 37.357,0.0947 41.4181,0.20953 l 7.3839,0.20879 6.1695,20.35047 c 3.3933,11.19276 11.4943,37.84647 18.0023,59.23047 9.9231,32.60561 14.0943,46.98764 25.8475,89.12 25.587,91.72371 38.2307,136.47428 38.4464,136.07489 0.1172,-0.21719 10.2527,-35.8189 22.5232,-79.1149 35.1224,-123.92758 64.0392,-225.42259 64.2988,-225.68218 0.3067,-0.30672 69.4959,-0.31311 69.8025,-0.006 0.1273,0.12725 10.9851,37.78324 24.1284,83.67999 54.841,191.50513 63.5187,221.57698 63.7705,220.99066 0.1375,-0.32012 6.2125,-22.39803 13.5001,-49.06203 7.2876,-26.664 18.8684,-68.85599 25.7351,-93.75999 l 12.485,-45.28 18.226,-58.24 18.226,-58.24 5.7154,-0.20006 c 3.1435,-0.11003 21.7511,-0.21803 41.3502,-0.24 l 35.6347,-0.0399 -0.1871,0.72 c -0.1029,0.396 -20.3286,62.856 -44.9459,138.8 -24.6172,75.94399 -56.4807,174.27938 -70.8075,218.52307 l -26.0489,80.44308 -30.2027,-0.19246 c -16.6115,-0.10586 -30.2712,-0.26091 -30.3548,-0.34457 -0.084,-0.0837 -5.1797,-16.39643 -11.3246,-36.25061 -13.7479,-44.42 -21.484,-69.27539 -32.6491,-104.89852 -7.8117,-24.92378 -21.5683,-71.93743 -43.1657,-147.51999 -1.8105,-6.336 -3.3849,-11.63033 -3.4986,-11.76518 -0.2054,-0.24347 -13.6355,45.57088 -29.902,102.00517 -6.5869,22.85229 -11.8759,40.18083 -23.6359,77.44 -8.3326,26.4 -20.3244,64.52257 -26.6484,84.71681 l -11.4982,36.71682 -20,-0.047 c -11,-0.0258 -24.4502,-0.16663 -29.8894,-0.3129 z M 440.32,442.40125 V 257.27999 l -16.72,-3.4e-4 c -9.196,-1.8e-4 -24.172,-0.0957 -33.28,-0.21231 l -16.56,-0.21198 v -34.02769 -34.02768 h 33.28 33.28 l 0.003,-4.24 c 0.009,-11.99152 1.52059,-25.97331 4.12747,-38.17185 2.51927,-11.7885 5.39016,-20.18885 10.14334,-29.67982 14.15376,-28.261693 37.58935,-46.154792 71.80609,-54.824032 13.28496,-3.365909 25.54525,-5.30195 39.43836,-6.227767 6.40476,-0.426804 34.05158,-0.216585 41.04164,0.31207 2.288,0.17304 5.46984,0.410359 7.07075,0.527374 l 2.91074,0.212756 0.20926,5.776936 c 0.11509,3.177315 0.20925,18.075556 0.20925,33.107202 0,25.875881 -0.0298,27.321831 -0.56,27.171731 -1.98377,-0.56161 -20.26782,-1.47606 -29.6091,-1.48085 -10.08813,-0.005 -19.60302,1.05203 -27.1754,3.0195 -16.02536,4.16374 -27.89516,13.67976 -34.34794,27.53675 -2.49515,5.35821 -4.29035,11.78315 -5.4094,19.36 -0.67847,4.59383 -1.24957,13.77854 -0.98727,15.87791 l 0.21516,1.72209 H 563.54303 607.68 v 34.08 34.08 h -44.31973 -44.31972 l -0.0803,185.19999 -0.0803,185.2 -39.28,0.0813 -39.28,0.0813 z m 205.33323,80.23873 c -0.11722,-57.684 -0.21315,-184.47599 -0.21318,-281.75999 L 645.44,63.999998 h 34.50912 c 18.98002,0 36.69186,0.09447 39.35964,0.209946 l 4.85052,0.209946 0.0804,281.55004 0.0804,281.55005 h -39.22683 -39.22683 z"/></svg>`;

export interface ContractRenderInput {
  mode: "view" | "pdf";
  type: ContractType;

  // Kunde / Auftraggeber
  customerName: string;
  street: string;
  plzCity: string;

  // Konditionen
  // Bei type='webdesign': setupPriceCents = Herstellungspreis.
  // Bei type='recruiting': setupPriceCents = Agenturleistung (Pauschalvergütung).
  setupPriceCents: number;
  monthlyMaintCents: number;
  paymentMode: "einmal" | "raten";
  installmentCount: number | null;
  paymentMethod: "sepa" | "rechnung";

  // Social-Recruiting-Felder (nur bei type='recruiting')
  adBudgetCents: number;
  jobTitle: string;
  campaignStart: string; // ISO-Datum oder ""; bei type='content' = Vertragsbeginn
  campaignEnd: string; // ISO-Datum oder ""
  applicantGuarantee: boolean;

  // Social-Media-Content-Felder (nur bei type='content')
  contentPlatforms: string;
  postsPerMonth: number | null;
  onsiteProduction: boolean;
  onsiteIntervalMonths: number | null;
  minTermMonths: number;
  noticePeriodWeeks: number;

  // Widerrufsbelehrung beilegen (Privatkunde / Unternehmen in Gründung).
  withdrawalRight: boolean;

  // SEPA-Gläubiger (aus Env)
  creditor: { id: string; name: string; address: string };
  // SEPA-Mandatsreferenz (stabil pro Vertrag)
  mandateReference: string;
  // SEPA-Schuldner (vom Kunden ausgefüllt; im pdf-Modus gesetzt)
  sepa?: { accountHolder: string; ibanDisplay: string } | null;

  // Unterschrift (nur im pdf-Modus)
  signature?: { dataUrl: string; signedAt: string; signerName: string } | null;
  // Hinterlegte swipeflow-Unterschrift (nur im pdf-Modus, falls vorhanden)
  providerSignature?: { dataUrl: string } | null;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function blank(value: string | undefined | null, mode: "view" | "pdf"): string {
  if (value && value.trim()) return esc(value);
  return mode === "view" ? "________________________" : "—";
}

/** Formatiert ein ISO-Datum (YYYY-MM-DD) als deutsches Datum, sonst Platzhalter. */
export function blankDate(iso: string | undefined | null, mode: "view" | "pdf"): string {
  if (iso && iso.trim()) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("de-DE");
  }
  return mode === "view" ? "____________" : "—";
}

// Beide Hosting-Subunternehmer werden im AV-Vertrag IMMER genannt, damit der
// tatsaechlich genutzte Hoster stets vom AV abgedeckt ist — unabhaengig davon,
// welcher Hoster pro Projekt eingesetzt oder spaeter gewechselt wird.
function subprocessorListItems(): string {
  return [
    "Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Deutschland — Hosting und Server-Infrastruktur.",
    "Mittwald CM Service GmbH &amp; Co. KG, Königsberger Straße 4–6, 32339 Espelkamp, Deutschland — Hosting und Server-Infrastruktur.",
  ]
    .map((entry) => `<li>${entry}</li>`)
    .join("");
}

// Beim Recruiting fließen Bewerber-Personendaten über die Landeseite
// (Perspective) und die Werbeplattform (Meta) — beide werden im AVV namentlich
// als Sub-Auftragsverarbeiter benannt, damit die Zustimmung des Verantwortlichen
// direkt im Vertrag eingeholt ist (Art. 28 Abs. 2 DSGVO).
function recruitingSubprocessorListItems(): string {
  return [
    "Perspective Software GmbH, Müggelstraße 22, 10247 Berlin, Deutschland — Erstellung und Bereitstellung der Landeseite (Landing Page) sowie Erfassung von Bewerberanfragen.",
    "Meta Platforms Ireland Ltd., 4 Grand Canal Square, Grand Canal Harbour, Dublin 2, Irland — Schaltung der Werbekampagne und Erfassung von Bewerberanfragen über Facebook und Instagram.",
  ]
    .map((entry) => `<li>${entry}</li>`)
    .join("");
}

function zahlungsbedingungen(input: ContractRenderInput): string {
  const methodWord =
    input.paymentMethod === "sepa"
      ? "per SEPA-Lastschrift eingezogen"
      : "per Rechnung beglichen";

  let satz: string;
  if (input.paymentMode === "raten" && input.installmentCount && input.installmentCount > 1) {
    const { base, last } = splitInstallments(input.setupPriceCents, input.installmentCount);
    const rateText =
      base === last
        ? `${input.installmentCount} aufeinanderfolgenden Monatsraten à ${formatEuro(base)}`
        : `${input.installmentCount} aufeinanderfolgenden Monatsraten (${input.installmentCount - 1} × ${formatEuro(base)}, letzte Rate ${formatEuro(last)})`;
    satz = `Die Vergütung für die Erstellung der Webseite wird in ${rateText} gezahlt und ${methodWord}. Die erste Rate ist mit Unterzeichnung dieses Vertrages fällig und vor Beginn der Umsetzung (Projektstart) zu zahlen.`;
  } else {
    satz = `Die Vergütung für die Erstellung der Webseite ist mit Unterzeichnung dieses Vertrages fällig und vor Beginn der Umsetzung (Projektstart) in einer Summe zu zahlen; sie wird ${methodWord}.`;
  }

  const hostingZusatz =
    input.monthlyMaintCents > 0
      ? ` Die Wartungs- und Hostingpauschale wird unabhängig hiervon einmal jährlich im Voraus abgerechnet.`
      : "";
  return satz + hostingZusatz;
}

// § 3 Abs. 3: Wartungs-/Hostingvergütung. Zahlungsart folgt der vereinbarten
// Methode (SEPA-Lastschrift vs. Rechnung) — sonst widerspräche der Text dem
// SEPA-Mandat. Bei 0 € entfällt die Pauschale (deckungsgleich mit Kostenübersicht).
function wartungHostingVerguetung(input: ContractRenderInput): string {
  if (input.monthlyMaintCents <= 0) {
    return `(3) Für Wartung und Hosting wird im Rahmen dieses Vertrags keine gesonderte monatliche Pauschale berechnet.`;
  }
  const betrag = formatEuro(input.monthlyMaintCents);
  const method =
    input.paymentMethod === "sepa"
      ? "per SEPA-Lastschrift eingezogen"
      : "per Rechnung gestellt";
  return `(3) Der Auftraggeber zahlt für Wartung und Hosting eine monatliche Pauschale von ${betrag} netto. Die Abrechnung erfolgt einmal jährlich im Voraus und wird ${method}.`;
}

function kostenuebersicht(input: ContractRenderInput): string {
  let herstellung = `${formatEuro(input.setupPriceCents)} netto`;
  if (input.paymentMode === "raten" && input.installmentCount && input.installmentCount > 1) {
    const { base, last } = splitInstallments(input.setupPriceCents, input.installmentCount);
    const rate =
      base === last
        ? `${input.installmentCount} × ${formatEuro(base)}`
        : `${input.installmentCount - 1} × ${formatEuro(base)} + letzte Rate ${formatEuro(last)}`;
    herstellung += ` (zahlbar in ${rate})`;
  }
  const wartung =
    input.monthlyMaintCents > 0
      ? `${formatEuro(input.monthlyMaintCents)} netto / Monat (${formatEuro(input.monthlyMaintCents * 12)} jährlich im Voraus)`
      : "entfällt";
  const method = input.paymentMethod === "sepa" ? "SEPA-Lastschrift" : "Rechnung";
  return `
    <h3>Kostenübersicht</h3>
    <table class="kv costs">
      <tr><td>Einmalige Herstellung der Webseite</td><td>${herstellung}</td></tr>
      <tr><td>Wartung &amp; Hosting</td><td>${wartung}</td></tr>
      <tr><td>Zahlungsart (Erstellung)</td><td>${method}</td></tr>
    </table>
    <p class="muted">Alle Preise verstehen sich zzgl. der jeweils geltenden gesetzlichen Mehrwertsteuer.</p>
  `;
}

function sepaMandateSection(input: ContractRenderInput): string {
  if (input.paymentMethod !== "sepa") return "";
  const holder = blank(input.sepa?.accountHolder, input.mode);
  const iban = blank(input.sepa?.ibanDisplay, input.mode);
  let zweck: string;
  if (input.type === "recruiting") {
    zweck = "Es handelt sich um die Zahlung der Agenturleistung und des Werbebudgets aus diesem Vertrag.";
  } else if (input.type === "content") {
    zweck = "Es handelt sich um die wiederkehrende Zahlung der monatlichen Vergütung für die Social-Media-Betreuung sowie ggf. eine einmalige Einrichtungsgebühr.";
  } else {
    zweck = "Es handelt sich um wiederkehrende Zahlungen (Wartung/Hosting) sowie ggf. die Zahlung(en) für die Erstellung der Webseite.";
  }
  return `
    <h2>SEPA-Lastschriftmandat</h2>
    <p>
      Ich ermächtige die ${esc(input.creditor.name)}, Zahlungen aus diesem Vertrag von
      meinem Konto mittels SEPA-Lastschrift einzuziehen. Zugleich weise ich mein
      Kreditinstitut an, die von der ${esc(input.creditor.name)} auf mein Konto gezogenen
      Lastschriften einzulösen. ${zweck}
    </p>
    <p>
      Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die
      Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem
      Kreditinstitut vereinbarten Bedingungen.
    </p>
    <p>
      Die Vorabankündigung (Pre-Notification) über Betrag und Fälligkeit eines Einzugs
      erfolgt mit einer auf mindestens einen Tag verkürzten Frist, in der Regel mit der
      jeweiligen Rechnungsstellung.
    </p>
    <table class="kv">
      <tr><td>Zahlungsempfänger (Gläubiger)</td><td>${esc(input.creditor.name)}, ${esc(input.creditor.address)}</td></tr>
      <tr><td>Gläubiger-Identifikationsnummer</td><td>${blank(input.creditor.id, input.mode)}</td></tr>
      <tr><td>Mandatsreferenz</td><td>${esc(input.mandateReference)}</td></tr>
      <tr><td>Kontoinhaber</td><td>${holder}</td></tr>
      <tr><td>IBAN</td><td>${iban}</td></tr>
    </table>
  `;
}

// Widerrufsbelehrung (Fernabsatz, Dienstleistung) — gilt nur für Verbraucher
// (§ 13 BGB). Wird pro Vertrag über input.withdrawalRight gesteuert (Checkbox
// "Privatkunde / Unternehmen in Gründung" auf /vertraege/neu) und klar auf
// Verbraucher eingegrenzt, sodass Unternehmer hieraus kein Widerrufsrecht ableiten.
// HINWEIS: Vor dem Produktiveinsatz anwaltlich prüfen lassen.
function widerrufLeistung(type: ContractType): string {
  if (type === "recruiting") return "Durchführung einer Social-Recruiting-Kampagne zur Personalgewinnung";
  if (type === "content") return "Social-Media-Betreuung (Content-Erstellung und -Veröffentlichung)";
  return "Erstellung, Hosting und Wartung einer Webseite";
}
function widerrufSection(input: ContractRenderInput): string {
  const email = (
    process.env.CONTRACTS_WIDERRUF_EMAIL ||
    process.env.CENTRAL_SMTP_FROM_EMAIL ||
    ""
  ).trim();
  const kontakt = `swipeflow GmbH, Ringstraße 6, 32339 Espelkamp${email ? `, E-Mail: ${esc(email)}` : ""}`;
  return `
    <h2>Teil III – Widerrufsbelehrung für Verbraucher</h2>
    <p class="muted">Die folgende Widerrufsbelehrung gilt nur, sofern Sie den Vertrag als Verbraucher im Sinne des § 13 BGB abschließen, also zu Zwecken, die überwiegend weder Ihrer gewerblichen noch Ihrer selbständigen beruflichen Tätigkeit zugerechnet werden können.</p>

    <h3>Widerrufsrecht</h3>
    <p>Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsschlusses.</p>
    <p>Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (${kontakt}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das unten stehende Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.</p>
    <p>Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.</p>

    <h3>Folgen des Widerrufs</h3>
    <p>Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.</p>
    <p>Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen sollen, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.</p>

    <h3>Muster-Widerrufsformular</h3>
    <p class="muted">(Wenn Sie den Vertrag widerrufen wollen, füllen Sie bitte dieses Formular aus und senden Sie es zurück.)</p>
    <div class="widerruf-form">
      <p>An ${kontakt}:</p>
      <p>Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: ${widerrufLeistung(input.type)}.</p>
      <p>Bestellt am (*) / erhalten am (*): ____________________</p>
      <p>Name des/der Verbraucher(s): ____________________</p>
      <p>Anschrift des/der Verbraucher(s): ____________________</p>
      <p>Datum und Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier): ____________________</p>
      <p class="muted">(*) Unzutreffendes streichen.</p>
    </div>
  `;
}

function signatureBlock(input: ContractRenderInput): string {
  if (input.mode !== "pdf") return "";
  const customerRole = input.type === "webdesign" ? "Auftraggeber" : "Kunde";
  const providerRole = input.type === "webdesign" ? "Dienstleister" : "Agentur";
  if (input.signature) {
    return `
      <h2>Unterschrift</h2>
      <div class="sign-grid">
        <div class="sign-box">
          <div class="sign-img"><img src="${input.signature.dataUrl}" alt="Unterschrift" /></div>
          <div class="sign-line">${esc(input.signature.signerName)} — ${esc(input.signature.signedAt)}</div>
          <div class="sign-cap">${esc(input.customerName)} (${customerRole})</div>
        </div>
        <div class="sign-box">
          <div class="sign-img">${
            input.providerSignature
              ? `<img src="${input.providerSignature.dataUrl}" alt="Unterschrift swipeflow" />`
              : ""
          }</div>
          <div class="sign-line">swipeflow GmbH</div>
          <div class="sign-cap">${providerRole}</div>
        </div>
      </div>
    `;
  }
  // Druckfassung ohne Unterschrift: leere Linien zum handschriftlichen Unterzeichnen.
  return `
    <h2>Unterschriften</h2>
    <div class="sign-grid">
      <div class="sign-box">
        <div class="sign-img"></div>
        <div class="sign-line">Ort, Datum, Unterschrift</div>
        <div class="sign-cap">${esc(input.customerName)} (${customerRole})</div>
      </div>
      <div class="sign-box">
        <div class="sign-img"></div>
        <div class="sign-line">Ort, Datum, Unterschrift</div>
        <div class="sign-cap">swipeflow GmbH (${providerRole})</div>
      </div>
    </div>
  `;
}

function webdesignBody(input: ContractRenderInput): string {
  const websitekosten = formatEuro(input.setupPriceCents);

  return `
    <div class="letterhead">
      ${LOGO_SVG}
    </div>

    <h1>Dienstleistungs- und Auftragsverarbeitungsvertrag</h1>

    <p class="parties">
      <strong>swipeflow GmbH</strong><br />
      Ringstraße 6<br />
      32339 Espelkamp
    </p>
    <p>– im Folgenden „Dienstleister“ genannt –</p>
    <p>und</p>
    <p class="parties">
      <strong>${blank(input.customerName, input.mode)}</strong><br />
      ${blank(input.street, input.mode)}<br />
      ${blank(input.plzCity, input.mode)}
    </p>
    <p>– im Folgenden „Auftraggeber“ genannt –</p>
    <p>wird folgender Dienstleistungs- und Auftragsverarbeitungsvertrag geschlossen:</p>

    <h2>Teil I – Dienstleistungsvertrag (Webseiten-Erstellung, Hosting &amp; Pflege)</h2>

    <h3>§ 1 Vertragsgegenstand</h3>
    <p>(1) Der Dienstleister verpflichtet sich, für den Auftraggeber eine Webseite zu konzipieren, technisch zu realisieren, zu hosten und regelmäßig zu warten.</p>
    <p>(2) Der Leistungsumfang umfasst insbesondere:</p>
    <ul>
      <li>Konzeption, Design und technische Umsetzung der Webseite</li>
      <li>Bereitstellung und Verwaltung des Hostings</li>
      <li>fortlaufende Wartung, Updates und Backups</li>
      <li>technische Betreuung und Support</li>
    </ul>
    <p>(3) Änderungen oder Erweiterungen der Leistungen bedürfen der Schriftform.</p>

    <h3>§ 2 Pflichten des Auftraggebers</h3>
    <p>(1) Der Auftraggeber stellt alle für die Umsetzung erforderlichen Inhalte (Texte, Bilder, Logos etc.) rechtzeitig zur Verfügung.</p>
    <p>(2) Der Auftraggeber sichert zu, dass die übermittelten Materialien frei von Rechten Dritter sind und keine Gesetze verletzen.</p>
    <p>(3) Der Auftraggeber unterstützt den Dienstleister durch rechtzeitige Mitwirkung (z. B. Freigaben, Rückmeldungen, Bereitstellung von Zugangsdaten).</p>

    <h3>§ 3 Wartung, Hosting und Support</h3>
    <p>(1) Der Dienstleister übernimmt für den Auftraggeber die fortlaufende technische Wartung und das Hosting der Webseite.</p>
    <p>(2) Die Wartung umfasst insbesondere:</p>
    <ul>
      <li>regelmäßige Sicherheitsupdates und Systemaktualisierungen,</li>
      <li>Überwachung der Serververfügbarkeit</li>
      <li>Erstellung und Kontrolle von Datensicherungen (Backups),</li>
      <li>Behebung technischer Fehler,</li>
      <li>kleinere inhaltliche Änderungen auf der Webseite (z. B. Texte, Bilder, Öffnungszeiten, Ansprechpartner).</li>
    </ul>
    <p>${wartungHostingVerguetung(input)}</p>
    <p>(4) Änderungen, die den Rahmen der laufenden Pflege übersteigen – insbesondere neue Unterseiten, strukturelle Anpassungen, Designänderungen oder zusätzliche Funktionen – werden nach Aufwand des Dienstleisters abgerechnet.</p>
    <p>(5) Kleine Änderungen sind solche, die innerhalb von 30 Minuten erledigt werden können. Mehrere kleine Änderungen können nach Ermessen des Dienstleisters zusammengefasst werden.</p>
    <p>(6) Der Dienstleister informiert den Auftraggeber vorab, falls eine gewünschte Änderung voraussichtlich über den Leistungsumfang der Wartung hinausgeht.</p>

    <h3>§ 4 Vergütung und Zahlungsbedingungen</h3>
    <p>(1) Die Vergütung für die Erstellung der Webseite beträgt ${websitekosten} netto.</p>
    <p>(2) ${zahlungsbedingungen(input)}</p>
    <p>(3) Zusatzleistungen, die nicht im Angebot enthalten sind, werden gesondert nach Aufwand berechnet.</p>
    <p>(4) Rechnungen sind innerhalb von 14 Tagen nach Zugang ohne Abzug zahlbar${input.paymentMethod === "sepa" ? ", soweit der Rechnungsbetrag nicht per SEPA-Lastschrift eingezogen wird" : ""}.</p>
    <p>(5) Alle Preise verstehen sich zzgl. der jeweils geltenden gesetzlichen Mehrwertsteuer.</p>

    ${kostenuebersicht(input)}

    <h3>§ 5 Laufzeit und Kündigung</h3>
    <p>(1) Der Vertrag tritt mit Unterzeichnung in Kraft.</p>
    <p>(2) Die Erstellung der Webseite endet mit der Abnahme.</p>
    <p>(3) Laufende Wartungs- oder Hostingverträge verlängern sich automatisch um 12 Monate, sofern sie nicht vier Wochen vor Ablauf schriftlich gekündigt werden.</p>
    <p>(4) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.</p>

    <h3>§ 6 Abnahme und Mängel</h3>
    <p>(1) Nach Fertigstellung stellt der Dienstleister dem Auftraggeber eine Testversion zur Prüfung bereit.</p>
    <p>(2) Erfolgt innerhalb von zwanzig Werktagen keine schriftliche Beanstandung, gilt die Webseite als abgenommen.</p>

    <h3>§ 7 Nutzungsrechte</h3>
    <p>(1) Nach vollständiger Zahlung erhält der Auftraggeber ein einfaches, zeitlich und räumlich unbeschränktes Nutzungsrecht an der erstellten Webseite.</p>
    <p>(2) Der Dienstleister bleibt Inhaber der Urheberrechte an entwickelten Quellcodes, Layouts und Konzepten, sofern nichts anderes schriftlich vereinbart wird.</p>
    <p>(3) Der Dienstleister darf die erstellte Webseite als Referenzprojekt nennen, sofern der Auftraggeber dem nicht ausdrücklich widerspricht.</p>

    <h3>§ 8 Haftung</h3>
    <p>(1) Der Dienstleister haftet nur für Vorsatz und grobe Fahrlässigkeit.</p>
    <p>(2) Für Datenverluste haftet der Dienstleister nur, wenn diese durch angemessene Datensicherung vermeidbar gewesen wären.</p>
    <p>(3) Für Inhalte, die vom Auftraggeber bereitgestellt werden, übernimmt der Dienstleister keine Haftung.</p>
    <p>(4) Im Übrigen gelten die gesetzlichen Haftungsregelungen.</p>

    <h3>§ 9 Datenschutz und Auftragsverarbeitung</h3>
    <p>(1) Der Dienstleister verarbeitet personenbezogene Daten ausschließlich im Auftrag und nach Weisung des Auftraggebers gemäß Art. 28 DSGVO.</p>
    <p>(2) Die Bestimmungen zur Auftragsverarbeitung sind integraler Bestandteil dieses Vertrags (Teil II).</p>

    <h3>§ 10 Schlussbestimmungen</h3>
    <p>(1) Änderungen und Ergänzungen dieses Vertrags bedürfen der Schriftform.</p>
    <p>(2) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen unberührt. Die Parteien verpflichten sich, eine wirtschaftlich gleichwertige Regelung zu treffen.</p>
    <p>(3) Es gilt deutsches Recht. Gerichtsstand ist – soweit zulässig – der Sitz des Dienstleisters.</p>

    <h2>Teil II – Auftragsverarbeitungsvertrag (AV-Vertrag) gemäß Art. 28 DSGVO</h2>

    <h3>§ 1 Gegenstand und Dauer</h3>
    <p>(1) Der Dienstleister verarbeitet personenbezogene Daten im Auftrag des Auftraggebers im Zusammenhang mit Betrieb, Hosting und Wartung der Webseite.</p>
    <p>(2) Die Verarbeitung erfolgt ausschließlich auf Grundlage dieses Vertrags und der Weisungen des Auftraggebers.</p>
    <p>(3) Die Laufzeit dieses Teils richtet sich nach der Dauer des Dienstleistungsvertrags.</p>

    <h3>§ 2 Art und Zweck der Verarbeitung</h3>
    <ul>
      <li>Zweck: Betrieb, Pflege, Hosting und Wartung der Webseite.</li>
      <li>Art der Verarbeitung: Erhebung, Speicherung, Übermittlung und Löschung von Daten.</li>
      <li>Betroffene Personen: Besucher der Webseite, Nutzer von Kontaktformularen, Mitarbeiter des Auftraggebers.</li>
      <li>Datenarten: Namen, E-Mail-Adressen, Telefonnummern, Formularinhalte, IP-Adressen, Logfiles, Cookies.</li>
    </ul>

    <h3>§ 3 Rechte und Pflichten des Auftraggebers</h3>
    <p>(1) Der Auftraggeber bleibt Verantwortlicher im Sinne des Art. 4 Nr. 7 DSGVO.</p>
    <p>(2) Der Auftraggeber ist für die Rechtmäßigkeit der Datenverarbeitung verantwortlich.</p>
    <p>(3) Weisungen an den Dienstleister erfolgen schriftlich oder elektronisch.</p>

    <h3>§ 4 Pflichten des Dienstleisters</h3>
    <p>(1) Der Dienstleister verarbeitet personenbezogene Daten ausschließlich gemäß Weisung des Auftraggebers.</p>
    <p>(2) Der Dienstleister gewährleistet Vertraulichkeit durch verpflichtete Mitarbeiter.</p>
    <p>(3) Der Dienstleister trifft angemessene technische und organisatorische Maßnahmen (TOMs) gemäß Art. 32 DSGVO.</p>
    <p>(4) Der Dienstleister unterstützt den Auftraggeber bei der Erfüllung von Betroffenenrechten (Art. 15–22 DSGVO) sowie Meldepflichten (Art. 33 und 34 DSGVO).</p>
    <p>(5) Nach Beendigung des Vertrags löscht der Dienstleister alle personenbezogenen Daten, sofern keine gesetzlichen Aufbewahrungspflichten bestehen.</p>

    <h3>§ 5 Technische und organisatorische Maßnahmen (TOMs)</h3>
    <p>Der Dienstleister gewährleistet mindestens folgende Maßnahmen:</p>
    <ul>
      <li>Passwortschutz und Zugriffsbeschränkungen auf Systeme</li>
      <li>SSL/TLS-Verschlüsselung sämtlicher Datenübertragungen</li>
      <li>Protokollierung und Monitoring von Systemzugriffen</li>
    </ul>
    <p>Eine detaillierte TOM-Dokumentation kann auf Anfrage bereitgestellt werden.</p>

    <h3>§ 6 Subunternehmer</h3>
    <p>(1) Der Dienstleister darf Subunternehmer einsetzen, soweit dies zur Erfüllung der vertraglichen Leistungen erforderlich ist.</p>
    <p>(2) Der Auftraggeber stimmt dem Einsatz folgender Subunternehmer zu. Das Hosting wird durch einen dieser Anbieter erbracht:</p>
    <ul>${subprocessorListItems()}</ul>
    <p>(3) Der Dienstleister informiert den Auftraggeber über beabsichtigte Änderungen in Bezug auf die Hinzuziehung oder Ersetzung weiterer Subunternehmer.</p>
    <p>(4) Der Dienstleister bleibt gegenüber dem Auftraggeber für die Einhaltung aller Datenschutzpflichten verantwortlich.</p>

    <h3>§ 7 Kontrollrechte</h3>
    <p>(1) Der Auftraggeber ist berechtigt, die Einhaltung der DSGVO und dieses Vertrags beim Dienstleister zu kontrollieren.</p>
    <p>(2) Der Dienstleister stellt auf Anfrage Nachweise über die getroffenen TOMs zur Verfügung.</p>

    <h3>§ 8 Haftung</h3>
    <p>(1) Der Dienstleister haftet für Verstöße gegen diesen Vertrag oder die DSGVO nur im Rahmen seiner gesetzlichen Verantwortlichkeit.</p>
    <p>(2) Im Übrigen gelten die Haftungsregelungen des Dienstleistungsvertrags.</p>

    <h3>§ 9 Schlussbestimmungen</h3>
    <p>(1) Änderungen und Ergänzungen dieses Teils bedürfen der Schriftform.</p>
    <p>(2) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen unberührt.</p>
    <p>(3) Es gilt deutsches Recht. Gerichtsstand ist der Sitz des Dienstleisters.</p>

    ${input.withdrawalRight ? widerrufSection(input) : ""}

    ${sepaMandateSection(input)}

    ${signatureBlock(input)}
  `;
}

export function wrapDocument(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1a1a1a; line-height: 1.5; font-size: 11pt; margin: 0;
  }
  .doc { max-width: 800px; margin: 0 auto; padding: 0; }
  @media screen {
    body { background: #f3f4f6; }
    .doc { background: #fff; margin: 24px auto; padding: 48px 56px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  }
  .letterhead { display: flex; align-items: center; padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid #e5e7eb; }
  .letterhead svg { display: block; }
  h1 { font-size: 20pt; margin: 0 0 16px; }
  h2 { font-size: 14pt; margin: 28px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  h3 { font-size: 11.5pt; margin: 18px 0 4px; }
  p { margin: 6px 0; }
  p.muted { color: #777; font-size: 9.5pt; margin-top: 4px; }
  ul { margin: 6px 0; padding-left: 20px; }
  li { margin: 2px 0; }
  .parties { margin: 10px 0; }
  table.kv { width: 100%; border-collapse: collapse; margin: 10px 0; }
  table.kv td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; font-size: 10.5pt; }
  table.kv td:first-child { width: 40%; color: #555; }
  table.costs { margin: 8px 0; }
  table.costs td { background: #f5f5f7; }
  table.costs td:last-child { font-weight: 600; color: #020f13; }
  .widerruf-form { margin: 10px 0; padding: 12px 14px; background: #f5f5f7; border-radius: 8px; font-size: 10.5pt; }
  .widerruf-form p { margin: 8px 0; }
  .sign-grid { display: flex; gap: 32px; margin-top: 16px; }
  .sign-box { flex: 1; }
  .sign-img { height: 72px; border-bottom: 1px solid #333; display: flex; align-items: flex-end; justify-content: flex-start; padding: 0 4px 6px; }
  .sign-img img { max-height: 58px; max-width: 90%; object-fit: contain; }
  .sign-line { font-size: 10pt; margin-top: 4px; }
  .sign-cap { font-size: 9pt; color: #777; }
</style>
</head>
<body>
  <div class="doc">${body}</div>
</body>
</html>`;
}

// § 4 Abs. 2: Fälligkeit/Zahlungsweg. Bei Rechnung folgt der PDF-Wortlaut; bei
// SEPA wird stattdessen der Lastschrifteinzug genannt (sonst widerspräche der
// Text dem SEPA-Mandat).
function recruitingZahlung(input: ContractRenderInput): string {
  const start = blankDate(input.campaignStart, input.mode);
  if (input.paymentMethod === "sepa") {
    return `4.2 Die Zahlung wird per SEPA-Lastschrift eingezogen und ist vor dem Kampagnenstart am ${start} ohne Abzüge fällig.`;
  }
  return `4.2 Die Zahlung erfolgt nach Rechnungstellung durch die Agentur und ist vor dem Kampagnenstart am ${start} ohne Abzüge fällig.`;
}

// Bewerbergarantie (Ziff. 2.3–2.5) — nur wenn pro Vertrag aktiviert.
function bewerbergarantie(input: ContractRenderInput): string {
  if (!input.applicantGuarantee) return "";
  return `
    <p>2.3 Sollten innerhalb der ersten 30 Tage nach dem Kampagnenstart keine fünf qualifizierten Bewerber eingehen, kann die Kampagne nach vorheriger schriftlicher Zustimmung des Kunden einmalig um weitere 30 Tage verlängert werden. In diesem Fall trägt der Kunde lediglich die anfallenden Werbekosten; eine zusätzliche Dienstleistungspauschale wird für den Verlängerungszeitraum nicht erhoben.</p>
    <p>2.4 Gehen auch nach Ablauf des Verlängerungszeitraums (insgesamt 60 Tage Kampagnenlaufzeit) weniger als fünf qualifizierte Bewerber ein, verpflichtet sich die Agentur, 60 % der ursprünglich vereinbarten Dienstleistungspauschale an den Kunden zu erstatten.</p>
    <p>2.5 Der Kunde hat einen etwaigen Erstattungsanspruch gemäß Ziffer 2.4 innerhalb von 30 Tagen nach Ende der Kampagnenlaufzeit schriftlich geltend zu machen.</p>
  `;
}

function recruitingBody(input: ContractRenderInput): string {
  const agentur = formatEuro(input.setupPriceCents);
  const budget = formatEuro(input.adBudgetCents);
  const laufzeit = `${blankDate(input.campaignStart, input.mode)} – ${blankDate(input.campaignEnd, input.mode)}`;

  return `
    <div class="letterhead">
      ${LOGO_SVG}
    </div>

    <h1>Agentur- und Auftragsverarbeitungsvertrag</h1>

    <p>zwischen</p>
    <p class="parties">
      <strong>${blank(input.customerName, input.mode)}</strong><br />
      ${blank(input.street, input.mode)}<br />
      ${blank(input.plzCity, input.mode)}
    </p>
    <p>– im Folgenden „Kunde“ genannt –</p>
    <p>und</p>
    <p class="parties">
      <strong>swipeflow GmbH</strong><br />
      Ringstraße 6<br />
      32339 Espelkamp
    </p>
    <p>– im Folgenden „Agentur“ genannt –</p>
    <p>wird folgender Rahmenvertrag samt Auftragsverarbeitungsvertrag geschlossen:</p>

    <h2>Teil 1 – Agenturvertrag</h2>

    <h3>1. Vertragsgegenstand</h3>
    <p>1.1 Die Agentur erbringt für den Kunden Dienstleistungen im Bereich Social Recruiting, darunter:</p>
    <ul>
      <li>Erstellung von Social Media Stellenanzeigen (Text &amp; Grafiken)</li>
      <li>Bau einer Landeseite (Landing Page) für den Bewerbungsprozess.</li>
      <li>Schalten und Optimieren von Werbekampagnen auf Social Media Plattformen (Facebook und Instagram.)</li>
    </ul>
    <p>1.2 Die Kampagne wird mit folgenden Daten konkret festgelegt:</p>
    <table class="kv">
      <tr><td>Jobtitel</td><td>${blank(input.jobTitle, input.mode)}</td></tr>
      <tr><td>Laufzeit</td><td>${laufzeit}</td></tr>
      <tr><td>Preis</td><td>${agentur} Agenturleistung + ${budget} Werbebudget</td></tr>
    </table>
    <p>Sofern die Korrekturschleife vor dem ursprünglich geplanten Startdatum abgeschlossen ist und der Kunde einen früheren Kampagnenstart ausdrücklich wünscht, beginnt die Laufzeit der Kampagne entsprechend vorzeitig. In diesem Fall verschiebt sich das ursprünglich vereinbarte Enddatum um denselben Zeitraum nach vorn, sofern nichts Abweichendes vereinbart wird.</p>
    <p>1.3 Folgeaufträge oder neue Kampagnen werden durch separate Auftragsbestätigungen konkretisiert. Diese werden Bestandteil dieses Agenturvertrages.</p>

    <h3>2. Vertragslaufzeit &amp; Kündigung</h3>
    <p>2.1 Der Vertrag endet automatisch mit Abschluss der beauftragten Kampagne, ohne dass es einer gesonderten Kündigung bedarf.</p>
    <p>2.2 Eine Verlängerung des Vertrages bedarf der schriftlichen Vereinbarung beider Parteien.</p>
    ${bewerbergarantie(input)}

    <h3>3. Auftragserteilung &amp; Abwicklung</h3>
    <p>Neue Kampagnen oder Folgeaufträge werden durch eine separate Auftragsbestätigung definiert. Diese kann in Schriftform oder per E-Mail erfolgen.</p>

    <h3>4. Vergütung und Zahlungsbedingungen</h3>
    <p>4.1 Der Kunde zahlt der Agentur eine Pauschalvergütung in Höhe von ${agentur} netto für die Erbringung der vereinbarten Leistungen und ${budget} netto als Werbebudget.</p>
    <p>${recruitingZahlung(input)}</p>
    <p>4.3 Die Vergütung von weiteren Kampagnen ist in der Auftragsbestätigung definiert. Der Betrag ist vor dem Kampagnenstart ohne Abzüge fällig.</p>

    <h3>5. Datenschutz &amp; Auftragsverarbeitung</h3>
    <p>Es gilt der gesondert abgeschlossene Auftragsverarbeitungsvertrag (AVV) zwischen den Parteien (Teil 2).</p>

    <h3>6. Nutzungsrechte</h3>
    <p>6.1 Die Agentur überträgt dem Kunden die einfachen, räumlich und zeitlich unbegrenzten Nutzungsrechte an den im Rahmen dieses Vertrages erstellten Inhalten.</p>

    <h3>7. Rechte und Pflichten der Parteien</h3>
    <p>7.1 Die Agentur verpflichtet sich, die vereinbarten Leistungen termingerecht zu erbringen.</p>
    <p>7.2 Der Kunde stellt der Agentur alle notwendigen Informationen und Materialien für die ordnungsgemäße Erfüllung des Auftrags rechtzeitig zur Verfügung.</p>
    <p>7.3 Der Kunde ist verantwortlich für die rechtliche Zulässigkeit der bereitgestellten Inhalte und Materialien.</p>
    <p>7.4 Die Agentur wird keine Inhalte im Namen des Kunden veröffentlichen, ohne vorherige Abstimmung und schriftliche Freigabe durch den Kunden.</p>

    <h2>Teil 2 – Auftragsverarbeitungsvertrag (AVV)</h2>

    <h3>1. Gegenstand und Dauer des Auftrags</h3>
    <p>1.1 Der Auftragsverarbeiter verarbeitet personenbezogene Daten im Auftrag des Verantwortlichen im Rahmen der folgenden Tätigkeiten:</p>
    <ul>
      <li>Erstellung von Social Media Stellenanzeigen (Grafiken und Texte).</li>
      <li>Bau einer Landeseite (Landing Page) für den Bewerbungsprozess.</li>
      <li>Aufsetzen und Schalten der Werbekampagne auf Meta-Plattformen (Instagram &amp; Facebook).</li>
    </ul>
    <p>1.2 Die Dauer dieses AV-Vertrags richtet sich nach der Laufzeit des Hauptvertrags (Teil 1). Nach Beendigung des Hauptvertrags werden die verarbeiteten Daten nach Maßgabe dieses AV-Vertrags gelöscht oder zurückgegeben.</p>

    <h3>2. Art und Zweck der Verarbeitung</h3>
    <p>2.1 Die Verarbeitung der personenbezogenen Daten erfolgt ausschließlich zu dem Zweck, die im Hauptvertrag vereinbarten Dienstleistungen zu erbringen, insbesondere die Durchführung von Social Media-Kampagnen und die Bearbeitung von Bewerbungen.</p>

    <h3>3. Art der personenbezogenen Daten und Kategorien betroffener Personen</h3>
    <p>3.1 Es werden folgende Kategorien personenbezogener Daten verarbeitet:</p>
    <ul>
      <li>Kontaktdaten (z. B. Name, E-Mail-Adresse, Telefonnummer)</li>
      <li>Bewerbungsdaten (z. B. Lebenslauf, Anschreiben, Zeugnisse)</li>
      <li>Nutzungsdaten (z. B. IP-Adressen, Zugriffszeiten)</li>
    </ul>
    <p>3.2 Die Verarbeitung betrifft folgende Kategorien betroffener Personen:</p>
    <ul>
      <li>Bewerber auf die vom Verantwortlichen ausgeschriebenen Stellen.</li>
    </ul>

    <h3>4. Pflichten und Rechte des Verantwortlichen</h3>
    <p>4.1 Der Verantwortliche ist für die Rechtmäßigkeit der Verarbeitung personenbezogener Daten sowie für die Wahrung der Rechte der betroffenen Personen verantwortlich.</p>
    <p>4.2 Der Verantwortliche stellt sicher, dass die personenbezogenen Daten in einer Weise erhoben werden, die den Anforderungen der DSGVO entspricht.</p>
    <p>4.3 Der Verantwortliche hat das Recht, die Einhaltung der datenschutzrechtlichen Vorschriften durch den Auftragsverarbeiter in angemessenen Abständen zu prüfen.</p>

    <h3>5. Pflichten des Auftragsverarbeiters</h3>
    <p>5.1 Der Auftragsverarbeiter verarbeitet personenbezogene Daten ausschließlich auf dokumentierte Weisung des Verantwortlichen.</p>
    <p>5.2 Der Auftragsverarbeiter stellt sicher, dass die mit der Verarbeitung von personenbezogenen Daten befassten Personen zur Vertraulichkeit verpflichtet sind und dies schriftlich bestätigt wurde.</p>
    <p>5.3 Der Auftragsverarbeiter ergreift alle erforderlichen technischen und organisatorischen Maßnahmen (TOMs) gemäß Art. 32 DSGVO, um ein angemessenes Schutzniveau zu gewährleisten.</p>
    <p>5.4 Der Auftragsverarbeiter unterstützt den Verantwortlichen bei der Erfüllung seiner Pflichten in Bezug auf Anfragen betroffener Personen und die Meldung von Datenschutzverletzungen.</p>
    <p>5.5 Der Auftragsverarbeiter meldet dem Verantwortlichen unverzüglich alle Verstöße gegen den Schutz personenbezogener Daten.</p>

    <h3>6. Einsatz von Subunternehmern</h3>
    <p>6.1 Der Auftragsverarbeiter darf nur mit vorheriger schriftlicher Zustimmung des Verantwortlichen Subunternehmer einsetzen.</p>
    <p>6.2 Der Verantwortliche stimmt dem Einsatz folgender Subunternehmer zu:</p>
    <ul>${recruitingSubprocessorListItems()}</ul>
    <p>6.3 Der Auftragsverarbeiter stellt sicher, dass Subunternehmer ebenfalls zur Einhaltung der datenschutzrechtlichen Bestimmungen verpflichtet werden.</p>

    <h3>7. Technische und organisatorische Maßnahmen (TOMs), Haftung &amp; Gewährleistung</h3>
    <p>7.1 Der Auftragsverarbeiter verpflichtet sich, geeignete technische und organisatorische Maßnahmen zu ergreifen, um die Vertraulichkeit, Integrität, Verfügbarkeit und Belastbarkeit der Systeme und Dienste zu gewährleisten.</p>
    <p>7.2 Eine detaillierte Beschreibung der TOMs ist dem Anhang dieses Vertrages zu entnehmen.</p>

    <h3>8. Rechte der betroffenen Personen</h3>
    <p>8.1 Der Auftragsverarbeiter unterstützt den Verantwortlichen bei der Erfüllung der Rechte der betroffenen Personen gemäß Kapitel III der DSGVO, insbesondere bei Anfragen auf Auskunft, Berichtigung, Löschung oder Einschränkung der Verarbeitung.</p>

    <h3>9. Löschung und Rückgabe der Daten</h3>
    <p>9.1 Nach Beendigung des Hauptvertrags und/oder auf Weisung des Verantwortlichen löscht der Auftragsverarbeiter alle personenbezogenen Daten, sofern nicht gesetzliche Aufbewahrungspflichten bestehen.</p>

    <h3>10. Schlussbestimmungen</h3>
    <p>10.1 Änderungen und Ergänzungen dieses AV-Vertrags bedürfen der Schriftform.</p>
    <p>10.2 Sollten einzelne Bestimmungen dieses Vertrages unwirksam sein oder werden, so bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>
    <p>10.3 Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist der Sitz des Verantwortlichen.</p>

    ${input.withdrawalRight ? widerrufSection(input) : ""}

    ${sepaMandateSection(input)}

    ${signatureBlock(input)}
  `;
}

// § 1: Posting-Frequenz mit Spielraum-Formulierung.
function contentFrequenz(input: ContractRenderInput): string {
  const n = input.postsPerMonth;
  if (!n || n < 1) return "in der Regel nach individueller Absprache";
  return `in der Regel ${n} ${n === 1 ? "Beitrag" : "Beiträge"} pro Monat`;
}

// § 3: Vor-Ort-Content-Produktion — optional; bei Deaktivierung stabile
// Negativ-Klausel, damit die §-Nummerierung unverändert bleibt.
function onsiteSection(input: ContractRenderInput): string {
  if (!input.onsiteProduction) {
    return `<p>(1) Eine Vor-Ort-Content-Produktion ist in diesem Vertrag nicht enthalten.</p>`;
  }
  const interval = input.onsiteIntervalMonths;
  // Bewusst vage formuliert — kein fest geschuldeter Rhythmus. Ein gesetztes
  // Intervall erscheint nur als unverbindliche Orientierung.
  const orientierung = interval && interval >= 1
    ? interval === 1
      ? " (in der Regel etwa monatlich)"
      : ` (in der Regel etwa alle ${interval} Monate)`
    : "";
  return `
    <p>(1) Zusätzlich zur laufenden Betreuung erstellt die Agentur von Zeit zu Zeit – nach Bedarf und in Absprache mit dem Kunden${orientierung} – vor Ort neues Foto- und/oder Videomaterial für die zukünftige Content-Erstellung.</p>
    <p>(2) Dabei entstehen insbesondere:</p>
    <ul>
      <li>Fotoaufnahmen vor Ort,</li>
      <li>Videoaufnahmen für zukünftigen Content,</li>
      <li>Team- und Alltagseinblicke,</li>
      <li>Sammlung neuer Inhalte für kommende Beiträge.</li>
    </ul>
    <p>(3) Ein bestimmter Rhythmus oder eine Mindestanzahl an Vor-Ort-Terminen wird hierdurch nicht geschuldet. Die konkreten Termine werden rechtzeitig zwischen den Parteien abgestimmt; der Kunde stellt den Zugang und die erforderliche Mitwirkung sicher.</p>
  `;
}

// § 5: Vergütung — monatliche Pauschale + optionale Einrichtungsgebühr.
function contentVerguetung(input: ContractRenderInput): string {
  const method = input.paymentMethod === "sepa" ? "per SEPA-Lastschrift eingezogen" : "per Rechnung gestellt";
  const monatlich = formatEuro(input.monthlyMaintCents);
  const hasSetup = input.setupPriceCents > 0;
  let n = 1;
  let out = `<p>(${n++}) Der Kunde zahlt für die Social-Media-Betreuung eine monatliche Pauschale von ${monatlich} netto. Die Abrechnung erfolgt monatlich und wird ${method}.</p>`;
  if (hasSetup) {
    out += `<p>(${n++}) Zusätzlich wird eine einmalige Einrichtungsgebühr von ${formatEuro(input.setupPriceCents)} netto für das Onboarding und die Ersteinrichtung berechnet, fällig mit Vertragsbeginn.</p>`;
  }
  out += `<p>(${n++}) Leistungen, die über den vereinbarten Umfang hinausgehen (z. B. zusätzliche Beiträge, Kampagnen, Werbebudgets), werden gesondert nach Aufwand abgerechnet.</p>`;
  out += `<p>(${n++}) Alle Preise verstehen sich zzgl. der jeweils geltenden gesetzlichen Mehrwertsteuer.</p>`;
  return out;
}

function contentKostenuebersicht(input: ContractRenderInput): string {
  const setupRow =
    input.setupPriceCents > 0
      ? `<tr><td>Einmalige Einrichtungsgebühr</td><td>${formatEuro(input.setupPriceCents)} netto</td></tr>`
      : "";
  const method = input.paymentMethod === "sepa" ? "SEPA-Lastschrift" : "Rechnung";
  return `
    <h3>Kostenübersicht</h3>
    <table class="kv costs">
      <tr><td>Monatliche Betreuungspauschale</td><td>${formatEuro(input.monthlyMaintCents)} netto / Monat</td></tr>
      ${setupRow}
      <tr><td>Zahlungsart</td><td>${method}</td></tr>
    </table>
    <p class="muted">Alle Preise verstehen sich zzgl. der jeweils geltenden gesetzlichen Mehrwertsteuer.</p>
  `;
}

// § 6: Laufzeit & Kündigung — unbefristet, mit Mindestlaufzeit & Kündigungsfrist.
function contentLaufzeit(input: ContractRenderInput): string {
  const beginn = input.campaignStart && input.campaignStart.trim()
    ? `am ${blankDate(input.campaignStart, input.mode)}`
    : "mit Unterzeichnung dieses Vertrages";
  const weeks = input.noticePeriodWeeks >= 1 ? input.noticePeriodWeeks : 4;
  const hasMin = input.minTermMonths > 0;
  const kuendigung = hasMin
    ? `mit einer Frist von ${weeks} Wochen zum Monatsende in Textform gekündigt werden, frühestens jedoch zum Ablauf der Mindestlaufzeit`
    : `jederzeit mit einer Frist von ${weeks} Wochen zum Monatsende in Textform gekündigt werden`;
  let n = 1;
  let out = `<p>(${n++}) Der Vertrag beginnt ${beginn} und wird auf unbestimmte Zeit geschlossen.</p>`;
  if (hasMin) {
    out += `<p>(${n++}) Es gilt eine Mindestlaufzeit von ${input.minTermMonths} Monaten.</p>`;
  }
  out += `<p>(${n++}) Der Vertrag kann von beiden Parteien ${kuendigung}.</p>`;
  out += `<p>(${n++}) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.</p>`;
  return out;
}

function contentBody(input: ContractRenderInput): string {
  const platforms = input.contentPlatforms && input.contentPlatforms.trim() ? esc(input.contentPlatforms) : "Instagram und Facebook";

  return `
    <div class="letterhead">
      ${LOGO_SVG}
    </div>

    <h1>Vertrag über Social-Media-Betreuung</h1>

    <p>zwischen</p>
    <p class="parties">
      <strong>${blank(input.customerName, input.mode)}</strong><br />
      ${blank(input.street, input.mode)}<br />
      ${blank(input.plzCity, input.mode)}
    </p>
    <p>– im Folgenden „Kunde“ genannt –</p>
    <p>und</p>
    <p class="parties">
      <strong>swipeflow GmbH</strong><br />
      Ringstraße 6<br />
      32339 Espelkamp
    </p>
    <p>– im Folgenden „Agentur“ genannt –</p>
    <p>wird folgender Vertrag über die laufende Social-Media-Betreuung samt Auftragsverarbeitungsvertrag geschlossen:</p>

    <h2>Teil I – Dienstleistungsvertrag (Social-Media-Betreuung)</h2>

    <h3>§ 1 Vertragsgegenstand</h3>
    <p>(1) Die Agentur übernimmt für den Kunden die laufende Betreuung seiner Social-Media-Kanäle auf den folgenden Plattformen: ${platforms}.</p>
    <p>(2) Die Agentur erstellt ${contentFrequenz(input)} individuell gestaltete Beiträge, abgestimmt auf den Kunden, dessen Zielgruppe sowie dessen bestehenden Außenauftritt.</p>
    <p>(3) Der konkrete Leistungsumfang ergibt sich aus § 2. Die Parteien stimmen Inhalte und Themen laufend ab; die Agentur ist in der konkreten redaktionellen und gestalterischen Umsetzung im Rahmen dieses Vertrags frei.</p>

    <h3>§ 2 Leistungsumfang</h3>
    <p>Die Betreuung umfasst in der Regel insbesondere:</p>
    <ul>
      <li>Erstellung der vereinbarten Social-Media-Beiträge,</li>
      <li>Betreuung der vereinbarten Plattformen (${platforms}),</li>
      <li>Gestaltung passender Grafiken und Inhalte,</li>
      <li>Erstellung von Texten, Captions und Hashtags,</li>
      <li>Content-Planung und Abstimmung mit dem Kunden,</li>
      <li>themenbezogene Beiträge passend zum Unternehmen des Kunden (z. B. saisonale Themen, Aktionen, Team- und Alltagseinblicke).</li>
    </ul>
    <p>Die Aufzählung ist beispielhaft. Inhalte, Themen und Formate können im beiderseitigen Einvernehmen an die Bedürfnisse des Kunden angepasst werden.</p>

    <h3>§ 3 Vor-Ort-Content-Produktion</h3>
    ${onsiteSection(input)}

    <h3>§ 4 Freigabe und Abnahme</h3>
    <p>(1) Die Agentur plant die Inhalte im Voraus und legt sie dem Kunden rechtzeitig vor der geplanten Veröffentlichung zur Freigabe vor.</p>
    <p>(2) Inhalte werden erst nach Freigabe durch den Kunden veröffentlicht. Die Freigabe kann in Textform (z. B. per E-Mail oder über ein vereinbartes Planungstool) erfolgen.</p>
    <p>(3) Äußert sich der Kunde nicht innerhalb einer angemessenen Frist von in der Regel zwei Werktagen nach Vorlage, gilt der jeweilige Inhalt als freigegeben, sofern die Agentur hierauf bei der Vorlage hingewiesen hat.</p>
    <p>(4) Der Kunde ist für die inhaltliche Richtigkeit und rechtliche Zulässigkeit der von ihm freigegebenen Inhalte verantwortlich.</p>

    <h3>§ 5 Vergütung und Zahlungsbedingungen</h3>
    ${contentVerguetung(input)}

    ${contentKostenuebersicht(input)}

    <h3>§ 6 Laufzeit und Kündigung</h3>
    ${contentLaufzeit(input)}

    <h3>§ 7 Mitwirkungspflichten des Kunden</h3>
    <p>(1) Der Kunde stellt der Agentur alle für die Betreuung erforderlichen Informationen, Materialien und Zugänge (z. B. zu den Social-Media-Konten) rechtzeitig zur Verfügung.</p>
    <p>(2) Der Kunde sichert zu, dass die von ihm bereitgestellten Materialien frei von Rechten Dritter sind und keine Gesetze verletzen.</p>
    <p>(3) Der Kunde benennt einen Ansprechpartner für Abstimmungen und Freigaben.</p>

    <h3>§ 8 Nutzungsrechte</h3>
    <p>(1) Nach vollständiger Zahlung der jeweils fälligen Vergütung erhält der Kunde ein einfaches, zeitlich und räumlich unbeschränktes Nutzungsrecht an den für ihn erstellten und veröffentlichten Inhalten.</p>
    <p>(2) Die Agentur darf die erstellten Inhalte als Referenz nennen, sofern der Kunde dem nicht ausdrücklich widerspricht.</p>

    <h3>§ 9 Datenschutz und Auftragsverarbeitung</h3>
    <p>(1) Die Agentur verarbeitet personenbezogene Daten ausschließlich im Auftrag und nach Weisung des Kunden gemäß Art. 28 DSGVO.</p>
    <p>(2) Die Bestimmungen zur Auftragsverarbeitung sind integraler Bestandteil dieses Vertrags (Teil II).</p>

    <h3>§ 10 Haftung</h3>
    <p>(1) Die Agentur haftet nur für Vorsatz und grobe Fahrlässigkeit.</p>
    <p>(2) Für vom Kunden freigegebene oder bereitgestellte Inhalte übernimmt die Agentur keine Haftung.</p>
    <p>(3) Im Übrigen gelten die gesetzlichen Haftungsregelungen.</p>

    <h3>§ 11 Schlussbestimmungen</h3>
    <p>(1) Änderungen und Ergänzungen dieses Vertrags bedürfen der Textform.</p>
    <p>(2) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen unberührt.</p>
    <p>(3) Es gilt deutsches Recht. Gerichtsstand ist – soweit zulässig – der Sitz der Agentur.</p>

    <h2>Teil II – Auftragsverarbeitungsvertrag (AV-Vertrag) gemäß Art. 28 DSGVO</h2>

    <h3>§ 1 Gegenstand und Dauer</h3>
    <p>(1) Die Agentur verarbeitet personenbezogene Daten im Auftrag des Kunden im Zusammenhang mit der Betreuung der Social-Media-Kanäle.</p>
    <p>(2) Die Verarbeitung erfolgt ausschließlich auf Grundlage dieses Vertrags und der Weisungen des Kunden.</p>
    <p>(3) Die Laufzeit dieses Teils richtet sich nach der Dauer des Dienstleistungsvertrags.</p>

    <h3>§ 2 Art und Zweck der Verarbeitung</h3>
    <ul>
      <li>Zweck: Erstellung, Planung, Veröffentlichung und Betreuung von Social-Media-Inhalten.</li>
      <li>Art der Verarbeitung: Erhebung, Speicherung, Bearbeitung, Übermittlung und Löschung von Daten.</li>
      <li>Betroffene Personen: Mitarbeiter des Kunden, abgebildete Personen, Follower und Interagierende der Kanäle.</li>
      <li>Datenarten: Kontaktdaten, Bild- und Videoaufnahmen, Kommentar- und Nachrichteninhalte, Interaktionsdaten.</li>
    </ul>

    <h3>§ 3 Rechte und Pflichten des Kunden</h3>
    <p>(1) Der Kunde bleibt Verantwortlicher im Sinne des Art. 4 Nr. 7 DSGVO.</p>
    <p>(2) Der Kunde ist für die Rechtmäßigkeit der Datenverarbeitung verantwortlich, insbesondere für erforderliche Einwilligungen abgebildeter Personen.</p>
    <p>(3) Weisungen an die Agentur erfolgen in Textform.</p>

    <h3>§ 4 Pflichten der Agentur</h3>
    <p>(1) Die Agentur verarbeitet personenbezogene Daten ausschließlich gemäß Weisung des Kunden.</p>
    <p>(2) Die Agentur gewährleistet Vertraulichkeit durch verpflichtete Mitarbeiter.</p>
    <p>(3) Die Agentur trifft angemessene technische und organisatorische Maßnahmen (TOMs) gemäß Art. 32 DSGVO.</p>
    <p>(4) Die Agentur unterstützt den Kunden bei der Erfüllung von Betroffenenrechten (Art. 15–22 DSGVO) sowie Meldepflichten (Art. 33 und 34 DSGVO).</p>
    <p>(5) Nach Beendigung des Vertrags löscht die Agentur alle personenbezogenen Daten, sofern keine gesetzlichen Aufbewahrungspflichten bestehen.</p>

    <h3>§ 5 Subunternehmer</h3>
    <p>(1) Der Kunde stimmt dem Einsatz der zur Leistungserbringung erforderlichen Dienste zu, insbesondere der Social-Media-Plattformen der Meta Platforms Ireland Ltd. (Instagram, Facebook) sowie eingesetzter Planungs- und Gestaltungstools.</p>
    <p>(2) Die Agentur informiert den Kunden über beabsichtigte Änderungen in Bezug auf weitere Subunternehmer und bleibt für die Einhaltung der Datenschutzpflichten verantwortlich.</p>

    <h3>§ 6 Kontrollrechte</h3>
    <p>(1) Der Kunde ist berechtigt, die Einhaltung der DSGVO und dieses Vertrags bei der Agentur zu kontrollieren.</p>
    <p>(2) Die Agentur stellt auf Anfrage Nachweise über die getroffenen TOMs zur Verfügung.</p>

    <h3>§ 7 Schlussbestimmungen</h3>
    <p>(1) Änderungen und Ergänzungen dieses Teils bedürfen der Textform.</p>
    <p>(2) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen unberührt.</p>
    <p>(3) Es gilt deutsches Recht. Gerichtsstand ist der Sitz der Agentur.</p>

    ${input.withdrawalRight ? widerrufSection(input) : ""}

    ${sepaMandateSection(input)}

    ${signatureBlock(input)}
  `;
}

export function renderContractHtml(input: ContractRenderInput): string {
  if (input.type === "recruiting") {
    return wrapDocument("Agentur- und Auftragsverarbeitungsvertrag", recruitingBody(input));
  }
  if (input.type === "content") {
    return wrapDocument("Vertrag über Social-Media-Betreuung", contentBody(input));
  }
  return wrapDocument("Dienstleistungs- und Auftragsverarbeitungsvertrag", webdesignBody(input));
}
