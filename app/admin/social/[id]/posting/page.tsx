import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeEuro,
  CalendarClock,
  Camera,
  CheckCircle2,
  ExternalLink,
  FileText,
  Hash,
  ImageIcon,
  Megaphone,
  Share2,
  Video,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialCopyButton from "@/components/AdminSocialCopyButton";
import AdminSocialMarkPublishedButton from "@/components/AdminSocialMarkPublishedButton";
import AdminSocialCreateAdCampaignButton from "@/components/AdminSocialCreateAdCampaignButton";

export const dynamic = "force-dynamic";

type SocialPostRow = {
  id: string;
  created_at: string;
  updated_at: string;
  brand_project: string;
  status: string;
  topic: string;
  content_angle: string | null;
  hook: string;
  caption: string;
  cta: string | null;
  hashtags: string[] | null;
  keywords: string[] | null;
  tiktok_hook: string | null;
  tiktok_caption: string | null;
  instagram_hook: string | null;
  instagram_caption: string | null;
  facebook_hook: string | null;
  facebook_caption: string | null;
  image_prompt: string | null;
  video_prompt: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  platform_targets: string[] | null;
};

type SocialAssetRow = {
  id: string;
  created_at: string;
  public_url: string | null;
  storage_path: string;
  file_size: number | null;
  status: string;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeHashtags(hashtags: string[] | null) {
  return (hashtags || [])
    .map((hashtag) => hashtag.trim())
    .filter(Boolean)
    .map((hashtag) => (hashtag.startsWith("#") ? hashtag : `#${hashtag}`));
}

function buildPostingText({
  hook,
  caption,
  cta,
  hashtags,
}: {
  hook: string;
  caption: string;
  cta: string | null;
  hashtags: string[] | null;
}) {
  const parts = [
    hook.trim(),
    caption.trim(),
    cta?.trim() || "",
    normalizeHashtags(hashtags).join(" "),
  ].filter(Boolean);

  return parts.join("\n\n");
}

function getStatusLabel(status: string) {
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
      return status;
  }
}

function getStatusClasses(status: string) {
  switch (status) {
    case "draft":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "approved":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "scheduled":
      return "border-purple-200 bg-purple-50 text-purple-800";
    case "published":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "failed":
      return "border-red-200 bg-red-50 text-red-800";
    case "archived":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function PostingBlock({
  title,
  icon,
  hook,
  caption,
  cta,
  hashtags,
  platformNote,
}: {
  title: string;
  icon: React.ReactNode;
  hook: string;
  caption: string;
  cta: string | null;
  hashtags: string[] | null;
  platformNote: string;
}) {
  const hashtagsText = normalizeHashtags(hashtags).join(" ");
  const fullText = buildPostingText({
    hook,
    caption,
    cta,
    hashtags,
  });

  return (
    <article className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            {icon}
            {title}
          </div>

          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#52616F]">
            {platformNote}
          </p>
        </div>

        <AdminSocialCopyButton value={fullText} label="Alles kopieren" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
            <Megaphone className="h-4 w-4" />
            Hook
          </div>

          <p className="whitespace-pre-line text-sm font-bold leading-6 text-[#102A43]">
            {hook || "—"}
          </p>

          <div className="mt-3">
            <AdminSocialCopyButton value={hook || ""} label="Hook kopieren" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
            <Hash className="h-4 w-4" />
            Hashtags
          </div>

          <p className="whitespace-pre-line text-sm font-bold leading-6 text-[#102A43]">
            {hashtagsText || "—"}
          </p>

          <div className="mt-3">
            <AdminSocialCopyButton
              value={hashtagsText}
              label="Hashtags kopieren"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4 lg:col-span-2">
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
            <FileText className="h-4 w-4" />
            Caption
          </div>

          <p className="whitespace-pre-line text-sm font-semibold leading-6 text-[#102A43]">
            {caption || "—"}
          </p>

          <div className="mt-3">
            <AdminSocialCopyButton
              value={caption || ""}
              label="Caption kopieren"
            />
          </div>
        </div>

        {cta ? (
          <div className="rounded-2xl border border-[#E7D8C3] bg-white p-4 lg:col-span-2">
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
              <CheckCircle2 className="h-4 w-4" />
              CTA
            </div>

            <p className="text-sm font-bold leading-6 text-[#102A43]">{cta}</p>

            <div className="mt-3">
              <AdminSocialCopyButton value={cta} label="CTA kopieren" />
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default async function AdminSocialPostingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabaseServer
    .from("social_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const post = data as SocialPostRow;

  const { data: assetsData } = await supabaseServer
    .from("social_assets")
    .select("id, created_at, public_url, storage_path, file_size, status")
    .eq("post_id", id)
    .eq("asset_type", "image")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(6);

  const assets = (assetsData || []) as SocialAssetRow[];
  const latestAsset = assets[0] || null;

  const tiktokHook = post.tiktok_hook || post.hook;
  const tiktokCaption = post.tiktok_caption || post.caption;

  const instagramHook = post.instagram_hook || post.hook;
  const instagramCaption = post.instagram_caption || post.caption;

  const facebookHook = post.facebook_hook || post.hook;
  const facebookCaption = post.facebook_caption || post.caption;

  const isPublished = post.status === "published";

  return (
    <main className="min-h-screen bg-[#FBF7F0] px-4 py-8 text-[#102A43] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-[2rem] border border-[#E7D8C3] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <div className="mb-4 flex flex-wrap gap-3">
                <Link
                  href={`/admin/social/${post.id}`}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-sm font-black text-[#A23A2E] transition hover:bg-[#F5E8D8]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Zurück zum Beitrag
                </Link>

                <Link
                  href="/admin/social"
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#E7D8C3] bg-white px-4 py-2 text-sm font-black text-[#486581] transition hover:bg-[#FFFCF7]"
                >
                  Zum SocialPilot
                </Link>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                <Share2 className="h-4 w-4" />
                Posting-Vorbereitung
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                {post.topic}
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#486581]">
                Hier findest Du alle Texte, Hashtags, Bild- und Promptdaten für
                die manuelle Veröffentlichung. Aus dieser Vorbereitung kann
                zusätzlich ein Ads-Kampagnenentwurf erstellt werden.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getStatusClasses(
                  post.status
                )}`}
              >
                {getStatusLabel(post.status)}
              </span>

              <div className="mt-4 space-y-3 text-sm font-semibold text-[#52616F]">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-[#A23A2E]" />
                  Geplant: {formatDateTime(post.scheduled_at)}
                </div>

                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#A23A2E]" />
                  Veröffentlicht: {formatDateTime(post.published_at)}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3">
                <AdminSocialMarkPublishedButton
                  postId={post.id}
                  disabled={isPublished}
                />

                <AdminSocialCreateAdCampaignButton postId={post.id} />
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-5 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-[#B5282D]" />
              <h2 className="text-2xl font-black text-[#102A43]">
                Bild / Motiv
              </h2>
            </div>

            {latestAsset?.public_url ? (
              <div className="grid gap-5 md:grid-cols-[280px_1fr]">
                <a
                  href={latestAsset.public_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-[1.5rem] bg-[#102A43]"
                >
                  <img
                    src={latestAsset.public_url}
                    alt="Social-Media-Bild"
                    className="aspect-[2/3] w-full object-cover"
                  />
                </a>

                <div className="space-y-4">
                  <p className="text-sm font-semibold leading-6 text-[#52616F]">
                    Nutze dieses Bild für TikTok, Instagram oder Facebook. Für
                    Reels/TikTok kannst Du es als Standbild, Thumbnail oder
                    Story-Motiv verwenden.
                  </p>

                  <a
                    href={latestAsset.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                  >
                    Bild öffnen
                    <ExternalLink className="h-4 w-4" />
                  </a>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-amber-800">
                      <BadgeEuro className="h-4 w-4" />
                      Ads-Weiterverwendung
                    </div>
                    <p className="text-sm font-bold leading-6 text-amber-900">
                      Über „Als Ads-Kampagne vorbereiten“ wird dieser Beitrag
                      mit dem neuesten Bild als Kampagnenentwurf angelegt. Das
                      Budget muss danach separat geprüft und freigegeben werden.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
                      Bild-Prompt
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-[#102A43]">
                      {post.image_prompt || "—"}
                    </p>

                    <div className="mt-3">
                      <AdminSocialCopyButton
                        value={post.image_prompt || ""}
                        label="Bild-Prompt kopieren"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-[#D9C4A8] bg-[#FFFCF7] p-6 text-center">
                <ImageIcon className="mx-auto h-10 w-10 text-[#B5282D]" />
                <h3 className="mt-3 text-lg font-black text-[#102A43]">
                  Noch kein Bild vorhanden
                </h3>
                <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-[#627D98]">
                  Öffne den Beitrag und erzeuge zuerst ein Social-Bild. Danach
                  erscheint es hier in der Posting-Vorbereitung und kann für
                  einen Ads-Kampagnenentwurf übernommen werden.
                </p>

                <Link
                  href={`/admin/social/${post.id}`}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
                >
                  Beitrag öffnen
                </Link>
              </div>
            )}
          </section>

          <aside className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-2xl font-black text-[#102A43]">
              Veröffentlichungs-Checkliste
            </h2>

            <div className="mt-5 space-y-3 text-sm font-bold leading-6 text-[#52616F]">
              <p>□ Hook geprüft</p>
              <p>□ Caption geprüft</p>
              <p>□ Hashtags geprüft</p>
              <p>□ Bild passt zur Botschaft</p>
              <p>□ Landingpage / Link geprüft</p>
              <p>□ Plattform ausgewählt</p>
              <p>□ Veröffentlichungszeit geprüft</p>
              <p>□ Beitrag nach Veröffentlichung markieren</p>
              <p>□ Optional: Ads-Kampagne vorbereiten</p>
            </div>

            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
              Diese Seite postet noch nicht automatisch. Sie ist die saubere
              Zwischenstufe für manuelle Veröffentlichung, spätere
              API-Anbindung und Ads-Vorbereitung.
            </div>
          </aside>
        </section>

        <PostingBlock
          title="TikTok"
          icon={<Video className="h-4 w-4" />}
          hook={tiktokHook}
          caption={tiktokCaption}
          cta={post.cta}
          hashtags={post.hashtags}
          platformNote="Für TikTok kurz, klar und hooklastig halten. Der erste Satz muss sofort funktionieren."
        />

        <PostingBlock
          title="Instagram"
          icon={<Camera className="h-4 w-4" />}
          hook={instagramHook}
          caption={instagramCaption}
          cta={post.cta}
          hashtags={post.hashtags}
          platformNote="Für Instagram eignen sich klare Reels-/Carousel-Texte mit emotionalem Einstieg und sauberem CTA."
        />

        <PostingBlock
          title="Facebook"
          icon={<Share2 className="h-4 w-4" />}
          hook={facebookHook}
          caption={facebookCaption}
          cta={post.cta}
          hashtags={post.hashtags}
          platformNote="Für Facebook darf die Erklärung etwas ausführlicher und vertrauensbildender sein."
        />

        <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-4 flex items-center gap-2">
            <Video className="h-5 w-5 text-[#B5282D]" />
            <h2 className="text-2xl font-black text-[#102A43]">
              Video-Prompt
            </h2>
          </div>

          <p className="whitespace-pre-line text-sm font-semibold leading-6 text-[#102A43]">
            {post.video_prompt || "—"}
          </p>

          <div className="mt-4">
            <AdminSocialCopyButton
              value={post.video_prompt || ""}
              label="Video-Prompt kopieren"
            />
          </div>
        </section>
      </div>
    </main>
  );
}