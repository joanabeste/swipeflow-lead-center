"use client";

import { useTransition, type ReactNode } from "react";
import { Phone } from "lucide-react";
import { startCall } from "@/app/(dashboard)/crm/actions";
import { useToastContext } from "@/app/(dashboard)/toast-provider";
import { useCallProviders } from "./call-providers-context";

interface Props {
  phone: string;
  leadId: string;
  contactId?: string | null;
  className?: string;
  children?: ReactNode;
  showIcon?: boolean;
  stopPropagation?: boolean;
}

export function PhoneCallLink({
  phone,
  leadId,
  contactId = null,
  className,
  children,
  showIcon = true,
  stopPropagation = true,
}: Props) {
  const providers = useCallProviders();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();

  const hasProvider = providers.phonemondo || providers.webex;

  function handleClick(e: React.MouseEvent) {
    if (stopPropagation) e.stopPropagation();
    if (!hasProvider) {
      window.location.href = `tel:${phone}`;
      return;
    }
    e.preventDefault();
    const provider = providers.phonemondo ? "phonemondo" : "webex";
    startTransition(async () => {
      const res = await startCall({ leadId, contactId, phoneNumber: phone, provider });
      if ("error" in res && res.error) {
        addToast(res.error, "error");
      } else {
        addToast(`Anruf via ${provider === "webex" ? "Webex" : "PhoneMondo"} gestartet`, "success");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={className}
      title={hasProvider ? "Direkt anrufen" : "Telefon öffnen"}
    >
      {children ?? (
        <>
          {showIcon && <Phone className="h-3 w-3" />}
          {phone}
        </>
      )}
    </button>
  );
}
