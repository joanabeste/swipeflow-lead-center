"use client";

import { useActionState } from "react";
import type { CallQueueSettings } from "@/lib/app-settings";
import { saveCallQueueSettings } from "../actions";
import { Card, FormStatus, SubmitButton } from "./ui";

export function CallQueueSettingsCard({ settings }: { settings: CallQueueSettings }) {
  const [state, formAction, pending] = useActionState(saveCallQueueSettings, undefined);

  return (
    <Card>
      <form action={formAction}>
        <FormStatus state={state} />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="ring_timeout_seconds" className="block text-sm font-medium">
              Ring-Timeout (Sekunden)
            </label>
            <input
              id="ring_timeout_seconds"
              name="ring_timeout_seconds"
              type="number"
              min={5}
              max={120}
              step={1}
              required
              defaultValue={settings.ringTimeoutSeconds}
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Wenn nach dieser Zeit kein Status vom Provider kommt, gilt der Anruf als verpasst und der nächste Lead wird geladen. (5–120 s)
            </p>
          </div>
          <div>
            <label htmlFor="auto_advance_delay_seconds" className="block text-sm font-medium">
              Wartezeit bis nächster Anruf (Sekunden)
            </label>
            <input
              id="auto_advance_delay_seconds"
              name="auto_advance_delay_seconds"
              type="number"
              min={0}
              max={30}
              step={1}
              required
              defaultValue={settings.autoAdvanceDelaySeconds}
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Pause zwischen „Nicht erreicht&ldquo; und dem automatischen Start des nächsten Calls. (0–30 s)
            </p>
          </div>
        </div>
        <div className="mt-5">
          <SubmitButton pending={pending}>Einstellungen speichern</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
