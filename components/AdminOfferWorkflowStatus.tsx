import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MailCheck,
  PackageCheck,
  ShieldCheck,
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

type TileStatus = "offen" | "aktuell" | "erledigt";

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

function getHeaderToneClasses(tone: "neutral" | "blue" | "amber" | "green") {
  switch (tone) {
    case "green":
      return {
        iconWrap: "bg-[#F0FFF6] text-[#2F7D50]",
        badge: "bg-[#F0FFF6] text-[#2F7D50]",
      };
    case "amber":
      return {
        iconWrap: "bg-[#FFF8EC] text-[#A75B28]",
        badge: "bg-[#FFF8EC] text-[#A75B28]",
      };
    case "blue":
      return {
        iconWrap: "bg-[#EEF4FB] text-[#12395F]",
        badge: "bg-[#EEF4FB] text-[#12395F]",
      };
    default:
      return {
        iconWrap: "bg-[#FBF7F0] text-[#102A43]",
        badge: "bg-[#FBF7F0] text-[#102A43]",
      };
  }
}

function getTileClasses(status: TileStatus) {
  switch (status) {
    case "erledigt":
      return {
        card: "border-[#BFE3CD] bg-[#F0FFF6] text-[#2F7D50]",
        iconWrap: "bg-white text-[#2F7D50]",
        badge: "bg-white text-[#2F7D50]",
        title: "text-[#1F5D3A]",
        text: "text-[#3E6A52]",
      };
    case "aktuell":
      return {
        card: "border-[#F0D2A8] bg-[#FFF8EC] text-[#A75B28]",
        iconWrap: "bg-white text-[#A75B28]",
        badge: "bg-white text-[#A75B28]",
        title: "text-[#8A4A1F]",
        text: "text-[#8F6A46]",
      };
    default:
      return {
        card: "border-[#E8DED2] bg-white text-[#52616F]",
        iconWrap: "bg-[#FBF7F0] text-[#6A7783]",
        badge: "bg-[#FBF7F0] text-[#52616F]",
        title: "text-[#3E5266]",
        text: "text-[#6B7A88]",
      };
  }
}

function getTileBadgeLabel(status: TileStatus) {
  switch (status) {
    case "erledigt":
      return "Erledigt";
    case "aktuell":
      return "Aktuell";
    default:
      return "Offen";
  }
}

export default function AdminOfferWorkflowStatus(
  props: AdminOfferWorkflowStatusProps
) {
  const {
    requestStatus,
    offerStatus,
    aiStatus,
    itemsCount,
    offerItemsCount,
    manualReviewItemsCount,
    events,
    updatedAt,
  } = props;

  const latestUpdateMailEvent = findLatestEvent(events, (event) => {
    const type = getEventType(event);
    const message = getEventMessage(event);

    return (
      type.includes("offer_update_mail_sent") ||
      type.includes("update_mail") ||
      message.includes("aktualisierungsmail") ||
      message.includes("pdf-angebot") ||
      message.includes("aktualisiertes angebot")
    );
  });

  const latestConfirmedEvent = findLatestEvent(events, (event) => {
    const type = getEventType(event);
    const message = getEventMessage(event);

    return (
      type.includes("offer_update_confirmed") ||
      type.includes("offer_confirmed") ||
      type.includes("customer_confirmed") ||
      message.includes("bestätigt") ||
      message.includes("angenommen") ||
      message.includes("offiziell angenommen")
    );
  });  const latestTeamTakeoverEvent = findLatestEvent(events, (event) => {
    const type = getEventType(event);

    return type.includes("customer_requested_team_takeover");
  });

  const latestSelfSelectionEvent = findLatestEvent(events, (event) => {
    const type = getEventType(event);

    return type.includes("customer_selected_self_selection");
  });

  const teamTakeoverIsCurrent =
    Boolean(latestTeamTakeoverEvent) &&
    !(
      latestSelfSelectionEvent?.created_at &&
      latestTeamTakeoverEvent?.created_at &&
      isAfterOrSame(
        latestSelfSelectionEvent.created_at,
        latestTeamTakeoverEvent.created_at
      )
    );




  const confirmed = isConfirmed(requestStatus, offerStatus);

  const hasUpdatedOfferConfirmed = Boolean(latestConfirmedEvent);

  const updateMailWasSent =
    Boolean(latestUpdateMailEvent) ||
    requestStatus === "offer_sent" ||
    offerStatus === "offer_sent" ||
    offerStatus === "customer_selection";

  const updateMailDate =
    latestUpdateMailEvent?.created_at ||
    (requestStatus === "offer_sent" ||
    offerStatus === "offer_sent" ||
    offerStatus === "customer_selection"
      ? updatedAt
      : null);

  const confirmedAfterUpdate =
    confirmed &&
    updateMailWasSent &&
    isAfterOrSame(
      latestConfirmedEvent?.created_at || updatedAt,
      updateMailDate
    );

  const plainConfirmed = confirmed && !confirmedAfterUpdate;

  const hasWorkStarted =
    aiStatus === "running" ||
    aiStatus === "done" ||
    itemsCount > 0 ||
    offerItemsCount > 0 ||
    offerStatus === "matching_done" ||
    offerStatus === "offer_created" ||
    offerStatus === "customer_selection" ||
    offerStatus === "offer_sent" ||
    offerStatus === "confirmed" ||
    requestStatus === "manual_review" ||
    requestStatus === "confirmed";

  const openItemsCurrent =
    manualReviewItemsCount > 0 &&
    !updateMailWasSent &&
    !plainConfirmed &&
    !confirmedAfterUpdate;

  const teamTakeoverOpenItemsCurrent =
    openItemsCurrent && teamTakeoverIsCurrent;



  const packagePreparedCurrent =
    itemsCount > 0 &&
    offerItemsCount > 0 &&
    manualReviewItemsCount === 0 &&
    !plainConfirmed &&
    !updateMailWasSent &&
    !confirmedAfterUpdate;

  const headerState = (() => {
    if (confirmedAfterUpdate) {
      return {
        title: "Paketwunsch bestätigt",
        label: "Abgeschlossen",
        description:
          "Der Kunde hat das zuletzt per PDF versendete, manuell aktualisierte Angebot offiziell angenommen.",
        tone: "green" as const,
        icon: CheckCircle2,
        dateLabel: latestConfirmedEvent?.created_at
          ? `Bestätigt am ${formatDateTime(latestConfirmedEvent.created_at)}`
          : `Zuletzt aktualisiert am ${formatDateTime(updatedAt)}`,
      };
    }

    if (updateMailWasSent) {
      return {
        title: "Paketwunsch-Mail versendet",
        label: "Wartet auf Bestätigung",
        description:
          "Der vorbereitete Paketwunsch wurde dem Kunden zur Prüfung gesendet. Der Kunde muss ihn anschließend selbst bestätigen und geht danach in den Checkout.",
        tone: "amber" as const,
        icon: MailCheck,
        dateLabel: `Versendet am ${formatDateTime(updateMailDate)}`,
      };
    }

    if (plainConfirmed) {
      return {
        title: "Angebot bestätigt",
        label: "Bestätigt",
        description:
          "Der Kunde hat ein Angebot offiziell angenommen. Falls danach noch manuelle Änderungen erfolgen, muss anschließend eine Aktualisierungsmail gesendet werden.",
        tone: "green" as const,
        icon: CheckCircle2,
        dateLabel: `Zuletzt aktualisiert am ${formatDateTime(updatedAt)}`,
      };
    }

    if (packagePreparedCurrent) {
      return {
        title: "Paket vorbereitet",
        label: "Bereit zum Versand",
        description:
          "Alle relevanten Positionen sind im Paketwunsch enthalten oder manuell ergänzt. Du kannst jetzt das aktualisierte Angebot versenden.",
        tone: "blue" as const,
        icon: PackageCheck,
        dateLabel: null,
      };
    }

    if (teamTakeoverOpenItemsCurrent) {
      return {
        title: "Kunde wünscht Team-Übernahme",
        label: `${manualReviewItemsCount} offen`,
        description:
          "Der Kunde hat die offenen Positionen an Handzettel-Schulen.de übergeben. Offene Positionen manuell bearbeiten, Paketwunsch final prüfen und danach die Paketwunsch-Mail senden.",
        tone: "green" as const,
        icon: ShieldCheck,
        dateLabel: null,
      };
    }

    if (openItemsCurrent) {
      return {
        title: "Manuelle Prüfung",
        label: `${manualReviewItemsCount} offen`,
        description:
          "Es gibt noch erkannte Positionen ohne sichere Produktzuordnung. Diese müssen manuell geprüft oder ergänzt werden.",
        tone: "amber" as const,
        icon: AlertTriangle,
        dateLabel: null,
      };
    }

    if (hasWorkStarted) {
      return {
        title: "In Bearbeitung",
        label: "Bearbeitung läuft",
        description:
          "Die Anfrage wurde bereits analysiert, gematcht oder manuell bearbeitet.",
        tone: "blue" as const,
        icon: Sparkles,
        dateLabel: null,
      };
    }

    return {
      title: "Neu",
      label: "Eingegangen",
      description:
        "Die Anfrage ist eingegangen. Analyse, Matching oder manuelle Bearbeitung können jetzt starten.",
      tone: "neutral" as const,
      icon: Clock3,
      dateLabel: null,
    };
  })();

  const tileStatus = {
    new: (() => {
      if (
        !hasWorkStarted &&
        !openItemsCurrent &&
        !packagePreparedCurrent &&
        !plainConfirmed &&
        !updateMailWasSent &&
        !confirmedAfterUpdate
      ) {
        return "aktuell" as TileStatus;
      }

      return "erledigt" as TileStatus;
    })(),

    inProgress: (() => {
      if (
        hasWorkStarted &&
        !openItemsCurrent &&
        !packagePreparedCurrent &&
        !plainConfirmed &&
        !updateMailWasSent &&
        !confirmedAfterUpdate
      ) {
        return "aktuell" as TileStatus;
      }

      if (
        hasWorkStarted ||
        openItemsCurrent ||
        packagePreparedCurrent ||
        plainConfirmed ||
        updateMailWasSent ||
        confirmedAfterUpdate
      ) {
        return "erledigt" as TileStatus;
      }

      return "offen" as TileStatus;
    })(),

    openItems: (() => {
      if (openItemsCurrent) {
        return "aktuell" as TileStatus;
      }

      if (
        itemsCount > 0 &&
        (manualReviewItemsCount === 0 ||
          packagePreparedCurrent ||
          plainConfirmed ||
          updateMailWasSent ||
          confirmedAfterUpdate)
      ) {
        return "erledigt" as TileStatus;
      }

      return "offen" as TileStatus;
    })(),

    packagePrepared: (() => {
      if (packagePreparedCurrent) {
        return "aktuell" as TileStatus;
      }

      if (plainConfirmed || updateMailWasSent || confirmedAfterUpdate) {
        return "erledigt" as TileStatus;
      }

      return "offen" as TileStatus;
    })(),

    offerSent: (() => {
  if (updateMailWasSent || confirmedAfterUpdate || hasUpdatedOfferConfirmed) {
    return "erledigt" as TileStatus;
  }

  return "offen" as TileStatus;
})(),

confirmed: (() => {
  if (plainConfirmed || confirmedAfterUpdate || hasUpdatedOfferConfirmed) {
    return "erledigt" as TileStatus;
  }

  if (updateMailWasSent) {
    return "aktuell" as TileStatus;
  }

  return "offen" as TileStatus;
})(),
};
const tiles = [
    {
      key: "new",
      title: "Neu",
      description: "Anfrage ist eingegangen",
      icon: Clock3,
      status: tileStatus.new,
    },
    {
      key: "inProgress",
      title: "In Bearbeitung",
      description: "Analyse, Matching oder manuelle Prüfung läuft",
      icon: Sparkles,
      status: tileStatus.inProgress,
    },
    {
      key: "openItems",
      title: teamTakeoverOpenItemsCurrent ? "Team-Übernahme" : "Manuelle Prüfung",
      description: teamTakeoverOpenItemsCurrent
        ? "Kunde möchte Bearbeitung durch Handzettel-Schulen.de"
        : "Offene Positionen prüfen",
      icon: teamTakeoverOpenItemsCurrent ? ShieldCheck : AlertTriangle,
      status: tileStatus.openItems,
    },
    {
      key: "packagePrepared",
      title: "Paket vorbereitet",
      description: "Alle relevanten Positionen sind gepflegt",
      icon: PackageCheck,
      status: tileStatus.packagePrepared,
    },
    {
      key: "offerSent",
      title: "Paketwunsch-Mail versendet",
      description: "Paketwunsch-Mail wurde an den Kunden gesendet",
      icon: MailCheck,
      status: tileStatus.offerSent,
    },
    {
      key: "confirmed",
      title: confirmedAfterUpdate
        ? "Paketwunsch bestätigt"
        : "Angebot bestätigt",
      description: confirmedAfterUpdate
        ? "Kunde hat die aktualisierte Fassung angenommen"
        : "Kunde hat offiziell angenommen",
      icon: CheckCircle2,
      status: tileStatus.confirmed,
    },
  ];

  const headerClasses = getHeaderToneClasses(headerState.tone);
  const HeaderIcon = headerState.icon;

  return (
    <section className="rounded-[32px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-6">
      {headerState.title === "Manuelle Prüfung" ? (
        <div className="mb-5 rounded-[28px] border border-[#E16B6B] bg-[#FFF1F1] px-5 py-6 text-center">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C62828] text-2xl font-black leading-none text-white shadow-sm">
              !
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#B42318]">
                Angebotsstatus
              </p>

              <span className="rounded-full bg-[#FEE4E2] px-3 py-1 text-xs font-black text-[#B42318] ring-1 ring-[#FECDCA]">
                {headerState.label}
              </span>
            </div>

            <h2 className="text-2xl font-black tracking-tight text-[#8E1C1C]">
              {headerState.title}
            </h2>

            <p className="max-w-2xl text-sm font-bold leading-6 text-[#8E1C1C]">
              {headerState.description}
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-5 flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${headerClasses.iconWrap}`}
          >
            <HeaderIcon className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
                Angebotsstatus
              </p>

              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${headerClasses.badge}`}
              >
                {headerState.label}
              </span>
            </div>

            <h2 className="mt-2 text-2xl font-black tracking-tight text-[#102A43]">
              {headerState.title}
            </h2>

            <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
              {headerState.description}
            </p>

            {headerState.dateLabel ? (
              <p className="mt-3 inline-flex rounded-full bg-[#FBF7F0] px-3 py-1 text-xs font-black text-[#102A43]">
                {headerState.dateLabel}
              </p>
            ) : null}
          </div>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const classes = getTileClasses(tile.status);

          return (
            <div
              key={tile.key}
              className={`rounded-2xl border p-4 transition ${classes.card}`}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${classes.iconWrap}`}
                >
                  <Icon className="h-5 w-5" />
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${classes.badge}`}
                >
                  {getTileBadgeLabel(tile.status)}
                </span>
              </div>

              <p className={`text-xl font-black ${classes.title}`}>
                {tile.title}
              </p>
              <p className={`mt-2 text-sm font-semibold leading-6 ${classes.text}`}>
                {tile.description}
              </p>
            </div>
          );
        })}
      </div>

      {(headerState.title === "Paket vorbereitet" ||
  headerState.title === "Paketwunsch-Mail versendet") && (
  <div className="mt-5 rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] p-4">
    <p className="text-sm font-semibold leading-6 text-[#52616F]">
      {headerState.title === "Paket vorbereitet"
        ? "Der Paketwunsch ist vorbereitet. Prüfe die Positionen kurz final und sende dann die Paketwunsch-Mail."
        : "Die Paketwunsch-Mail wurde versendet. Dieser Schritt ist erledigt. Aktuell wartet der Vorgang auf die Bestätigung durch den Kunden."}
    </p>
  </div>
)}
    </section>
  );
}