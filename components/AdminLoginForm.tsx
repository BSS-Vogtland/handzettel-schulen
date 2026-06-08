"use client";

import { FormEvent, useMemo, useState } from "react";
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";

export default function AdminLoginForm({ nextPath }: { nextPath: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const safeNextPath = useMemo(() => {
    if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
      return "/admin";
    }

    if (nextPath === "/admin/login" || nextPath.startsWith("/api/")) {
      return "/admin";
    }

    return nextPath;
  }, [nextPath]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setIsError(false);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          next: safeNextPath,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setIsError(true);
        setMessage(data?.message || "Anmeldung fehlgeschlagen.");
        return;
      }

      setMessage("Anmeldung erfolgreich. Du wirst weitergeleitet.");
      window.location.href = data.next || safeNextPath || "/admin";
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Anmeldung konnte nicht verarbeitet werden."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="next" value={safeNextPath} />

      <div>
        <label className="mb-2 block text-sm font-black text-[#102A43]">
          Benutzername
        </label>
        <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-[#E8DED2] bg-white px-4 shadow-sm focus-within:border-[#12395F]">
          <Mail className="h-5 w-5 text-[#A75B28]" />
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="min-h-12 flex-1 bg-transparent text-base font-semibold text-[#102A43] outline-none placeholder:text-[#9AA7B3]"
            placeholder="Admin-Benutzer"
            required
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-black text-[#102A43]">
          Passwort
        </label>
        <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-[#E8DED2] bg-white px-4 shadow-sm focus-within:border-[#12395F]">
          <Lock className="h-5 w-5 text-[#A75B28]" />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="min-h-12 flex-1 bg-transparent text-base font-semibold text-[#102A43] outline-none placeholder:text-[#9AA7B3]"
            placeholder="Passwort"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="rounded-xl p-2 text-[#52616F] transition hover:bg-[#FBF7F0] hover:text-[#102A43]"
            aria-label={showPassword ? "Passwort ausblenden" : "Passwort anzeigen"}
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
            isError
              ? "border-[#F2B8B8] bg-[#FFF1F1] text-[#B5282D]"
              : "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]"
          }`}
        >
          {message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#B5282D] px-5 py-4 text-base font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ShieldCheck className="h-5 w-5" />
        {isSubmitting ? "Anmeldung läuft …" : "Sicher anmelden"}
      </button>
    </form>
  );
}
