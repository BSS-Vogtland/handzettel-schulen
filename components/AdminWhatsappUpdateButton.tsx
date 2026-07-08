"use client";

type AdminWhatsappUpdateButtonProps = {
  requestId: string;
  phone?: string | null;
  enabled: boolean;
};

function hasPhone(value: unknown) {
  return String(value || "").replace(/[^\d]/g, "").length >= 7;
}

export default function AdminWhatsappUpdateButton({
  requestId,
  phone,
  enabled,
}: AdminWhatsappUpdateButtonProps) {
  if (!hasPhone(phone)) {
    return (
      <div className="rounded-2xl border border-[#E8DED2] bg-[#FBF7F0] px-4 py-3 text-sm font-bold text-[#52616F]">
        Keine WhatsApp-Nummer hinterlegt.
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-[#F4C7C7] bg-[#FFF1F1] px-4 py-3 text-sm font-bold text-[#B5282D]">
        Kunde hat WhatsApp-Updates abgewählt.
      </div>
    );
  }

  return (
    <a
      href={"/api/admin/requests/" + encodeURIComponent(requestId) + "/whatsapp-update"}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#2F7D50] px-4 py-3 text-center text-sm font-black text-white shadow-sm transition hover:brightness-110"
    >
      WhatsApp-Update senden
    </a>
  );
}
