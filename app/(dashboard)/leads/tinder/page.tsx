import { getQualifyHotkeySettings } from "@/lib/app-settings";
import { requireUser } from "@/lib/auth";
import { claimQualifyWebBatch } from "../qualify-claims-actions";
import { TinderDeck } from "./tinder-deck";

/**
 * Mobile „Lead-Tinder"-Ansicht: reserviert serverseitig denselben disjunkten Batch
 * wie das Desktop-Cockpit, liefert aber NUR Leads mit Website (`claimQualifyWebBatch`).
 * Den „blockiert/nicht einbettbar"-Filter macht der Client zusaetzlich. `targetStatusId`
 * steuert (wie im Cockpit) den Ziel-CRM-Status beim Gruen-Wisch.
 */
export default async function LeadTinderPage() {
  const { user } = await requireUser();
  const [cards, settings] = await Promise.all([
    claimQualifyWebBatch(),
    getQualifyHotkeySettings(user.id),
  ]);

  return <TinderDeck initialCards={cards} targetStatusId={settings.targetStatusId} />;
}
