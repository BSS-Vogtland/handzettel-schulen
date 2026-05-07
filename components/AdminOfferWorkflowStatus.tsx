import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  MailCheck,
  PackageCheck,
  Sparkles,
} from "lucide-react";

type EventRow = {
  id: string;
  request_id: string;
  event_type?: string | null;
  type?: string | null;
  message: string | null;
  metadata?: unknown;
  created_at: string | null;
};

type AdminOfferWorkflowStatusProps = {
  requestStatus: string | null;
  offerStatus: string | null;
  aiStatus: string | null;
  itemsCount: number;
  offerItemsCount: number;
  manualReviewItemsCount: number;
  events: EventRow[];
  updatedAt: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getEventType(event: EventRow) {
  return String(event.event_type || event.type || "").toLowerCase();
}

function getEventMessage(event: EventRow) {
  return String(event.message || "").toLowerCase();
}

function findLatestEvent(
  events: EventRow[],
  matcher: (event: EventRow) => boolean
) {
  return events.find(matcher) || null;
}

function isConfirmed(requestStatus: string | null, offerStatus: string | null) {
  return requestStatus === "confirmed" || offerStatus === "confirmed";
}

function isAfterOrSame(a: string | null, b: string | null) {
  if (!a || !b) return false;

  const aTime = new Date(a).getTime();
  const bTime = new Date(b).getTime();

  if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return false;

  return aTime >= bTime;
}

function getWorkflowState(params: AdminOfferWorkflowStatusProps) {
  const {
    requestStatus,
    offerStatus,
    aiStatus,
    itemsCount,
    offerItemsCount,
    manualReviewItemsCount,
    events,
    updatedAt,
  } = params;

  const latestUpdateMailEvent = findLatestEvent(events, (event) => {
    const type = getEventType(event);
    const message = getEventMessage(event);

    return (
      type.includes("offer_update_mail_sent") ||
      type.includes("update_mail") ||
      message.includes("aktualisierungsmail") ||
      message.includes("pdf-angebot")
    );
  });

  const latestConfirmedEvent = findLatestEvent(events, (event) => {
    const type = getEventType(event);
    const message = getEventMessage(event);

    return (
      type.includes("confirmed") ||
      type.includes("offer_confirmed") ||
      type.includes("customer_confirmed") ||
      message.includes("bestätigt") ||
      message.includes("angenommen") ||
      message.includes("offiziell angenommen")
    );
  });

  const confirmed = isConfirmed(requestStatus, offerStatus);
  const updateMailWasSent = Boolean(latestUpdateMailEvent);

  const confirmedAfterUpdate =
    confirmed &&
    updateMailWasSent &&
    isAfterOrSame(
      latestConfirmedEvent?.created_at || updatedAt,
      latestUpdateMailEvent?.created_at || null
    );

  if (confirmedAfterUpdate) {
    return {
      key: "updated_confirmed",
      title: "Aktualisiertes Angebot bestätigt",
      label: "Abgeschlossen",
      description:
        "Der Kunde hat das zuletzt versendete aktualisierte Angebot offiziell angenommen.",
      color: "green",
      icon: CheckCircle2,
      dateLabel: latestConfirmedEvent?.created_at
        ? `Bestätigt am ${formatDateTime(latestConfirmedEvent.created_at)}`
        : `Zuletzt aktualisiert am ${formatDateTime(updatedAt)}`,
    };
  }

  if (updateMailWasSent) {
    return {
      key: "updated_sent",
      title: "Aktualisiertes Angebot versandt",
      label: "Warten auf Bestätigung",
      description:
        "Das manuell geänderte Angebot wurde dem Kunden als PDF gesendet. Die offizielle Annahme steht noch aus.",
      color: "amber",
      icon: MailCheck,
      dateLabel: `Versendet am ${formatDateTime(
        latestUpdateMailEvent?.created_at || null
      )}`,
    };
  }

  if (confirmed) {
    return {
      key: "confirmed",
      title: "Angebot bestätigt",
      label: "Bestätigt",
      description:
        "Der Kunde hat ein Angebot offiziell angenommen. Falls danach noch Änderungen gemacht wurden, sollte eine Aktualisierungsmail gesendet werden.",
      color: "green",
      icon: CheckCircle2,
      dateLabel: `Zuletzt aktualisiert am ${formatDateTime(updatedAt)}`,
    };
  }

  if (itemsCount > 0 && manualReviewItemsCount === 0 && offerItemsCount > 0) {
    return {
      key: "package_ready",
      title: "Paket vorbereitet",
      label: "Bereit zum Versand",
      description:
        "Die erkannten Positionen wurden übernommen oder manuell ergänzt. Du kannst jetzt das aktualisierte Angebot versenden.",
      color: "blue",
      icon: PackageCheck,
      dateLabel: null,
    };
  }

  if (manualReviewItemsCount > 0) {
    return {
      key: "open_items",
      title: "Offene Positionen",
      label: `${manualReviewItemsCount} offen`,
      description:
        "Es gibt noch erkannte Positionen ohne sicheren Produktvorschlag. Diese sollten manuell geprüft oder ergänzt werden.",
      color: "orange",
      icon: AlertTriangle,
      dateLabel: null,
    };
  }

  if (
    aiStatus === "running" ||
    aiStatus === "pending" ||
    offerStatus === "matching_done" ||
    offerItemsCount > 0
  ) {
    return {
      key: "in_progress",
      title: "In Arbeit",
      label: "Bearbeitung läuft",
      description:
        "Die Anfrage wird analysiert, gematcht oder bereits manuell bearbeitet.",
      color: "blue",
      icon: Sparkles,
      dateLabel: null,
    };
  }

  return {
    key: "new",
    title: "Neu",
    label: "Eingegangen",
    description:
      "Die Anfrage ist eingegangen. Analyse, Matching oder manuelle Bearbeitung können jetzt starten.",
    color: "neutral",
    icon: Clock3,
    dateLabel: null,
  };
}

function getStepClass(active: boolean, done: boolean) {
  if (done) {
    return "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]";
  }

  if (active) {
    return "border-[#F0D2A8] bg-[#FFF8EC] text-[#A75B28]";
  }

  return "border-[#E8DED2] bg-white text-[#52616F]";
}

export default function AdminOfferWorkflowStatus(
  props: AdminOfferWorkflowStatusProps
) {
  const state = getWorkflowState(props);
  const Icon = state.icon;

  const steps = [
    {
      key: "new",
      title: "Neu",
      description: "Anfrage eingegangen",
      icon: Clock3,
    },
    {
      key: "in_progress",
      title: "In Arbeit",
      description: "Analyse oder Bearbeitung läuft",
      icon: Sparkles,
    },
    {
      key: "open_items",
      title: "Offene Positionen",
      description: "Manuelle Prüfung nötig",
      icon: AlertTriangle,
    },
    {
      key: "package_ready",
      title: "Paket vorbereitet",
      description: "Positionen sind gepflegt",
      icon: PackageCheck,
    },
    {
      key: "updated_sent",
      title: "Angebot versandt",
      description: "PDF-Mail wurde gesendet",
      icon: MailCheck,
    },
    {
      key: "updated_confirmed",
      title: "Bestätigt",
      description: "Kunde hat angenommen",
      icon: CheckCircle2,
    },
  ];

  const stepOrder = steps.map((step) => step.key);
  const activeIndex = stepOrder.indexOf(state.key);

  return (
    <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-4">
        <div
          className={
            state.color === "green"
              ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]"
              : state.color === "amber" || state.color === "orange"
                ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFF8EC] text-[#A75B28]"
                : "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#12395F]"
          }
        >
          <Icon className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Angebotsstatus
            </p>

            <span
              className={
                state.color === "green"
                  ? "rounded-full bg-[#F0FFF6] px-3 py-1 text-xs font-black text-[#2F7D50]"
                  : state.color === "amber" || state.color === "orange"
                    ? "rounded-full bg-[#FFF8EC] px-3 py-1 text-xs font-black text-[#A75B28]"
                    : "rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black text-[#12395F]"
              }
            >
              {state.label}
            </span>
          </div>

          <h2 className="mt-2 text-2xl font-black tracking-tight text-[#102A43]">
            {state.title}
          </h2>

          <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
            {state.description}
          </p>

          {state.dateLabel ? (
            <p className="mt-3 inline-flex rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black text-[#102A43]">
              {state.dateLabel}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          const active = step.key === state.key;
          const done = activeIndex > index;

          return (
            <div
              key={step.key}
              className={`rounded-2xl border p-4 ${getStepClass(active, done)}`}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80">
                  <StepIcon className="h-4 w-4" />
                </div>

                <span className="text-xs font-black">
                  {done ? "Erledigt" : active ? "Aktuell" : "Offen"}
                </span>
              </div>

              <p className="font-black">{step.title}</p>
              <p className="mt-1 text-xs font-semibold leading-5 opacity-80">
                {step.description}
              </p>
            </div>
          );
        })}
      </div>

      {state.key === "package_ready" ? (
        <div className="mt-5 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[#A75B28]" />
            <p className="text-sm font-semibold leading-6 text-[#52616F]">
              Das Paket sieht vorbereitet aus. Prüfe die Positionen kurz final
              und sende dann die Aktualisierungsmail mit PDF-Angebot.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}