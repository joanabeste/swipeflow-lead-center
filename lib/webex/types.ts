// Webex Calling Recording — Subset der API-Felder, die wir aus /v1/admin/callingRecordings brauchen.
// Offizielle Doku: https://developer.webex.com/docs/api/v1/call-recording

export interface WebexRecording {
  id: string;
  /** Call/Recording-Name, oft "<destNumber> <timestamp>" */
  topic?: string;
  /** ISO-8601 Zeitstempel Call-Start */
  startTime: string;
  /** Dauer in Sekunden */
  duration?: number;
  /** Nummer des anrufenden Teilnehmers */
  callerNumber?: string;
  /** Nummer des angerufenen Teilnehmers */
  destinationNumber?: string;
  /** ID der Person/des Users in Webex */
  ownerId?: string;
  /** Ansicht: Person-Email / Name */
  ownerEmail?: string;
  /** Signed Download-URL (zeitlich begrenzt gültig) */
  downloadUrl?: string;
  /** Mime-Type, typisch "audio/mpeg" oder "audio/wav" */
  format?: string;
  /** Größe in Bytes */
  sizeBytes?: number;
}
