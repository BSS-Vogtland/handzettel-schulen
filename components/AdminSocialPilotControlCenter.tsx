import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  ListChecks,
  Music,
  Send,
  ShieldCheck,
  Video,
} from "lucide-react";

const quickLinks = [
  {
    label: "Publishing Dashboard",
    href: "#publishing-dashboard",
    description: "Gesamtstatus der letzten Beiträge",
  },
  {
    label: "Meta Status",
    href: "#meta-status",
    description: "Facebook & Instagram Verbindung",
  },
  {
    label: "TikTok Status",
    href: "#tiktok-status",
    description: "OAuth / Login Kit / Token",
  },
  {
    label: "TikTok Review",
    href: "#tiktok-review",
    description: "Review-Vorbereitung & Demo-Skript",
  },
];

const nextSteps = [
  "Meta Publishing ist produktiv nutzbar.",
  "TikTok ist per Login Kit verbunden.",
  "TikTok Upload bleibt gesperrt, bis video.upload freigegeben ist.",
  "Musikbibliothek und Video mit Musik sind vorbereitet.",
];

export default function AdminSocialPilotControlCenter() {
  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
            SocialPilot Arbeitszentrale
          </div>

          <h2 className="mt-4 text-2xl font-black text-[#102A43]">
            Übersicht, Status und nächste Schritte
          </h2>

          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#627D98]">
            Kompakter Einstieg in Publishing, Plattformstatus, TikTok-Vorbereitung
            und Musik-/Video-Workflow. Diese Box löst keine Veröffentlichung aus.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/admin/social/music"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-5 py-3 text-sm font-black text-[#102A43] shadow-sm transition hover:bg-white"
          >
            <Music className="h-4 w-4" />
            Musikbibliothek
          </Link>

          <Link
            href="/admin/social/tiktok-review"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#A23A2E] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
          >
            <Video className="h-4 w-4" />
            TikTok Review-Material
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[1.5rem] border border-[#D9E2EC] bg-[#F8FAFC] p-4">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-[#102A43]" />
            <h3 className="text-lg font-black text-[#102A43]">
              Schnellnavigation
            </h3>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {quickLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-[#D9E2EC] bg-white p-4 text-sm font-bold text-[#102A43] transition hover:border-[#A23A2E] hover:bg-[#FFFCF7]"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-black">{item.label}</span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-[#8A5A35]" />
                </span>

                <span className="mt-1 block text-xs font-bold leading-5 text-[#627D98]">
                  {item.description}
                </span>
              </a>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-emerald-800" />
            <h3 className="text-lg font-black text-emerald-950">
              Aktueller Arbeitsstand
            </h3>
          </div>

          <div className="mt-4 space-y-3">
            {nextSteps.map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-2xl border border-white/80 bg-white/80 p-3 text-sm font-bold leading-5 text-emerald-950"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-900">
        Nächster technischer Ausbau: TikTok video.upload / Content Posting API erst
        nach Review-Vorbereitung und vollständigem Demo-Flow aktivieren. Bis dahin
        bleibt TikTok bewusst im sicheren Vorbereitungsmodus.
      </div>
    </section>
  );
}
