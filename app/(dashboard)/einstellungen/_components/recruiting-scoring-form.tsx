"use client";

import { useActionState } from "react";
import type { RecruitingScoringConfig } from "@/lib/types";
import { saveRecruitingScoring } from "../actions";
import { Card, FormStatus, SubmitButton } from "./ui";

export function RecruitingScoringForm({ config }: { config: RecruitingScoringConfig }) {
  const [state, formAction, pending] = useActionState(saveRecruitingScoring, undefined);

  return (
    <Card>
      <form action={formAction}>
        <FormStatus state={state} />

        <div>
          <label htmlFor="min_jobs" className="block text-sm font-medium">
            Mindest-Stellenanzeigen für Qualifizierung
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Eine Firma muss beim Enrichment mindestens so viele offene Stellen haben. <span className="text-gray-400">0 = nicht erforderlich</span>
          </p>
          <input
            id="min_jobs"
            name="min_job_postings_to_qualify"
            type="number"
            min={0}
            max={50}
            defaultValue={config.min_job_postings_to_qualify}
            className="mt-2 w-32 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
          />
        </div>

        <div className="mt-6 space-y-3">
          <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 p-3.5 text-sm transition has-[:checked]:border-primary has-[:checked]:bg-primary/5 dark:border-[#2c2c2e] dark:has-[:checked]:border-primary/60 dark:has-[:checked]:bg-primary/10">
            <input
              type="checkbox"
              name="require_contact_email"
              defaultChecked={config.require_contact_email}
              className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
            />
            <span>
              <span className="block font-medium">E-Mail-Adresse beim Kontakt erforderlich</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Qualifizierung nur, wenn mindestens ein Kontakt eine E-Mail hat.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 p-3.5 text-sm transition has-[:checked]:border-primary has-[:checked]:bg-primary/5 dark:border-[#2c2c2e] dark:has-[:checked]:border-primary/60 dark:has-[:checked]:bg-primary/10">
            <input
              type="checkbox"
              name="require_hr_contact"
              defaultChecked={config.require_hr_contact}
              className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
            />
            <span>
              <span className="block font-medium">HR-Kontakt erforderlich</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Nur qualifizieren, wenn mindestens ein Kontakt als HR, Personal, Recruiting, Talent, People oder Ausbildung erkannt wird.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-6">
          <SubmitButton pending={pending}>Recruiting-Bewertung speichern</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
