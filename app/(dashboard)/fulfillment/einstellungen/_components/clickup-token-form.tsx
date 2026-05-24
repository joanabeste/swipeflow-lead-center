"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { disconnectClickup, saveClickupToken } from "../actions";
import { useToastContext } from "../../../toast-provider";

export function ClickupTokenForm({
  isConfigured,
  workspaceName,
}: {
  isConfigured: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
}) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [workspaceLabel, setWorkspaceLabel] = useState("");

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) {
      addToast("Token fehlt.", "error");
      return;
    }
    startTransition(async () => {
      const res = await saveClickupToken(token.trim(), workspace.trim() || undefined, workspaceLabel.trim() || undefined);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("ClickUp verbunden.", "success");
        setToken("");
        setWorkspace("");
        setWorkspaceLabel("");
      }
    });
  }

  function disconnect() {
    if (!confirm("Verbindung trennen? Alle Task-Caches werden geloescht und Projekte verlieren ihr List-Mapping.")) return;
    startTransition(async () => {
      const res = await disconnectClickup();
      if ("error" in res) addToast(res.error, "error");
      else addToast("ClickUp getrennt.", "success");
    });
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      {isConfigured ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Verbunden</p>
              {workspaceName && <p className="text-xs text-gray-500">Workspace: {workspaceName}</p>}
            </div>
            <button onClick={disconnect} disabled={pending} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" /> Trennen
            </button>
          </div>
          <p className="text-xs text-gray-400">Um Token oder Workspace zu wechseln, erst trennen, dann neu verbinden.</p>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <p className="text-xs text-gray-500">
            Personal-API-Token aus ClickUp → Apps → API-Token.{" "}
            <a href="https://clickup.com/api" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Doku <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          <Field label="API-Token *">
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="pk_…" className={inputCls} required />
          </Field>
          <Field label="Workspace-ID (Team-ID)">
            <input value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="z.B. 90120…" className={inputCls} />
          </Field>
          <Field label="Workspace-Name (zur Anzeige)">
            <input value={workspaceLabel} onChange={(e) => setWorkspaceLabel(e.target.value)} placeholder="z.B. Swipeflow" className={inputCls} />
          </Field>
          <div className="flex justify-end">
            <button type="submit" disabled={pending} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
              {pending ? "Pruefen…" : "Verbinden"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-gray-400">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
