"use client";

import { useState } from "react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

export function PrivacyRequestForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-6 flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        setError(false);
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/privacy/request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.fromEntries(form)),
        });
        const data = await response.json().catch(() => ({}));
        setBusy(false);
        if (response.ok) {
          setMessage("Request received. We will verify your identity by email before changing any record.");
          event.currentTarget.reset();
          return;
        }
        setError(true);
        setMessage(typeof data.error === "string" ? data.error : "Could not submit this request.");
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
        Professional email
        <input name="email" type="email" required autoComplete="email" className="input w-full font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
        Request type
        <select name="requestType" className="input w-full font-normal" defaultValue="access">
          <option value="access">Access my data</option>
          <option value="correct">Correct my data</option>
          <option value="delete">Delete my data</option>
          <option value="suppress">Delete and permanently suppress</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
        Details (optional)
        <textarea
          name="details"
          maxLength={1000}
          className="input min-h-24 w-full font-normal"
          placeholder="Company domain, the email address in our records, or what you want corrected."
        />
      </label>
      {message && (
        <p className={error ? "text-sm text-red-600" : "text-sm text-neutral-600"}>{message}</p>
      )}
      <ThreeDButton type="submit" variant="solid" size="sm" disabled={busy} className="self-start">
        {busy ? "Sending…" : "Submit request"}
      </ThreeDButton>
    </form>
  );
}
