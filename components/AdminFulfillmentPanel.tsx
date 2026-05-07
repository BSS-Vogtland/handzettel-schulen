"use client";

import {
  CheckCircle2,
  Clock,
  MapPin,
  PackageCheck,
  Printer,
  ShoppingBasket,
  Truck,
} from "lucide-react";
import AdminFulfillmentActionButton from "@/components/AdminFulfillmentActionButton";

type OfferItem = {
  id: string;
  product_name: string;
  product_sku: string | null;
  product_price: number | string | null;
  quantity: number | string | null;
  unit: string | null;
  source: string | null;
  notes: string | null;
};

type AdminFulfillmentPanelProps = {
  requestId: string;
  requestStatus: string | null;
  offerStatus: string | null;
  fulfillmentMethod?: string | null;
  fulfillmentStatus?: string | null;
  pickingStatus?: string | null;
  shippingCostStatus?: string | null;
  pickupLocationLabel?: string | null;
  pickupAddressSnapshot?: string | null;
  pickupMapsUrlSnapshot?: string | null;
  confirmedAt?: string | null;
  pickingStartedAt?: string | null;
  pickedAt?: string | null;
  packedAt?: string | null;
  shippedAt?: string | null;
  pickedUpAt?: string | null;
  offerItems: OfferItem[];
};

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value, 0));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getFulfillmentMethodLabel(method?: string | null) {
  if (method === "pickup") return "Abholung im Laden";
  if (method === "shipping") return "Versand gewünscht";
  return "Noch nicht gewählt";
}

function getFulfillmentStatusLabel(status?: string | null) {
  switch (status) {
    case "pickup_requested":
      return "Abholung vorbereiten";
    case "shipping_requested":
      return "Versand vorbereiten";
    case "ready_for_pickup":
      return "Abholbereit";
    case "shipping_ready":
      return "Versandbereit";
    case "shipped":
      return "Versendet";
    case "picked_up":
      return "Abgeholt";
    default:
      return "Noch offen";
  }
}

function getPickingStatusLabel(status?: string | null) {
  switch (status) {
    case "picking":
      return "Picking läuft";
    case "picked":
      return "Gepickt";
    case "packed":
      return "Gepackt";
    default:
      return "Picking offen";
  }
}

function getSourceLabel(source: string | null) {
  switch (source) {
    case "auto_preselected":
      return "Automatisch vorausgewählt";
    case "customer_selection":
      return "Vom Kunden gewählt";
    case "customer_search":
      return "Vom Kunden gesucht";
    case "admin_manual":
      return "Manuell ergänzt";
    case "admin_existing_product":
      return "Von BSS ergänzt";
    case "match":
      return "Aus Treffer übernommen";
    default:
      return "Paketposition";
  }
}

export default function AdminFulfillmentPanel({
  requestId,
  requestStatus,
  offerStatus,
  fulfillmentMethod,
  fulfillmentStatus,
  pickingStatus,
  shippingCostStatus,
  pickupLocationLabel,
  pickupAddressSnapshot,
  pickupMapsUrlSnapshot,
  confirmedAt,
  pickingStartedAt,
  pickedAt,
  packedAt,
  shippedAt,
  pickedUpAt,
  offerItems,
}: AdminFulfillmentPanelProps) {
  const isConfirmed =
    requestStatus === "confirmed" || offerStatus === "confirmed";

  const total = offerItems.reduce((sum, item) => {
    return sum + toNumber(item.quantity, 1) * toNumber(item.product_price, 0);
  }, 0);

  const isPickup = fulfillmentMethod === "pickup";
  const isShipping = fulfillmentMethod === "shipping";

  return (
    <section className="rounded-[32px] border border-[#BFE3CD] bg-[#F0FFF6] p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#2F7D50]">
            <PackageCheck className="h-6 w-6" />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F7D50]">
              Angebot bestätigt · Abwicklung
            </p>

            <h2 className="text-2xl font-black text-[#102A43]">
              Pickingliste & Übergabe-Workflow
            </h2>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
              Sobald das Angebot bestätigt wurde, beginnt hier die operative
              Bearbeitung: Produkte picken, Paket packen und je nach
              Kundenwunsch zur Abholung oder zum Versand vorbereiten.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.print();
          }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#BFE3CD] bg-white px-4 py-3 text-sm font-black text-[#2F7D50] shadow-sm transition hover:brightness-105"
        >
          <Printer className="h-4 w-4" />
          Pickingliste drucken
        </button>
      </div>

      {!isConfirmed ? (
        <div className="rounded-3xl border border-[#F1D1A8] bg-[#FFF8EE] p-4 text-sm font-bold leading-6 text-[#A75B28]">
          Dieser Bereich wird vollständig relevant, sobald der Kunde das Angebot
          verbindlich bestätigt hat.
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <div className="rounded-[24px] border border-[#BFE3CD] bg-white p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0FFF6] text-[#2F7D50]">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2F7D50]">
            Bestätigung
          </p>
          <p className="mt-2 font-black text-[#102A43]">
            {isConfirmed ? "Bestätigt" : "Noch nicht bestätigt"}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#52616F]">
            {formatDateTime(confirmedAt)}
          </p>
        </div>

        <div className="rounded-[24px] border border-[#E8DED2] bg-white p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
            <ShoppingBasket className="h-5 w-5" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#A75B28]">
            Picking
          </p>
          <p className="mt-2 font-black text-[#102A43]">
            {getPickingStatusLabel(pickingStatus)}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#52616F]">
            Start: {formatDateTime(pickingStartedAt)}
          </p>
        </div>

        <div className="rounded-[24px] border border-[#E8DED2] bg-white p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#12395F]">
            {isShipping ? (
              <Truck className="h-5 w-5" />
            ) : (
              <MapPin className="h-5 w-5" />
            )}
          </div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
            Übergabe
          </p>
          <p className="mt-2 font-black text-[#102A43]">
            {getFulfillmentMethodLabel(fulfillmentMethod)}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#52616F]">
            {getFulfillmentStatusLabel(fulfillmentStatus)}
          </p>
        </div>

        <div className="rounded-[24px] border border-[#E8DED2] bg-white p-4">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#52616F]">
            <Clock className="h-5 w-5" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#52616F]">
            Summe
          </p>
          <p className="mt-2 font-black text-[#102A43]">
            {formatMoney(total)}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#52616F]">
            {offerItems.length} Position
            {offerItems.length === 1 ? "" : "en"}
          </p>
        </div>
      </div>

      {isPickup ? (
        <div className="mt-5 rounded-[26px] border border-[#BFE3CD] bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2F7D50]">
                Abholung
              </p>
              <h3 className="mt-1 font-black text-[#102A43]">
                {pickupLocationLabel || "Abholung im Laden"}
              </h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
                {pickupAddressSnapshot || "Keine Abholadresse gespeichert."}
              </p>
            </div>

            {pickupMapsUrlSnapshot ? (
              <a
                href={pickupMapsUrlSnapshot}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#2F7D50] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                <MapPin className="h-4 w-4" />
                Route öffnen
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {isShipping ? (
        <div className="mt-5 rounded-[26px] border border-[#C8D8E8] bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#12395F]">
            Versand
          </p>
          <h3 className="mt-1 font-black text-[#102A43]">
            Versand vom Kunden gewünscht
          </h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-[#52616F]">
            Versandkostenstatus:{" "}
            {shippingCostStatus === "pending_calculation"
              ? "Versandkosten müssen noch berechnet werden"
              : "Keine Versandkostenberechnung nötig"}
          </p>
        </div>
      ) : null}

      <div className="mt-5 rounded-[28px] border border-[#E8DED2] bg-white p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FBF7F0] text-[#A75B28]">
            <ClipboardListIcon />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
              Pickingliste
            </p>
            <h3 className="font-black text-[#102A43]">
              Diese Positionen müssen gepackt werden
            </h3>
          </div>
        </div>

        {offerItems.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-[#E8DED2]">
            <div className="grid grid-cols-[72px_1fr_110px] bg-[#102A43] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white md:grid-cols-[80px_1fr_150px_120px]">
              <div>Menge</div>
              <div>Artikel</div>
              <div className="hidden md:block">Art.-Nr.</div>
              <div className="text-right">Wert</div>
            </div>

            {offerItems.map((item, index) => {
              const quantity = toNumber(item.quantity, 1);
              const price = toNumber(item.product_price, 0);
              const lineTotal = quantity * price;

              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-[72px_1fr_110px] gap-3 px-4 py-4 text-sm md:grid-cols-[80px_1fr_150px_120px] ${
                    index % 2 === 0 ? "bg-[#FBF7F0]" : "bg-white"
                  }`}
                >
                  <div className="font-black text-[#102A43]">
                    {quantity}
                    {item.unit ? ` ${item.unit}` : ""}
                  </div>

                  <div>
                    <p className="font-black text-[#102A43]">
                      {item.product_name}
                    </p>

                    <p className="mt-1 text-xs font-semibold text-[#52616F] md:hidden">
                      {item.product_sku || "Ohne Art.-Nr."}
                    </p>

                    <p className="mt-1 inline-flex rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#A75B28]">
                      {getSourceLabel(item.source)}
                    </p>

                    {item.notes ? (
                      <p className="mt-2 text-xs font-semibold leading-5 text-[#52616F]">
                        Hinweis: {item.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="hidden text-sm font-semibold text-[#52616F] md:block">
                    {item.product_sku || "—"}
                  </div>

                  <div className="text-right font-black text-[#102A43]">
                    {formatMoney(lineTotal)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#D8C8B8] bg-[#FBF7F0] p-5 text-sm font-semibold text-[#52616F]">
            Noch keine Paketpositionen vorhanden.
          </div>
        )}
      </div>

      <div className="mt-5 rounded-[28px] border border-[#E8DED2] bg-white p-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A75B28]">
          Workflow-Aktionen
        </p>

        <h3 className="mt-1 font-black text-[#102A43]">
          Status für Picking, Abholung oder Versand setzen
        </h3>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <AdminFulfillmentActionButton
            requestId={requestId}
            action="start_picking"
            label="Picking starten"
            variant="blue"
            disabled={!isConfirmed}
          />

          <AdminFulfillmentActionButton
            requestId={requestId}
            action="mark_picked"
            label="Als gepickt markieren"
            variant="neutral"
            disabled={!isConfirmed}
          />

          <AdminFulfillmentActionButton
            requestId={requestId}
            action="mark_packed"
            label="Als gepackt markieren"
            variant="green"
            disabled={!isConfirmed}
          />

          {isPickup ? (
            <>
              <AdminFulfillmentActionButton
                requestId={requestId}
                action="ready_for_pickup"
                label="Abholbereit"
                variant="green"
                disabled={!isConfirmed}
              />

              <AdminFulfillmentActionButton
                requestId={requestId}
                action="mark_picked_up"
                label="Abgeholt"
                variant="green"
                disabled={!isConfirmed}
              />
            </>
          ) : null}

          {isShipping ? (
            <>
              <AdminFulfillmentActionButton
                requestId={requestId}
                action="ready_for_shipping"
                label="Versandbereit"
                variant="blue"
                disabled={!isConfirmed}
              />

              <AdminFulfillmentActionButton
                requestId={requestId}
                action="mark_shipped"
                label="Versendet"
                variant="green"
                disabled={!isConfirmed}
              />
            </>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 rounded-2xl bg-[#FBF7F0] p-4 text-xs font-semibold leading-5 text-[#52616F] md:grid-cols-2">
          <div>
            <p className="font-black text-[#102A43]">Zeitpunkte</p>
            <p>Picking gestartet: {formatDateTime(pickingStartedAt)}</p>
            <p>Gepickt: {formatDateTime(pickedAt)}</p>
            <p>Gepackt: {formatDateTime(packedAt)}</p>
          </div>

          <div>
            <p className="font-black text-[#102A43]">Übergabe</p>
            <p>Versendet: {formatDateTime(shippedAt)}</p>
            <p>Abgeholt: {formatDateTime(pickedUpAt)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ClipboardListIcon() {
  return <ShoppingBasket className="h-4 w-4" />;
}