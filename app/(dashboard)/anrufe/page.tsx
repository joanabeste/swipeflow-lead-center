import { PhoneOutgoing } from "lucide-react";
import { loadCallQueue } from "./actions";
import { CallQueueClient } from "./call-queue-client";
import { isPhoneMondoConfigured } from "@/lib/phonemondo/client";
import { getWebexCredentials } from "@/lib/webex/auth";

export default async function AnrufePage() {
  const [queue, webexCreds] = await Promise.all([
    loadCallQueue(),
    getWebexCredentials(),
  ]);

  const providers = {
    phonemondo: isPhoneMondoConfigured(),
    webex: !!webexCreds && (webexCreds.source === "env" || webexCreds.scopes.includes("spark:calls_write")),
  };

  return (
    <div>
      <header className="mb-6 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <PhoneOutgoing className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Anrufe</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Qualifizierte Leads automatisch nacheinander anrufen — bei Nicht-Erreichen springt die Queue weiter.
          </p>
        </div>
      </header>

      {!providers.phonemondo && !providers.webex ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          <p className="font-semibold">Kein Telefonie-Provider konfiguriert.</p>
          <p className="mt-2">
            Richte entweder PhoneMondo oder Webex in den Einstellungen ein,
            bevor du den Auto-Dialer nutzen kannst.
          </p>
        </div>
      ) : (
        <CallQueueClient initialQueue={queue} providers={providers} />
      )}
    </div>
  );
}
