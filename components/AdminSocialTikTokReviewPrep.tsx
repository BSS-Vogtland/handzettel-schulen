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

Planned Content Posting integration:
- Content Posting API will be used to upload our own generated short videos from the SocialPilot dashboard to TikTok.
- video.upload will be used to upload videos to TikTok as drafts so they can be completed or posted through TikTok.

The app is not available to public users and does not allow third parties to upload content. Only authorized internal administrators can access the dashboard.`;

const demoVideoSteps = [
  "Open https://www.handzettel-schulen.de/admin/social in the browser.",
  "Show the TikTok system status card with Login Kit connected.",
  "Show that the connected TikTok account is visible in the SocialPilot dashboard.",
  "Open one prepared SocialPilot post with an existing generated video.",
  "Show the generated MP4/video asset and the TikTok caption fields.",
  "Explain that Content Posting API and video.upload will be used only for our own generated short videos.",
  "After the upload feature is implemented, show the TikTok upload button, confirmation step, upload result, and status log.",
];

const currentReadiness = [
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
    label: "Content Posting API",
    status: "next",
    text: "Noch nicht produktiv aktiv. Demo-Video und Upload-Flow müssen vor Review sauber vorbereitet werden.",
  },
  {
    label: "video.upload",
    status: "next",
    text: "Nächster technischer Block. Zuerst Upload/Draft-Flow bauen, dann Demo aufnehmen.",
  },
];

function StatusIcon({ status }: { status: "ready" | "next" }) {
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
            V2G.3 · Demo- und Review-Checkliste
          </h2>

          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#627D98]">
            Dieser Block sammelt den aktuellen TikTok-Stand, den Review-Text und
            das spätere Demo-Video-Skript. Er ist bewusst nur Vorbereitung:
            Content Posting API und video.upload werden erst nach dem sauberen
            Upload-Flow eingereicht.
          </p>
        </div>

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

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-800">
              <Video className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-lg font-black text-emerald-950">
                Aktueller technischer Stand
              </h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-emerald-900">
                TikTok Login Kit ist verbunden. Die App kann den Account erkennen.
                Video-Upload ist noch nicht aktiv und wird nicht vorzeitig
                eingereicht.
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
                  <StatusIcon status={item.status as "ready" | "next"} />
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
            Noch nicht zur Review einreichen
          </h3>

          <p className="mt-2 text-sm font-semibold leading-6 text-amber-900">
            Der TikTok-Review sollte erst eingereicht werden, wenn der komplette
            Upload-/Draft-Flow im SocialPilot sichtbar ist. Ein normales
            Werbevideo reicht nicht. Das Demo-Video muss den echten Ablauf im
            Adminsystem zeigen.
          </p>

          <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-800">
              Nächster technischer Block
            </p>

            <h4 className="mt-2 text-base font-black text-[#102A43]">
              V2G.4 · TikTok Upload/Draft-Flow vorbereiten
            </h4>

            <p className="mt-2 text-xs font-bold leading-5 text-[#627D98]">
              Danach kann das Demo-Video aufgenommen werden: SocialPilot öffnen,
              TikTok-Verbindung zeigen, Post öffnen, MP4 auswählen, TikTok-Upload
              starten und Ergebnis im Protokoll anzeigen.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4">
        <h3 className="text-lg font-black text-[#102A43]">
          Review-Text für TikTok
        </h3>

        <p className="mt-1 text-sm font-semibold leading-6 text-[#627D98]">
          Diesen Text kannst du später im TikTok-App-Review-Feld verwenden.
        </p>

        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl border border-[#E7D8C3] bg-white p-4 text-xs font-bold leading-5 text-[#243B53]">
          {reviewText}
        </pre>
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-[#D9E2EC] bg-white p-4">
        <h3 className="text-lg font-black text-[#102A43]">
          Demo-Video-Skript
        </h3>

        <p className="mt-1 text-sm font-semibold leading-6 text-[#627D98]">
          Dieses Skript verwenden wir später für die Bildschirmaufnahme. Der
          letzte Upload-Schritt kommt erst nach V2G.4/V2G.5 dazu.
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
