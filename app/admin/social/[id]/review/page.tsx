import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeEuro,
  Camera,
  CheckCircle2,
  FileText,
  Hash,
  ImageIcon,
  Megaphone,
  Share2,
  ShieldCheck,
  Video,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialReviewForm from "@/components/AdminSocialReviewForm";

export const dynamic = "force-dynamic";

type SocialPostRow = {
  id: string;
  created_at: string;
  updated_at: string;
  brand_project: string;
  status: string;
  review_status: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
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
};

type SocialAssetRow = {
  id: string;
  public_url: string | null;
  created_at: string;
};

type ReviewRow = {
  id: string;
  created_at: string;
  reviewer_name: string;
  reviewer_email: string | null;
  decision: string;
  hook_ok: boolean;
  caption_ok: boolean;
  image_ok: boolean;
  cta_ok: boolean;
  platform_fit_ok: boolean;
  no_false_claims_ok: boolean;
  ads_ready_ok: boolean;
  notes: string | null;
  required_changes: string | null;
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

function getReviewLabel(status: string | null) {
  switch (status) {
    case "approved":
      return "Freigegeben";
    case "needs_changes":
      return "Überarbeitung nötig";
    case "rejected":
      return "Abgelehnt";
    default:
      return "Noch nicht geprüft";
  }
}

function getReviewClasses(status: string | null) {
  switch (status) {
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "needs_changes":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "rejected":
      return "border-red-200 bg-red-50 text-red-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function DecisionLabel({ decision }: { decision: string }) {
  const classes =
    decision === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : decision === "rejected"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-amber-200 bg-amber-50 text-amber-800";

  const label =
    decision === "approved"
      ? "Freigegeben"
      : decision === "rejected"
        ? "Abgelehnt"
        : "Überarbeitung nötig";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${classes}`}>
      {label}
    </span>
  );
}

function ContentPreview({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.5rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#8A5A35]">
        {icon}
        {title}
      </div>

      <div className="whitespace-pre-line text-sm font-semibold leading-6 text-[#102A43]">
        {children}
      </div>
    </section>
  );
}

export default async function AdminSocialReviewPage({
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
    .select("id, public_url, created_at")
    .eq("post_id", id)
    .eq("asset_type", "image")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: reviewsData } = await supabaseServer
    .from("social_post_reviews")
    .select("*")
    .eq("post_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  const latestAsset = ((assetsData || []) as SocialAssetRow[])[0] || null;
  const reviews = (reviewsData || []) as ReviewRow[];
  const hashtags = normalizeHashtags(post.hashtags).join(" ");

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
                  href={`/admin/social/${post.id}/posting`}
                  className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-800 transition hover:bg-blue-100"
                >
                  <Share2 className="h-4 w-4" />
                  Posting vorbereiten
                </Link>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
                <ShieldCheck className="h-4 w-4" />
                Content-Review
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                {post.topic}
              </h1>

              <p className="mt-3 max-w-3xl text-base leading-7 text-[#486581]">
                Prüfe den Beitrag fachlich und inhaltlich, bevor er
                veröffentlicht oder als Anzeigenbasis verwendet wird.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${getReviewClasses(
                  post.review_status
                )}`}
              >
                {getReviewLabel(post.review_status)}
              </span>

              <div className="mt-4 space-y-2 text-sm font-semibold text-[#52616F]">
                <p>Geprüft am: {formatDateTime(post.reviewed_at)}</p>
                <p>Geprüft von: {post.reviewed_by_name || "—"}</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="space-y-5">
            <ContentPreview
              title="Hook"
              icon={<Megaphone className="h-4 w-4" />}
            >
              {post.hook || "—"}
            </ContentPreview>

            <ContentPreview
              title="Caption"
              icon={<FileText className="h-4 w-4" />}
            >
              {post.caption || "—"}
            </ContentPreview>

            <ContentPreview
              title="CTA"
              icon={<CheckCircle2 className="h-4 w-4" />}
            >
              {post.cta || "—"}
            </ContentPreview>

            <ContentPreview
              title="Hashtags"
              icon={<Hash className="h-4 w-4" />}
            >
              {hashtags || "—"}
            </ContentPreview>

            <div className="grid gap-5 lg:grid-cols-3">
              <ContentPreview
                title="TikTok"
                icon={<Video className="h-4 w-4" />}
              >
                {(post.tiktok_hook || post.hook || "—") +
                  "\n\n" +
                  (post.tiktok_caption || post.caption || "")}
              </ContentPreview>

              <ContentPreview
                title="Instagram"
                icon={<Camera className="h-4 w-4" />}
              >
                {(post.instagram_hook || post.hook || "—") +
                  "\n\n" +
                  (post.instagram_caption || post.caption || "")}
              </ContentPreview>

              <ContentPreview
                title="Facebook"
                icon={<Share2 className="h-4 w-4" />}
              >
                {(post.facebook_hook || post.hook || "—") +
                  "\n\n" +
                  (post.facebook_caption || post.caption || "")}
              </ContentPreview>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-[#B5282D]" />
                <h2 className="text-xl font-black text-[#102A43]">
                  Bildprüfung
                </h2>
              </div>

              {latestAsset?.public_url ? (
                <a
                  href={latestAsset.public_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-[1.5rem] bg-[#102A43]"
                >
                  <img
                    src={latestAsset.public_url}
                    alt="Social-Bild"
                    className="aspect-[2/3] w-full object-cover"
                  />
                </a>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-[#D9C4A8] bg-[#FFFCF7] p-6 text-center text-sm font-bold text-[#627D98]">
                  Noch kein Bild vorhanden.
                </div>
              )}

              <p className="mt-4 text-sm font-semibold leading-6 text-[#52616F]">
                Prüfe, ob das Bild wirklich zur Botschaft des Hooks passt und
                nicht wie generisches Stockmaterial wirkt.
              </p>
            </section>

            <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-amber-900">
                <BadgeEuro className="h-5 w-5" />
                <h2 className="text-xl font-black">Ads-Hinweis</h2>
              </div>

              <p className="text-sm font-bold leading-6 text-amber-900">
                Diese Review-Freigabe bedeutet nur, dass der Beitrag inhaltlich
                verwendbar ist. Werbebudget muss im Ads-Modul weiterhin separat
                freigegeben werden.
              </p>
            </section>
          </aside>
        </section>

        <AdminSocialReviewForm postId={post.id} hasImage={Boolean(latestAsset)} />

        {reviews.length > 0 ? (
          <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-2xl font-black text-[#102A43]">
              Review-Historie
            </h2>

            <div className="mt-5 space-y-4">
              {reviews.map((review) => (
                <article
                  key={review.id}
                  className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <DecisionLabel decision={review.decision} />

                    <span className="rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-black text-[#52616F]">
                      {formatDateTime(review.created_at)}
                    </span>

                    <span className="rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-black text-[#52616F]">
                      {review.reviewer_name}
                    </span>
                  </div>

                  <div className="grid gap-2 text-sm font-semibold text-[#52616F] sm:grid-cols-2 lg:grid-cols-4">
                    <p>Hook: {review.hook_ok ? "✅" : "❌"}</p>
                    <p>Caption: {review.caption_ok ? "✅" : "❌"}</p>
                    <p>Bild: {review.image_ok ? "✅" : "❌"}</p>
                    <p>CTA: {review.cta_ok ? "✅" : "❌"}</p>
                    <p>Plattform: {review.platform_fit_ok ? "✅" : "❌"}</p>
                    <p>Claims: {review.no_false_claims_ok ? "✅" : "❌"}</p>
                    <p>Ads-ready: {review.ads_ready_ok ? "✅" : "❌"}</p>
                  </div>

                  {review.notes ? (
                    <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-[#102A43]">
                      {review.notes}
                    </p>
                  ) : null}

                  {review.required_changes ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-900">
                      {review.required_changes}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}