import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeEuro,
  CalendarClock,
  CheckCircle2,
  Circle,
  FileText,
  ImageIcon,
  ListChecks,
  Megaphone,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialGenerateButton from "@/components/AdminSocialGenerateButton";

export const dynamic = "force-dynamic";

type SocialPostRow = {
  id: string;
  created_at: string;
  status: string | null;
  review_status: string | null;
  topic: string | null;
  hook: string | null;
  cta: string | null;
  scheduled_at: string | null;
  published_at: string | null;
};

type SocialAssetRow = {
  id: string;
  post_id: string | null;
  asset_type: string | null;
  status: string | null;
};

type SocialPublishEventRow = {
  post_id: string | null;
  platform: string | null;
  event_type: string | null;
  status: string | null;
};

type WorkflowStep = {
  key: string;
  title: string;
  description: string;
  href: string;
  buttonLabel: string;
  icon: ReactNode;
  isDone: boolean;
  isUnlocked: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Berlin",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getStatusLabel(status: string | null) {
  switch (status) {
    case "draft":
      return "Entwurf";
    case "approved":
      return "Freigegeben";
    case "scheduled":
      return "Geplant";
    case "published":
      return "Veröffentlicht";
    case "failed":
      return "Fehler";
    case "archived":
      return "Archiviert";
    default:
      return status || "Unbekannt";
  }
}

function getPostStatusClasses(status: string | null) {
  switch (status) {
    case "published":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "scheduled":
      return "border-purple-200 bg-purple-50 text-purple-800";
    case "approved":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "draft":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function StepBadge({
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
        fertig
      </span>
    );
  }

  if (isUnlocked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#A23A2E] bg-[#FFF7F2] px-3 py-1 text-xs font-black text-[#A23A2E]">
        <Circle className="h-3.5 w-3.5" />
        jetzt
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-500">
      <Circle className="h-3.5 w-3.5" />
      später
    </span>
  );
}

function WorkflowStepRow({ step }: { step: WorkflowStep }) {
  const classes = step.isDone
    ? "border-emerald-200 bg-emerald-50"
    : step.isUnlocked
      ? "border-[#A23A2E] bg-white"
      : "border-slate-200 bg-slate-50 opacity-75";

  return (
    <div className={`rounded-2xl border p-4 ${classes}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              step.isDone
                ? "bg-emerald-700 text-white"
                : step.isUnlocked
                  ? "bg-[#A23A2E] text-white"
                  : "bg-slate-200 text-slate-600"
            }`}
          >
            {step.icon}
          </div>

          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <StepBadge isDone={step.isDone} isUnlocked={step.isUnlocked} />
              <h3 className="text-sm font-black text-[#102A43]">
                {step.title}
              </h3>
            </div>

            <p className="text-sm font-semibold leading-6 text-[#52616F]">
              {step.description}
            </p>
          </div>
        </div>

        {step.isUnlocked || step.isDone ? (
          <Link
            href={step.href}
            className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black shadow-sm transition ${
              step.isDone
                ? "border border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
                : "bg-[#A23A2E] text-white hover:brightness-110"
            }`}
          >
            {step.buttonLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-500">
            Noch gesperrt
          </span>
        )}
      </div>
    </div>
  );
}

function getCurrentStep(steps: WorkflowStep[]) {
  return steps.find((step) => !step.isDone && step.isUnlocked) || null;
}

function PostWorkflowCard({
  post,
  hasImage,
  hasVideo,
  isPublishedByEvent,
}: {
  post: SocialPostRow;
  hasImage: boolean;
  hasVideo: boolean;
  isPublishedByEvent: boolean;
}) {
  const isReviewApproved = post.review_status === "approved";
  const isScheduled = post.status === "scheduled" || Boolean(post.scheduled_at);
  const isPublished =
    post.status === "published" || Boolean(post.published_at) || isPublishedByEvent;

  const textChecked = isReviewApproved || isScheduled || isPublished;

  const steps: WorkflowStep[] = [
    {
      key: "text",
      title: "Text und CTA prüfen",
      description:
        "Hook, Caption und CTA müssen klar auf Liste hochladen, Paket vorbereiten und online bestellen einzahlen.",
      href: `/admin/social/${post.id}`,
      buttonLabel: "Text bearbeiten",
      icon: <FileText className="h-4 w-4" />,
      isDone: textChecked,
      isUnlocked: !isPublished,
    },
    {
      key: "review",
      title: "Review freigeben",
      description:
        "Erst nach fachlicher Prüfung wird der Beitrag freigegeben. Ohne Review sollte kein Asset erzeugt werden.",
      href: `/admin/social/${post.id}/review`,
      buttonLabel: "Review öffnen",
      icon: <ShieldCheck className="h-4 w-4" />,
      isDone: isReviewApproved || isScheduled || isPublished,
      isUnlocked: !isPublished,
    },
    {
      key: "image",
      title: "Bild erzeugen",
      description:
        "Bild erst nach Review erzeugen. Danach Hook, Motiv, Branding und Textbeschnitt prüfen.",
      href: `/admin/social/${post.id}`,
      buttonLabel: "Bild erzeugen",
      icon: <ImageIcon className="h-4 w-4" />,
      isDone: hasImage || isScheduled || isPublished,
      isUnlocked: isReviewApproved && !isPublished,
    },
    {
      key: "video",
      title: "MP4 / Musik / TikTok 9:16 vorbereiten",
      description:
        "Video erst aus einem geprüften Bild erzeugen. Danach optional Musik und TikTok-Version erstellen.",
      href: `/admin/social/${post.id}/posting`,
      buttonLabel: "Video vorbereiten",
      icon: <Video className="h-4 w-4" />,
      isDone: hasVideo || isScheduled || isPublished,
      isUnlocked: hasImage && !isPublished,
    },
    {
      key: "posting",
      title: "Posting-Sicherheitsvorschau",
      description:
        "Finalen Text, Pflichtlink, Plattform und Asset prüfen. Dann veröffentlichen oder für den Kalender nutzen.",
      href: `/admin/social/${post.id}/posting`,
      buttonLabel: "Posting prüfen",
      icon: <Share2 className="h-4 w-4" />,
      isDone: isScheduled || isPublished,
      isUnlocked: (hasImage || hasVideo) && !isPublished,
    },
    {
      key: "ads",
      title: "Optional Ads vorbereiten",
      description:
        "Ads erst aus einem sauberen, geprüften Beitrag vorbereiten. Budget und Landingpage gesondert prüfen.",
      href: "/admin/social/ads",
      buttonLabel: "Ads öffnen",
      icon: <BadgeEuro className="h-4 w-4" />,
      isDone: false,
      isUnlocked: isScheduled || isPublished || hasVideo,
    },
  ];

  const currentStep = getCurrentStep(steps);
  const doneCount = steps.filter((step) => step.isDone).length;
  const progressPercent = Math.round((doneCount / 5) * 100);

  return (
    <article className="overflow-hidden rounded-[2rem] border border-[#E7D8C3] bg-white shadow-sm">
      <div className="border-b border-[#E7D8C3] bg-[#FFFCF7] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getPostStatusClasses(
                  post.status
                )}`}
              >
                {getStatusLabel(post.status)}
              </span>

              <span className="rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-bold text-[#52616F]">
                Erstellt: {formatDateTime(post.created_at)}
              </span>

              {post.scheduled_at ? (
                <span className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-bold text-purple-800">
                  Geplant: {formatDateTime(post.scheduled_at)}
                </span>
              ) : null}

              {isPublished ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                  veröffentlicht
                </span>
              ) : null}
            </div>

            <h2 className="text-2xl font-black text-[#102A43]">
              {post.topic || "Social-Beitrag"}
            </h2>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
              {post.hook || "Noch kein Hook vorhanden."}
            </p>

            {post.cta ? (
              <p className="mt-3 max-w-3xl rounded-2xl border border-[#E7D8C3] bg-white p-3 text-sm font-bold leading-6 text-[#102A43]">
                CTA: {post.cta}
              </p>
            ) : null}
          </div>

          <div className="min-w-[220px] rounded-2xl border border-[#E7D8C3] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
              Beitragsfortschritt
            </p>
            <p className="mt-1 text-3xl font-black text-[#102A43]">
              {Math.min(progressPercent, 100)}%
            </p>

            <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#F5E8D8]">
              <div
                className="h-full rounded-full bg-[#A23A2E]"
                style={{ width: `${Math.min(progressPercent, 100)}%` }}
              />
            </div>

            {currentStep ? (
              <Link
                href={currentStep.href}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#A23A2E] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
              >
                Jetzt: {currentStep.title}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                href={`/admin/social/${post.id}/posting`}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100"
              >
                Beitrag prüfen
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-5 sm:p-6">
        {steps.map((step) => (
          <WorkflowStepRow key={step.key} step={step} />
        ))}
      </div>
    </article>
  );
}

export default async function AdminSocialWorkflowPage() {
  const { data: postsData } = await supabaseServer
    .from("social_posts")
    .select("id, created_at, status, review_status, topic, hook, cta, scheduled_at, published_at")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: assetsData } = await supabaseServer
    .from("social_assets")
    .select("id, post_id, asset_type, status")
    .neq("status", "archived")
    .limit(1000);

  const { data: publishEventsData } = await supabaseServer
    .from("social_publish_events")
    .select("post_id, platform, event_type, status")
    .eq("event_type", "publish")
    .eq("status", "success")
    .limit(1000);

  const posts = ((postsData || []) as SocialPostRow[]).filter(
    (post) => post.status !== "archived"
  );

  const assets = (assetsData || []) as SocialAssetRow[];
  const publishEvents = (publishEventsData || []) as SocialPublishEventRow[];

  const imagePostIds = new Set(
    assets
      .filter((asset) => asset.asset_type === "image")
      .map((asset) => asset.post_id)
      .filter(Boolean)
  );

  const videoPostIds = new Set(
    assets
      .filter((asset) => asset.asset_type === "video")
      .map((asset) => asset.post_id)
      .filter(Boolean)
  );

  const publishedByEventPostIds = new Set(
    publishEvents.map((event) => event.post_id).filter(Boolean)
  );

  const activePosts = posts.filter(
    (post) =>
      post.status !== "published" &&
      !post.published_at &&
      !publishedByEventPostIds.has(post.id)
  );

  const publishedPosts = posts.filter(
    (post) =>
      post.status === "published" ||
      Boolean(post.published_at) ||
      publishedByEventPostIds.has(post.id)
  );

  const draftCount = activePosts.filter((post) => post.status === "draft").length;
  const approvedCount = activePosts.filter(
    (post) => post.review_status === "approved"
  ).length;
  const withImageCount = activePosts.filter((post) =>
    imagePostIds.has(post.id)
  ).length;
  const withVideoCount = activePosts.filter((post) =>
    videoPostIds.has(post.id)
  ).length;

  return (
    <main className="min-h-screen bg-[#FBF7F0] px-4 py-8 text-[#102A43] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
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
            Beitrags-Workflow
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_0.6fr] lg:items-start">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Jeder Beitrag Schritt für Schritt
              </h1>

              <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-[#486581]">
                Jeder erstellte Beitrag bekommt seinen eigenen Workflow. Du
                gehst pro Beitrag von Text und CTA über Review, Bild, Video und
                Posting bis zur optionalen Ads-Vorbereitung.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                Neue Beiträge
              </p>
              <AdminSocialGenerateButton />
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
              Aktiv
            </p>
            <p className="mt-1 text-3xl font-black">{activePosts.length}</p>
          </div>

          <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
              Entwürfe
            </p>
            <p className="mt-1 text-3xl font-black">{draftCount}</p>
          </div>

          <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
              Freigegeben
            </p>
            <p className="mt-1 text-3xl font-black">{approvedCount}</p>
          </div>

          <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
              Mit Bild / Video
            </p>
            <p className="mt-1 text-3xl font-black">
              {withImageCount}/{withVideoCount}
            </p>
          </div>

          <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
              Veröffentlicht
            </p>
            <p className="mt-1 text-3xl font-black">{publishedPosts.length}</p>
          </div>
        </section>

        {activePosts.length === 0 ? (
          <section className="rounded-[2rem] border border-dashed border-[#D9C4A8] bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFFCF7] text-[#A23A2E]">
              <Plus className="h-7 w-7" />
            </div>

            <h2 className="mt-4 text-xl font-black">
              Keine aktiven Beiträge im Workflow
            </h2>

            <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-[#627D98]">
              Erzeuge zuerst 3 neue Beiträge. Danach erscheint hier für jeden
              Beitrag ein eigener Ablauf von Textprüfung bis Veröffentlichung.
            </p>
          </section>
        ) : (
          <section className="space-y-5">
            {activePosts.map((post) => (
              <PostWorkflowCard
                key={post.id}
                post={post}
                hasImage={imagePostIds.has(post.id)}
                hasVideo={videoPostIds.has(post.id)}
                isPublishedByEvent={publishedByEventPostIds.has(post.id)}
              />
            ))}
          </section>
        )}

        {publishedPosts.length > 0 ? (
          <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold leading-6 text-emerald-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-black">
                  Bereits veröffentlichte Beiträge
                </h2>
                <p className="mt-1">
                  {publishedPosts.length} Beitrag/Beiträge sind bereits
                  veröffentlicht und werden nicht mehr als aktive Workflow-Aufgabe
                  geführt.
                </p>
              </div>

              <Link
                href="/admin/social"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100"
              >
                Übersicht öffnen
                <CheckCircle2 className="h-4 w-4" />
              </Link>
            </div>
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
                <CalendarClock className="h-4 w-4" />
                Sammelschritt
              </div>

              <h2 className="mt-3 text-xl font-black">
                Wochenplan erst nach vorbereiteten Beiträgen
              </h2>

              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#486581]">
                Wenn mehrere Beiträge pro Karte sauber durch Text, Review, Bild,
                Video und Posting-Vorschau gegangen sind, kannst Du sie im
                Kalender planen.
              </p>
            </div>

            <Link
              href="/admin/social/kalender"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-purple-200 bg-purple-50 px-5 py-3 text-sm font-black text-purple-800 shadow-sm transition hover:bg-purple-100"
            >
              Kalender öffnen
              <CalendarClock className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
