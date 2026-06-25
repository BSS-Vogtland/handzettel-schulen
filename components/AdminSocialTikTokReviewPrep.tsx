import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Video,
} from "lucide-react";

const reviewText = `The app is used by our internal admin team for handzettel-schulen.de. It connects our own TikTok account to our private SocialPilot dashboard.

Current integration:
- Login Kit is used to authorize our own TikTok account through OAuth and connect it to the SocialPilot dashboard.
- user.info.basic is used to identify the connected TikTok account in the admin dashboard.
- The SocialPilot dashboard prepares our own generated short videos for TikTok.
- A TikTok 9:16 MP4 version can be generated from an existing SocialPilot video asset.
- The TikTok Draft Upload page shows the video preview, final caption, asset status, audio status, and the current safety lock.

Planned Content Posting integration:
- Content Posting API will be used to upload our own generated short videos from the SocialPilot dashboard to TikTok.
- video.upload will be used to upload videos to TikTok as drafts so they can be completed or posted through TikTok.

Current safety behavior:
- Real TikTok upload is intentionally blocked until video.upload is approved and TIKTOK_ENABLE_DRAFT_UPLOAD is explicitly enabled.
- The app does not allow public users or third parties to upload content.

The app is not available to public users and does not allow third parties to upload content. Only authorized internal administrators can access the dashboard.`;

const demoVideoSteps = [
  "Open https://www.handzettel-schulen.de/admin/social in the browser.",
  "Show the SocialPilot dashboard and the TikTok system status.",
  "Show that TikTok Login Kit is connected and the TikTok account is visible.",
  "Open one prepared SocialPilot post with an existing generated video.",
  "Open the TikTok Draft Upload page for this post.",
  "Show the TikTok 9:16 video preview.",
  "Show the asset status block: render source, audio/music status, current TikTok version, older versions.",
  "Show the final TikTok caption text.",
  "Show the safety lock: video.upload missing and/or upload flag disabled.",
  "Explain that Content Posting API will only be used for our own generated short videos.",
  "After video.upload is approved, repeat the demo with the real Draft Upload button, confirmation step, upload result, and protocol/status log.",
];

const currentReadiness: {
  label: string;
  status: "ready" | "locked";
  text: string;
}[] = [
  {
    label: "TikTok Login Kit OAuth",
    status: "ready",
    text: "Sandbox-Verbindung funktioniert. Access Token, Refresh Token und Open ID werden in Supabase gespeichert.",
  },
  {
    label: "Scope user.info.basic",
    status: "ready",
    text: "TikTok-Konto kann im SocialPilot identifiziert und angezeigt werden.",
  },
  {
    label: "URL Prefix",
    status: "ready",
    text: "https://www.handzettel-schulen.de/ ist verifiziert.",
  },
  {
    label: "TikTok 9:16 Video",
    status: "ready",
    text: "Der SocialPilot kann eine TikTok-optimierte 9:16-MP4-Version aus dem besten vorhandenen Video erzeugen.",
  },
  {
    label: "Asset-/Audio-Status",
    status: "ready",
    text: "Die TikTok-Seite zeigt Render-Quelle, Audio/Musik-Erkennung, aktuelle TikTok-Version und ältere Versionen.",
  },
  {
    label: "Draft-Upload-Seite",
    status: "ready",
    text: "Die Seite zeigt Video-Vorschau, finalen TikTok-Text, Review-Status und Upload-Sicherheitsstatus.",
  },
  {
    label: "Content Posting API",
    status: "locked",
    text: "Noch nicht produktiv aktiv. Die Review-Vorbereitung ist sichtbar, aber echter Upload bleibt blockiert.",
  },
  {
    label: "video.upload",
    status: "locked",
    text: "Noch nicht im aktiven Scope. Erst nach TikTok-Freigabe und bewusstem ENV-Flag darf echter Upload starten.",
  },
];

function StatusIcon({ status }: { status: "ready" | "locked" }) {
  if (status === "ready") {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />;
  }

  return <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />;
}

export default function AdminSocialTikTokReviewPrep() {
  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
            TikTok Review-Vorbereitung
          </div>

          <h2 className="mt-4 text-2xl font-black text-[#102A43]">
            V2J.1 · Review-/Upload-Vorbereitung finalisieren
          </h2>

          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#627D98]">
            Dieser Block zeigt den aktuellen TikTok-Review-Stand nach V2I.4:
            Login Kit ist verbunden, TikTok-Video und Asset-Status sind sichtbar,
            der Draft-Upload-Flow ist vorbereitet. Der echte Upload bleibt
            absichtlich gesperrt, bis video.upload genehmigt und das Upload-Flag
            bewusst aktiviert wurde.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href="/admin/social/tiktok-review"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#A23A2E] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
          >
            <ExternalLink className="h-4 w-4" />
            Review-Material öffnen
          </a>

          <a
            href="https://developers.tiktok.com/apps"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-5 py-3 text-sm font-black text-[#102A43] shadow-sm transition hover:bg-white"
          >
            <ExternalLink className="h-4 w-4" />
            TikTok Developer Portal
          </a>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-800">
              <Video className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-lg font-black text-emerald-950">
                Demo-fähiger technischer Stand
              </h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-emerald-900">
                Für die Review kann gezeigt werden: TikTok-Verbindung,
                vorbereiteter Beitrag, TikTok-Video, Audio-/Asset-Status,
                finaler TikTok-Text und gesperrter Upload-Button mit Grund.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {currentReadiness.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-white/80 bg-white/80 p-3"
              >
                <div className="flex items-start gap-3">
                  <StatusIcon status={item.status} />
                  <div>
                    <p className="text-sm font-black text-[#102A43]">
                      {item.label}
                    </p>
                    <p className="mt-1 text-xs font-bold leading-5 text-[#486581]">
                      {item.text}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-lg font-black text-amber-950">
            Sicherheitsmodus bleibt aktiv
          </h3>

          <p className="mt-2 text-sm font-semibold leading-6 text-amber-900">
            Das ist wichtig: Wir bauen hier keine versteckte Veröffentlichung.
            TikTok soll im Review sehen, dass der Flow vorbereitet ist, aber der
            echte Upload erst nach Freigabe von video.upload und bewusstem
            Aktivieren von TIKTOK_ENABLE_DRAFT_UPLOAD möglich wird.
          </p>

          <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">
              Aktueller Review-Fokus
            </p>

            <h4 className="mt-2 text-base font-black text-[#102A43]">
              Nachweisbarer, interner Draft-Upload-Workflow
            </h4>

            <p className="mt-2 text-xs font-bold leading-5 text-[#627D98]">
              In der Aufnahme sollten keine Tokens, Secrets, Supabase-Service-Keys,
              ENV-Werte oder Kundendaten sichtbar sein. Gezeigt werden nur:
              Systemstatus, Video, Caption, Asset-Status und Sperrgrund.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4">
        <h3 className="text-lg font-black text-[#102A43]">
          Aktualisierter Review-Text für TikTok
        </h3>

        <p className="mt-1 text-sm font-semibold leading-6 text-[#627D98]">
          Dieser Text beschreibt jetzt nicht mehr nur die Planung, sondern auch
          den sichtbaren vorbereiteten Draft-/Asset-Flow.
        </p>

        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl border border-[#E7D8C3] bg-white p-4 text-xs font-bold leading-5 text-[#243B53]">
          {reviewText}
        </pre>
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-[#D9E2EC] bg-white p-4">
        <h3 className="text-lg font-black text-[#102A43]">
          Aktualisiertes Demo-Video-Skript
        </h3>

        <p className="mt-1 text-sm font-semibold leading-6 text-[#627D98]">
          Dieses Skript passt zum jetzigen Stand: TikTok-Draft-Seite, 9:16-Video,
          Asset-Status und Sicherheitslock sind bereits sichtbar.
        </p>

        <ol className="mt-4 space-y-2">
          {demoVideoSteps.map((step, index) => (
            <li
              key={step}
              className="rounded-2xl border border-[#D9E2EC] bg-[#F8FAFC] p-3 text-sm font-bold leading-6 text-[#243B53]"
            >
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#102A43] text-xs font-black text-white">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
