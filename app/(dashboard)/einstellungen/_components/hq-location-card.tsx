"use client";

import { useActionState } from "react";
import type { HqLocation } from "@/lib/app-settings";
import { saveHqLocation } from "../actions";
import { Card, FormStatus, SubmitButton } from "./ui";

export function HqLocationCard({ hq }: { hq: HqLocation }) {
  const [state, formAction, pending] = useActionState(saveHqLocation, undefined);

  return (
    <Card>
      <form action={formAction}>
        <FormStatus state={state} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="hq_label" className="block text-sm font-medium">Bezeichnung</label>
            <input
              id="hq_label"
              name="label"
              defaultValue={hq.label}
              placeholder="z.B. swipeflow GmbH"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
          <div>
            <label htmlFor="hq_address" className="block text-sm font-medium">Adresse</label>
            <input
              id="hq_address"
              name="address"
              defaultValue={hq.address}
              required
              placeholder="Straße + PLZ + Ort"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
        </div>
        <p className="mt-2.5 font-mono text-xs text-gray-400">
          {hq.lat.toFixed(4)}, {hq.lng.toFixed(4)}
        </p>
        <div className="mt-5">
          <SubmitButton pending={pending}>Standort speichern</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
