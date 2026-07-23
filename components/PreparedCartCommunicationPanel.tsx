"use client";

import {
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  History,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Send,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type PreparedCartItem = {
  id: string;
  quantity: number | string;
  unit_price_snapshot: number | string;
};

type PreparedCartForCommunication = {
  id: string;
  title: string | null;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  customerUrl: string | null;
  expires_at: string;
  status: string;
  items: PreparedCartItem[];
};

type CommunicationMessage = {
  id: string;
  channel: string;
  status: string;
  recipient: string | null;
  subject: string | null;
  message_text: string;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
};

type Props = {
  cart: PreparedCartForCommunication;
  onChanged?: () => Promise<void> | void;
};

type TemplateKey =
  | "standard"
  | "nachbestellung"
  | "erinnerung"
  | "letzte_erinnerung"
  | "custom";

type MessageTemplate = {
  label: string;
  subject: string;
  message: string;
};

const templates: Record<TemplateKey, MessageTemplate> = {
  standard: {
    label: "Standard",
    subject:
      "Dein vorbereiteter Warenkorb bei Handzettel-Schulen.de",
    message: `Hallo {name},

wir haben Deinen persönlichen Warenkorb vorbereitet.

Du kannst die Zusammenstellung über den folgenden Link prüfen, bearbeiten und anschließend bestellen:

{link}

Der Warenkorb enthält aktuell {anzahl_artikel} Artikel im Wert von {warenwert} und ist bis zum {ablaufdatum} gültig.

Viele Grüße
Dein Team von Handzettel-Schulen.de`,
  },

  nachbestellung: {
    label: "Nachbestellung",
    subject:
      "Deine vorbereitete Nachbestellung bei Handzettel-Schulen.de",
    message: `Hallo {name},

wir haben Deine Nachbestellung vorbereitet.

Hier kannst Du die ausgewählten Artikel prüfen, bei Bedarf ergänzen und anschließend direkt bestellen:

{link}

Aktueller Warenwert: {warenwert}

Viele Grüße
Dein Team von Handzettel-Schulen.de`,
  },

  erinnerung: {
    label: "Erinnerung",
    subject:
      "Erinnerung an Deinen vorbereiteten Warenkorb",
    message: `Hallo {name},

wir möchten Dich kurz an Deinen vorbereiteten Warenkorb erinnern.

Du kannst ihn hier weiterhin prüfen und abschließen:

{link}

Der Link ist bis zum {ablaufdatum} gültig.

Viele Grüße
Dein Team von Handzettel-Schulen.de`,
  },

  letzte_erinnerung: {
    label: "Letzte Erinnerung",
    subject:
      "Dein vorbereiteter Warenkorb läuft bald ab",
    message: `Hallo {name},

Dein vorbereiteter Warenkorb ist noch bis zum {ablaufdatum} verfügbar.

Hier kannst Du ihn prüfen und die Bestellung abschließen:

{link}

Falls Du den Warenkorb nicht mehr benötigst, musst Du nichts weiter tun.

Viele Grüße
Dein Team von Handzettel-Schulen.de`,
  },

  custom: {
    label: "Eigene Nachricht",
    subject: "",
    message: "",
  },
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizeQuantity(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.min(99, Math.floor(parsed)));
}

function normalizeWhatsAppPhone(value: string) {
  let digits = value.replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("0")) {
    digits = `49${digits.slice(1)}`;
  }

  return digits;
}

function replacePlaceholders(
  text: string,
  replacements: Record<string, string>
) {
  let result = text;

  for (const [placeholder, replacement] of Object.entries(
    replacements
  )) {
    result = result.split(placeholder).join(replacement);
  }

  return result;
}

function getChannelLabel(channel: string) {
  switch (channel) {
    case "email":
      return "E-Mail";
    case "whatsapp":
      return "WhatsApp";
    case "copy_link":
      return "Link kopiert";
    default:
      return channel;
  }
}

export default function PreparedCartCommunicationPanel({
  cart,
  onChanged,
}: Props) {
  const [templateKey, setTemplateKey] =
    useState<TemplateKey>("standard");

  const [subject, setSubject] = useState(
    templates.standard.subject
  );

  const [message, setMessage] = useState(
    templates.standard.message
  );

  const [messages, setMessages] = useState<
    CommunicationMessage[]
  >([]);

  const [isLoadingHistory, setIsLoadingHistory] =
    useState(false);

  const [isSendingEmail, setIsSendingEmail] =
    useState(false);

  const [isConfirmingWhatsApp, setIsConfirmingWhatsApp] =
    useState(false);

  const [whatsAppOpened, setWhatsAppOpened] =
    useState(false);

  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const itemCount = useMemo(() => {
    return cart.items.reduce(
      (sum, item) => sum + normalizeQuantity(item.quantity),
      0
    );
  }, [cart.items]);

  const cartTotal = useMemo(() => {
    return cart.items.reduce((sum, item) => {
      const quantity = normalizeQuantity(item.quantity);
      const unitPrice = Number(
        String(item.unit_price_snapshot ?? 0).replace(",", ".")
      );

      return (
        sum +
        quantity *
          (Number.isFinite(unitPrice) ? unitPrice : 0)
      );
    }, 0);
  }, [cart.items]);

  const replacements = useMemo<Record<string, string>>(
    () => ({
      "{name}": cart.customer_name || "Kunde",
      "{email}": cart.email || "",
      "{telefon}": cart.phone || "",
      "{link}": cart.customerUrl || "",
      "{titel}":
        cart.title ||
        `Warenkorb für ${cart.customer_name || "Kunde"}`,
      "{ablaufdatum}": formatDate(cart.expires_at),
      "{anzahl_artikel}": String(itemCount),
      "{warenwert}": formatMoney(cartTotal),
    }),
    [
      cart.customerUrl,
      cart.customer_name,
      cart.email,
      cart.expires_at,
      cart.phone,
      cart.title,
      cartTotal,
      itemCount,
    ]
  );

  const previewSubject = useMemo(
    () => replacePlaceholders(subject, replacements),
    [replacements, subject]
  );

  const previewMessage = useMemo(
    () => replacePlaceholders(message, replacements),
    [message, replacements]
  );

  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);

    try {
      const response = await fetch(
        `/api/admin/prepared-carts/${encodeURIComponent(
          cart.id
        )}/messages`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        messages?: CommunicationMessage[];
      };

      if (!response.ok || !result.ok) {
        setErrorMessage(
          result.message ||
            "Der Kommunikationsverlauf konnte nicht geladen werden."
        );
        return;
      }

      setMessages(result.messages || []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Der Kommunikationsverlauf konnte nicht geladen werden."
      );
    } finally {
      setIsLoadingHistory(false);
    }
  }, [cart.id]);

  useEffect(() => {
    setTemplateKey("standard");
    setSubject(templates.standard.subject);
    setMessage(templates.standard.message);
    setWhatsAppOpened(false);
    setSuccessMessage(null);
    setErrorMessage(null);

    void loadHistory();
  }, [cart.id, loadHistory]);

  function applyTemplate(nextTemplateKey: TemplateKey) {
    const template = templates[nextTemplateKey];

    setTemplateKey(nextTemplateKey);
    setSubject(template.subject);
    setMessage(template.message);
    setWhatsAppOpened(false);
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function resetTemplate() {
    applyTemplate(templateKey);
  }

  async function sendEmail() {
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!cart.email || !cart.email.includes("@")) {
      setErrorMessage(
        "Für diesen Kunden wurde keine gültige E-Mail-Adresse hinterlegt."
      );
      return;
    }

    if (!subject.trim()) {
      setErrorMessage("Bitte gib einen E-Mail-Betreff ein.");
      return;
    }

    if (!message.trim()) {
      setErrorMessage("Bitte gib eine Nachricht ein.");
      return;
    }

    if (cart.items.length === 0) {
      setErrorMessage(
        "Der Warenkorb enthält noch keine Produkte."
      );
      return;
    }

    setIsSendingEmail(true);

    try {
      const response = await fetch(
        `/api/admin/prepared-carts/${encodeURIComponent(
          cart.id
        )}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "email",
            subject,
            message,
          }),
        }
      );

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        setErrorMessage(
          result.message ||
            "Die E-Mail konnte nicht gesendet werden."
        );
        return;
      }

      setSuccessMessage(
        result.message || "Die E-Mail wurde gesendet."
      );

      await loadHistory();
      await onChanged?.();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Die E-Mail konnte nicht gesendet werden."
      );
    } finally {
      setIsSendingEmail(false);
    }
  }

  function openWhatsApp() {
    setSuccessMessage(null);
    setErrorMessage(null);

    const normalizedPhone = normalizeWhatsAppPhone(
      cart.phone || ""
    );

    if (!normalizedPhone || normalizedPhone.length < 8) {
      setErrorMessage(
        "Für diesen Kunden wurde keine gültige Telefonnummer hinterlegt."
      );
      return;
    }

    if (!message.trim()) {
      setErrorMessage("Bitte gib eine Nachricht ein.");
      return;
    }

    const whatsAppUrl =
      `https://wa.me/${normalizedPhone}` +
      `?text=${encodeURIComponent(previewMessage)}`;

    const openedWindow = window.open(
      whatsAppUrl,
      "_blank",
      "noopener,noreferrer"
    );

    if (!openedWindow) {
      setErrorMessage(
        "WhatsApp konnte nicht geöffnet werden. Bitte erlaube Pop-ups für diese Seite."
      );
      return;
    }

    setWhatsAppOpened(true);
    setSuccessMessage(
      "WhatsApp wurde mit der vorbereiteten Nachricht geöffnet. Prüfe die Nachricht dort und sende sie manuell."
    );
  }

  async function confirmWhatsAppSent() {
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!message.trim()) {
      setErrorMessage("Bitte gib eine Nachricht ein.");
      return;
    }

    setIsConfirmingWhatsApp(true);

    try {
      const response = await fetch(
        `/api/admin/prepared-carts/${encodeURIComponent(
          cart.id
        )}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "whatsapp",
            subject: null,
            message,
          }),
        }
      );

      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        setErrorMessage(
          result.message ||
            "Der WhatsApp-Versand konnte nicht gespeichert werden."
        );
        return;
      }

      setSuccessMessage(
        result.message ||
          "Der WhatsApp-Versand wurde gespeichert."
      );

      setWhatsAppOpened(false);

      await loadHistory();
      await onChanged?.();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Der WhatsApp-Versand konnte nicht gespeichert werden."
      );
    } finally {
      setIsConfirmingWhatsApp(false);
    }
  }

  async function copyPreview() {
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      await navigator.clipboard.writeText(previewMessage);
      setSuccessMessage(
        "Die fertige Nachricht wurde kopiert."
      );
    } catch {
      setErrorMessage(
        "Die Nachricht konnte nicht automatisch kopiert werden."
      );
    }
  }

  const isCartBlocked =
    cart.status === "expired" ||
    cart.status === "cancelled";

  return (
    <div className="mt-5 rounded-[28px] border border-[#D6E7EF] bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EEF4FA] text-[#12395F]">
          <Send className="h-5 w-5" />
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12395F]">
            Kommunikation
          </p>

          <h3 className="mt-1 text-xl font-black text-[#102A43]">
            Nachricht bearbeiten und versenden
          </h3>

          <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
            Platzhalter werden in der Vorschau und beim Versand
            automatisch ersetzt.
          </p>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-[#F2B8B8] bg-[#FFF1F1] px-4 py-3 text-sm font-bold text-[#B5282D]">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-5 rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] px-4 py-3 text-sm font-bold text-[#2F7D50]">
          {successMessage}
        </div>
      ) : null}

      {isCartBlocked ? (
        <div className="mt-5 rounded-2xl border border-[#F2B8B8] bg-[#FFF1F1] px-4 py-3 text-sm font-bold text-[#B5282D]">
          Dieser Warenkorb ist abgelaufen oder wurde
          zurückgezogen und kann nicht mehr versendet werden.
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Vorlage
            </label>

            <select
              value={templateKey}
              onChange={(event) =>
                applyTemplate(
                  event.target.value as TemplateKey
                )
              }
              className="w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-3 text-sm font-bold text-[#102A43] outline-none focus:border-[#12395F]"
            >
              {(
                Object.entries(templates) as Array<
                  [TemplateKey, MessageTemplate]
                >
              ).map(([key, template]) => (
                <option key={key} value={key}>
                  {template.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              E-Mail-Betreff
            </label>

            <input
              value={subject}
              onChange={(event) => {
                setSubject(event.target.value);

                if (templateKey !== "custom") {
                  setTemplateKey("custom");
                }
              }}
              placeholder="Betreff der E-Mail"
              className="w-full rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-3 text-sm font-bold text-[#102A43] outline-none focus:border-[#12395F]"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-black text-[#102A43]">
              Nachricht
            </label>

            <textarea
              rows={13}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);

                if (templateKey !== "custom") {
                  setTemplateKey("custom");
                }
              }}
              placeholder="Nachricht an den Kunden"
              className="w-full resize-y rounded-2xl border border-[#D8C8B8] bg-[#FBF7F0] px-4 py-4 text-sm font-semibold leading-6 text-[#102A43] outline-none focus:border-[#12395F]"
            />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
              Verfügbare Platzhalter
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {Object.keys(replacements).map((placeholder) => (
                <button
                  key={placeholder}
                  type="button"
                  onClick={() =>
                    setMessage((current) =>
                      current
                        ? `${current} ${placeholder}`
                        : placeholder
                    )
                  }
                  className="rounded-full border border-[#E8DED2] bg-[#FBF7F0] px-3 py-1.5 text-xs font-black text-[#52616F]"
                >
                  {placeholder}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => void sendEmail()}
              disabled={
                isSendingEmail ||
                isCartBlocked ||
                cart.items.length === 0
              }
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#12395F] px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSendingEmail ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}

              E-Mail senden
            </button>

            <button
              type="button"
              onClick={openWhatsApp}
              disabled={
                isCartBlocked ||
                cart.items.length === 0
              }
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp öffnen
            </button>

            <button
              type="button"
              onClick={() => void copyPreview()}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#D6E7EF] bg-white px-5 py-3 text-sm font-black text-[#12395F]"
            >
              <ClipboardCopy className="h-4 w-4" />
              Nachricht kopieren
            </button>

            <button
              type="button"
              onClick={resetTemplate}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-5 py-3 text-sm font-black text-[#52616F]"
            >
              <RotateCcw className="h-4 w-4" />
              Vorlage zurücksetzen
            </button>
          </div>

          {whatsAppOpened ? (
            <div className="rounded-2xl border border-[#BFE3CD] bg-[#F0FFF6] p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#2F7D50]" />

                <div>
                  <p className="font-black text-[#2F7D50]">
                    WhatsApp wurde geöffnet
                  </p>

                  <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                    Sende die Nachricht in WhatsApp. Bestätige
                    den Versand danach hier, damit Verlauf und
                    Warenkorbstatus gespeichert werden.
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      void confirmWhatsAppSent()
                    }
                    disabled={isConfirmingWhatsApp}
                    className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
                  >
                    {isConfirmingWhatsApp ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}

                    WhatsApp-Versand bestätigen
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-[#D6E7EF] bg-[#F5FAFD] p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
              Empfänger
            </p>

            <p className="mt-3 font-black text-[#102A43]">
              {cart.customer_name || "Kein Kundenname"}
            </p>

            <p className="mt-1 break-all text-sm font-semibold text-[#52616F]">
              {cart.email || "Keine E-Mail-Adresse"}
            </p>

            <p className="mt-1 text-sm font-semibold text-[#52616F]">
              {cart.phone || "Keine Telefonnummer"}
            </p>
          </div>

          <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                Vorschau
              </p>

              {cart.customerUrl ? (
                <a
                  href={cart.customerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-black text-[#12395F]"
                >
                  Link prüfen
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>

            {previewSubject ? (
              <div className="mt-3 rounded-xl bg-white px-3 py-2.5">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#52616F]">
                  Betreff
                </p>

                <p className="mt-1 text-sm font-black text-[#102A43]">
                  {previewSubject}
                </p>
              </div>
            ) : null}

            <div className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-white px-3 py-3 text-sm font-semibold leading-6 text-[#102A43]">
              {previewMessage || "Noch keine Nachricht eingegeben."}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E8DED2] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-[#A75B28]" />

                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
                  Verlauf
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadHistory()}
                disabled={isLoadingHistory}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E8DED2] bg-[#FBF7F0] text-[#52616F]"
                aria-label="Verlauf aktualisieren"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    isLoadingHistory ? "animate-spin" : ""
                  }`}
                />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {isLoadingHistory && messages.length === 0 ? (
                <p className="text-sm font-semibold text-[#52616F]">
                  Verlauf wird geladen …
                </p>
              ) : null}

              {!isLoadingHistory && messages.length === 0 ? (
                <p className="text-sm font-semibold text-[#52616F]">
                  Noch keine Nachricht gespeichert.
                </p>
              ) : null}

              {messages.map((historyMessage) => (
                <article
                  key={historyMessage.id}
                  className="rounded-xl border border-[#E8DED2] bg-[#FBF7F0] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#12395F]">
                      {getChannelLabel(
                        historyMessage.channel
                      )}
                    </span>

                    <span className="text-[11px] font-bold text-[#52616F]">
                      {formatDateTime(
                        historyMessage.sent_at ||
                          historyMessage.created_at
                      )}
                    </span>
                  </div>

                  {historyMessage.subject ? (
                    <p className="mt-2 text-xs font-black text-[#102A43]">
                      {historyMessage.subject}
                    </p>
                  ) : null}

                  <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs font-semibold leading-5 text-[#52616F]">
                    {historyMessage.message_text}
                  </p>

                  {historyMessage.recipient ? (
                    <p className="mt-2 break-all text-[11px] font-bold text-[#52616F]">
                      An: {historyMessage.recipient}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}