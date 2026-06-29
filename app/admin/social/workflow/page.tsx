import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeEuro,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Circle,
  FileText,
  ImageIcon,
  ListChecks,
  Megaphone,
  PlugZap,
  Share2,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SocialPostRow = {
  id: string;
  created_at: string;
  status: string | null;
  review_status: string | null;
  topic: string | null;
  scheduled_at: string | null;
  published_at: string | null;
};

type SocialAssetRow = {
  post_id: string;
  asset_type: string | null;
  status: string | null;
};

type WorkflowStep = {
  number: number;
  title: string;
  description: string;
  detail: string;
  href: string;
  buttonLabel: string;
  icon: ReactNode;
  isDone: boolean;
  isUnlocked: boolean;
  metric: string;
};

function StepStatusBadge({
  isDone,
  isUnlocked,
}: {
  isDone: boolean;
  isUnlocked: boolean;
}) {
  if (isDone) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Erledigt
      </span>
    );
  }

  if (isUnlocked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">
        <Circle className="h-3.5 w-3.5" />
        Jetzt dran
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-600">
      <Circle className="h-3.5 w-3.5" />
      Gesperrt
    </span>
  );
}

function WorkflowCard({ step }: { step: WorkflowStep }) {
  const cardClasses = step.isDone
    ? "border-emerald-200 bg-emerald-50"
    : step.isUnlocked
      ? "border-[#A23A2E] bg-white shadow-md"
      : "border-slate-200 bg-slate-50 opacity-75";

  return (
    <article className={`rounded-[2rem] border p-5 ${cardClasses}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-black ${
              step.isDone
                ? "bg-emerald-700 text-white"
                : step.isUnlocked
                  ? "bg-[#A23A2E] text-white"
                  : "bg-slate-200 text-slate-600"
            }`}
          >
            {step.number}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StepStatusBadge
                isDone={step.isDone}
                isUnlocked={step.isUnlocked}
              />

              <span className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-black text-[#486581]">
                {step.icon}
                {step.metric}
              </span>
            </div>

            <h2 className="text-xl font-black text-[#102A43]">{step.title}</h2>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#486581]">
              {step.description}
            </p>

            <p className="mt-3 max-w-3xl rounded-2xl border border-[#E7D8C3] bg-white p-4 text-sm font-bold leading-6 text-[#102A43]">
              {step.detail}
            </p>
          </div>
        </div>

        {step.isUnlocked || step.isDone ? (
          <Link
            href={step.href}
            className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black shadow-sm transition ${
              step.isDone
                ? "border border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
                : "bg-[#A23A2E] text-white hover:brightness-110"
            }`}
          >
            {step.buttonLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <div className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-500">
            Erst vorherigen Schritt erledigen
          </div>
        )}
      </div>
    </article>
  );
}

export default async function AdminSocialWorkflowPage() {
  const { data: postsData } = await supabaseServer
    .from("social_posts")
    .select("id, created_at, status, review_status, topic, scheduled_at, published_at")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: assetsData } = await supabaseServer
    .from("social_assets")
    .select("post_id, asset_type, status")
    .neq("status", "archived")
    .limit(1000);

  const posts = (postsData || []) as SocialPostRow[];
  const assets = (assetsData || []) as SocialAssetRow[];

  const imagePostIds = new Set(
    assets
      .filter((asset) => asset.asset_type === "image")
      .map((asset) => asset.post_id)
  );

  const videoPostIds = new Set(
    assets
      .filter((asset) => asset.asset_type === "video")
      .map((asset) => asset.post_id)
  );

  const activePosts = posts.filter((post) => post.status !== "published");
  const draftPosts = activePosts.filter((post) => post.status === "draft");

  const openReviewPosts = activePosts.filter(
    (post) =>
      !post.review_status ||
      post.review_status === "not_reviewed" ||
      post.review_status === "needs_changes"
  );

  const approvedPosts = activePosts.filter(
    (post) => post.review_status === "approved"
  );

  const approvedWithoutImage = approvedPosts.filter(
    (post) => !imagePostIds.has(post.id)
  );

  const approvedWithImage = approvedPosts.filter((post) =>
    imagePostIds.has(post.id)
  );

  const approvedWithImageWithoutVideo = approvedWithImage.filter(
    (post) => !videoPostIds.has(post.id)
  );

  const readyForPosting = approvedWithImage.filter((post) =>
    videoPostIds.has(post.id)
  );

  const scheduledPosts = posts.filter((post) => post.status === "scheduled");
  const publishedPosts = posts.filter(
    (post) => post.status === "published" || Boolean(post.published_at)
  );

  const firstDraft = draftPosts[0] || activePosts[0] || null;
  const firstReview = openReviewPosts[0] || approvedPosts[0] || null;
  const firstImage = approvedWithoutImage[0] || approvedPosts[0] || null;
  const firstVideo =
    approvedWithImageWithoutVideo[0] || approvedWithImage[0] || null;
  const firstPosting = readyForPosting[0] || approvedWithImage[0] || null;

  const hasAnyContent = activePosts.length > 0;
  const hasApproved = approvedPosts.length > 0;
  const hasImageReady = approvedWithImage.length > 0;
  const hasVideoReady = readyForPosting.length > 0;
  const hasScheduled = scheduledPosts.length > 0;
  const hasPublished = publishedPosts.length > 0;

  const steps: WorkflowStep[] = [
    {
      number: 1,
      title: "Setup und Projektprofil prüfen",
      description:
        "Konten, Projektprofil und Automation müssen grundsätzlich vorbereitet sein, bevor neue Inhalte sinnvoll erzeugt werden.",
      detail:
        "Prüfe OpenAI/Meta/TikTok, Zielgruppe, Angebot, CTA-Richtung und Erinnerungslogik. Das ist der technische und inhaltliche Startpunkt.",
      href: "/admin/social/konten",
      buttonLabel: "Konten prüfen",
      icon: <PlugZap className="h-3.5 w-3.5" />,
      isDone: true,
      isUnlocked: true,
      metric: "Basis",
    },
    {
      number: 2,
      title: "Neue Social-Beiträge erzeugen",
      description:
        "Erzeuge zunächst wenige neue Beiträge. Nach dem Neustart ist ein kleiner Testlauf mit 3 Beiträgen sinnvoller als direkt ein großer Block.",
      detail:
        "Auf der SocialPilot-Startseite die gewünschte Anzahl wählen und neue Entwürfe erzeugen. Danach nicht sofort planen, sondern erst Inhalte prüfen.",
      href: "/admin/social",
      buttonLabel: "Beiträge erzeugen",
      icon: <Sparkles className="h-3.5 w-3.5" />,
      isDone: hasAnyContent,
      isUnlocked: true,
      metric: `${activePosts.length} aktive Beiträge`,
    },
    {
      number: 3,
      title: "Texte und CTA fachlich prüfen",
      description:
        "Jeder Beitrag muss klar auf Liste hochladen, Paket vorbereiten, online bestellen und Zeit sparen einzahlen.",
      detail:
        "Schlechte Richtung vermeiden: nicht nur Liste verstehen, prüfen oder lernen. Der CTA muss zur Bestellung/Paketvorbereitung führen.",
      href: firstDraft ? `/admin/social/${firstDraft.id}` : "/admin/social",
      buttonLabel: "Beitrag bearbeiten",
      icon: <FileText className="h-3.5 w-3.5" />,
      isDone: hasApproved,
      isUnlocked: hasAnyContent,
      metric: `${draftPosts.length} Entwürfe`,
    },
    {
      number: 4,
      title: "Review freigeben",
      description:
        "Erst wenn Hook, Caption, CTA, Claims und Bildidee stimmen, wird der Beitrag freigegeben.",
      detail:
        "Im Review bewusst prüfen: keine falschen Versprechen, kein reiner Prüfservice, keine schwache CTA-Logik, Bildidee passend zum Hook.",
      href: firstReview
        ? `/admin/social/${firstReview.id}/review`
        : "/admin/social",
      buttonLabel: "Review öffnen",
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
      isDone: hasApproved,
      isUnlocked: hasAnyContent,
      metric: `${approvedPosts.length} freigegeben`,
    },
    {
      number: 5,
      title: "Bild erzeugen und prüfen",
      description:
        "Das Bild kommt erst nach der inhaltlichen Freigabe. Der Hook muss im Bild vollständig sichtbar sein.",
      detail:
        "Bild erzeugen, dann prüfen: Hook vollständig, Motiv passend, Branding sichtbar, keine unpassende Szene. Bei Fehlern Text oder Bild neu erzeugen.",
      href: firstImage ? `/admin/social/${firstImage.id}` : "/admin/social",
      buttonLabel: "Bild erzeugen",
      icon: <ImageIcon className="h-3.5 w-3.5" />,
      isDone: hasImageReady,
      isUnlocked: hasApproved,
      metric: `${approvedWithImage.length} mit Bild`,
    },
    {
      number: 6,
      title: "MP4, Musik und TikTok 9:16 vorbereiten",
      description:
        "Erst wenn das Bild sauber ist, wird daraus das Video erzeugt. Danach optional Musik und TikTok-Format.",
      detail:
        "Reihenfolge: MP4 erzeugen, öffnen und prüfen. Optional Musikvideo erzeugen. Danach TikTok 9:16 rendern und auf Beschnitt prüfen.",
      href: firstVideo
        ? `/admin/social/${firstVideo.id}/posting`
        : "/admin/social",
      buttonLabel: "Video vorbereiten",
      icon: <Video className="h-3.5 w-3.5" />,
      isDone: hasVideoReady,
      isUnlocked: hasImageReady,
      metric: `${readyForPosting.length} mit Video`,
    },
    {
      number: 7,
      title: "Posting-Sicherheitsvorschau prüfen",
      description:
        "Vor Veröffentlichung muss die finale Plattformvorschau geprüft werden: Text, Link, Asset und Plattform.",
      detail:
        "Facebook/Instagram-Vorschau öffnen. Pflichtlink prüfen. Asset prüfen. Erst dann veröffentlichen oder für den Kalender nutzen.",
      href: firstPosting
        ? `/admin/social/${firstPosting.id}/posting`
        : "/admin/social",
      buttonLabel: "Posting prüfen",
      icon: <Share2 className="h-3.5 w-3.5" />,
      isDone: hasScheduled || hasPublished,
      isUnlocked: hasVideoReady || hasImageReady,
      metric: `${readyForPosting.length} bereit`,
    },
    {
      number: 8,
      title: "Wochenplan erstellen oder direkt veröffentlichen",
      description:
        "Freigegebene und vorbereitete Beiträge können eingeplant oder direkt veröffentlicht werden.",
      detail:
        "Wenn mehrere Beiträge bereit sind: Wochenplan erstellen und Kalender prüfen. Einzelne Beiträge können direkt über die Posting-Seite veröffentlicht werden.",
      href: "/admin/social/kalender",
      buttonLabel: "Kalender öffnen",
      icon: <CalendarClock className="h-3.5 w-3.5" />,
      isDone: hasScheduled || hasPublished,
      isUnlocked: hasVideoReady || hasImageReady,
      metric: `${scheduledPosts.length} geplant`,
    },
    {
      number: 9,
      title: "Optional Ads-Kampagne vorbereiten",
      description:
        "Ads erst nach sauberem organischen Beitrag vorbereiten. Inhalt, Asset und Landingpage müssen vorher stimmen.",
      detail:
        "Ads-Kampagne nur nutzen, wenn CTA, Link, Bild/Video und Budgetfreigabe passen. Keine Ads aus unfertigen Entwürfen.",
      href: "/admin/social/ads",
      buttonLabel: "Ads öffnen",
      icon: <BadgeEuro className="h-3.5 w-3.5" />,
      isDone: false,
      isUnlocked: hasPublished || hasScheduled || hasVideoReady,
      metric: "optional",
    },
    {
      number: 10,
      title: "Protokoll und Fehler prüfen",
      description:
        "Nach Planung oder Veröffentlichung wird kontrolliert, ob alles sauber verarbeitet wurde.",
      detail:
        "Publishing-Protokoll öffnen, Fehler prüfen, Kalender kontrollieren und bei Bedarf einzelne Beiträge nacharbeiten.",
      href: "/admin/social/automation/events",
      buttonLabel: "Protokoll öffnen",
      icon: <BellRing className="h-3.5 w-3.5" />,
      isDone: false,
      isUnlocked: hasScheduled || hasPublished,
      metric: `${publishedPosts.length} veröffentlicht`,
    },
  ];

  const currentStep =
    steps.find((step) => !step.isDone && step.isUnlocked) || steps[1];

  return (
    <main className="min-h-screen bg-[#FBF7F0] px-4 py-8 text-[#102A43] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[2rem] border border-[#E7D8C3] bg-white p-6 shadow-sm sm:p-8">
          <Link
            href="/admin/social"
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[#A23A2E] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum SocialPilot
          </Link>

          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <ListChecks className="h-4 w-4" />
            Geführter Workflow
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                SocialPilot Schritt für Schritt
              </h1>

              <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-[#486581]">
                Diese Seite führt Dich von der Contenterstellung bis zur
                Veröffentlichung und optionalen Ads-Kampagne. Gesperrte Schritte
                werden erst nutzbar, wenn die vorherigen Grundlagen vorhanden
                sind.
              </p>
            </div>

            <div className="rounded-2xl border border-[#A23A2E] bg-[#FFF7F2] p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A23A2E]">
                Nächster Schritt
              </p>
              <p className="mt-1 text-lg font-black text-[#102A43]">
                {currentStep.number}. {currentStep.title}
              </p>
              <Link
                href={currentStep.href}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#A23A2E] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                Jetzt öffnen
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
              Aktiv
            </p>
            <p className="mt-1 text-3xl font-black">{activePosts.length}</p>
          </div>

          <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
              Freigegeben
            </p>
            <p className="mt-1 text-3xl font-black">{approvedPosts.length}</p>
          </div>

          <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
              Bereit
            </p>
            <p className="mt-1 text-3xl font-black">{readyForPosting.length}</p>
          </div>

          <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
              Veröffentlicht
            </p>
            <p className="mt-1 text-3xl font-black">{publishedPosts.length}</p>
          </div>
        </section>

        <section className="space-y-4">
          {steps.map((step) => (
            <WorkflowCard key={step.number} step={step} />
          ))}
        </section>
      </div>
    </main>
  );
}
