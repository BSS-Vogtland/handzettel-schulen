"use client";

import { useEffect, useState } from "react";
import { Cookie, Settings2, ShieldCheck, X } from "lucide-react";

type ConsentPreferences = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  externalMedia: boolean;
  version: number;
  updatedAt: string;
};

const STORAGE_KEY = "handzettel_cookie_consent_v1";
const CONSENT_VERSION = 1;

const defaultPreferences: ConsentPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  externalMedia: false,
  version: CONSENT_VERSION,
  updatedAt: "",
};

function readStoredConsent(): ConsentPreferences | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ConsentPreferences>;

    if (parsed.version !== CONSENT_VERSION) return null;

    return {
      necessary: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      externalMedia: Boolean(parsed.externalMedia),
      version: CONSENT_VERSION,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function saveConsent(preferences: ConsentPreferences) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));

  window.dispatchEvent(
    new CustomEvent("handzettel_cookie_consent_updated", {
      detail: preferences,
    })
  );
}

function buildPreferences(input: Partial<ConsentPreferences>) {
  return {
    necessary: true,
    analytics: Boolean(input.analytics),
    marketing: Boolean(input.marketing),
    externalMedia: Boolean(input.externalMedia),
    version: CONSENT_VERSION,
    updatedAt: new Date().toISOString(),
  } satisfies ConsentPreferences;
}

export function getHandzettelCookieConsent() {
  return readStoredConsent();
}

export default function CookieConsentBanner() {
  const [mounted, setMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] =
    useState<ConsentPreferences>(defaultPreferences);

  useEffect(() => {
    setMounted(true);

    const storedConsent = readStoredConsent();

    if (storedConsent) {
      setPreferences(storedConsent);
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
  }, []);

  function acceptNecessaryOnly() {
    const nextPreferences = buildPreferences({
      analytics: false,
      marketing: false,
      externalMedia: false,
    });

    setPreferences(nextPreferences);
    saveConsent(nextPreferences);
    setIsVisible(false);
    setShowSettings(false);
  }

  function acceptAll() {
    const nextPreferences = buildPreferences({
      analytics: true,
      marketing: true,
      externalMedia: true,
    });

    setPreferences(nextPreferences);
    saveConsent(nextPreferences);
    setIsVisible(false);
    setShowSettings(false);
  }

  function saveCustomSelection() {
    const nextPreferences = buildPreferences(preferences);

    setPreferences(nextPreferences);
    saveConsent(nextPreferences);
    setIsVisible(false);
    setShowSettings(false);
  }

  function updatePreference(
    key: "analytics" | "marketing" | "externalMedia",
    checked: boolean
  ) {
    setPreferences((current) => ({
      ...current,
      [key]: checked,
    }));
  }

  if (!mounted) return null;

  if (!isVisible) {
    return (
      <button
        type="button"
        onClick={() => {
          const storedConsent = readStoredConsent();

          if (storedConsent) {
            setPreferences(storedConsent);
          }

          setShowSettings(true);
          setIsVisible(true);
        }}
        className="fixed bottom-3 left-3 z-40 inline-flex items-center gap-2 rounded-full border border-[#E8DED2] bg-white/95 px-3 py-2 text-xs font-black text-[#102A43] shadow-lg backdrop-blur transition hover:bg-[#FBF7F0]"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Cookies
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[28px] border border-[#E8DED2] bg-white shadow-[0_22px_70px_rgba(16,42,67,0.22)]">
        <div className="grid gap-0 lg:grid-cols-[1fr_360px]">
          <div className="p-5 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
                  <Cookie className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                    Datenschutz & Cookies
                  </p>

                  <h2 className="mt-1 text-xl font-black text-[#102A43]">
                    Wir verwenden Cookies bewusst sparsam.
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={acceptNecessaryOnly}
                className="rounded-full p-2 text-[#52616F] transition hover:bg-[#FBF7F0] hover:text-[#102A43]"
                aria-label="Cookie-Hinweis schließen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!showSettings ? (
              <>
                <p className="text-sm font-semibold leading-6 text-[#52616F]">
                  Aktuell nutzen wir nur technisch notwendige Speicherung und
                  diese Consent-Auswahl. Analyse-, Marketing- oder externe
                  Medien-Dienste werden erst aktiviert, wenn Du zustimmst und
                  wir solche Dienste später wirklich einbinden.
                </p>

                <div className="mt-4 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4 text-sm font-bold leading-6 text-[#2F7D50]">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    Datenschutzfreundlicher Start: Ohne Deine Zustimmung laden
                    wir keine Analyse- oder Marketing-Skripte.
                  </div>
                </div>
              </>
            ) : (
              <div className="grid gap-3">
                <label className="flex items-start gap-3 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    className="mt-1 h-4 w-4 accent-[#2F7D50]"
                  />
                  <span>
                    <span className="block font-black text-[#102A43]">
                      Notwendig
                    </span>
                    <span className="mt-1 block text-sm font-semibold leading-6 text-[#52616F]">
                      Erforderlich für Grundfunktionen, Sicherheit und das
                      Speichern Deiner Cookie-Auswahl.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
                  <input
                    type="checkbox"
                    checked={preferences.analytics}
                    onChange={(event) =>
                      updatePreference("analytics", event.target.checked)
                    }
                    className="mt-1 h-4 w-4 accent-[#12395F]"
                  />
                  <span>
                    <span className="block font-black text-[#102A43]">
                      Analyse
                    </span>
                    <span className="mt-1 block text-sm font-semibold leading-6 text-[#52616F]">
                      Für spätere Besucheranalyse, z. B. wenn wir Google
                      Analytics oder ähnliche Werkzeuge einbauen.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
                  <input
                    type="checkbox"
                    checked={preferences.marketing}
                    onChange={(event) =>
                      updatePreference("marketing", event.target.checked)
                    }
                    className="mt-1 h-4 w-4 accent-[#B5282D]"
                  />
                  <span>
                    <span className="block font-black text-[#102A43]">
                      Marketing
                    </span>
                    <span className="mt-1 block text-sm font-semibold leading-6 text-[#52616F]">
                      Für spätere Werbe- oder Conversion-Messung, z. B. Ads oder
                      Pixel.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
                  <input
                    type="checkbox"
                    checked={preferences.externalMedia}
                    onChange={(event) =>
                      updatePreference("externalMedia", event.target.checked)
                    }
                    className="mt-1 h-4 w-4 accent-[#A75B28]"
                  />
                  <span>
                    <span className="block font-black text-[#102A43]">
                      Externe Medien
                    </span>
                    <span className="mt-1 block text-sm font-semibold leading-6 text-[#52616F]">
                      Für spätere eingebettete Inhalte, z. B. Karten, Videos
                      oder externe Medien.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>

          <div className="border-t border-[#E8DED2] bg-[#FBF7F0] p-5 sm:p-6 lg:border-l lg:border-t-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Auswahl
            </p>

            <div className="mt-4 grid gap-3">
              <button
                type="button"
                onClick={acceptAll}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                Alle akzeptieren
              </button>

              {showSettings ? (
                <button
                  type="button"
                  onClick={saveCustomSelection}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                >
                  Auswahl speichern
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#E8DED2] bg-white px-5 py-3 text-sm font-black text-[#102A43] transition hover:bg-[#FBF7F0]"
                >
                  Einstellungen
                </button>
              )}

              <button
                type="button"
                onClick={acceptNecessaryOnly}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#E8DED2] bg-white px-5 py-3 text-sm font-black text-[#102A43] transition hover:bg-[#FBF7F0]"
              >
                Nur notwendige
              </button>
            </div>

            <a
              href="/cookies"
              className="mt-4 inline-flex text-xs font-black text-[#12395F] transition hover:text-[#B5282D]"
            >
              Cookie-Hinweise ansehen
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}