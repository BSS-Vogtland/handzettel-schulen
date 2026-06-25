import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Lock,
  ShieldCheck,
  Video,
} from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialTikTokDraftUploadPanel from "@/components/AdminSocialTikTokDraftUploadPanel";
import AdminSocialTikTokVerticalVideoButton from "@/components/AdminSocialTikTokVerticalVideoButton";
import AdminSocialTikTokAssetStatus from "@/components/AdminSocialTikTokAssetStatus";

export const dynamic = "force-dynamic";

type SocialPostRow = {
  id: string;
  topic: string | null;
  hook: string | null;
  status: string | null;
  review_status: string | null;
};

type SocialAssetRow = {
  id: string;
  public_url: string | null;
  status: string | null;
  created_at: string | null;
};

function getReviewLabel(status: string | null) {
  switch (status) {
    case "approved":
      return "Review freigegeben";
    case "needs_changes":
      return "Überarbeitung nötig";
    case "rejected":
      return "Review abgelehnt";
    case "not_reviewed":
    case null:
    default:
      return "Review offen";
  }
}

function getReviewBadgeClasses(status: string | null) {
  switch (status) {
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "needs_changes":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "rejected":
      return "border-red-200 bg-red-50 text-red-900";
    case "not_reviewed":
    case null:
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export default async function AdminSocialTikTokDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: postData, error: postError } = await supabaseServer
    .from("social_posts")
    .select("id, topic, hook, status, review_status")
    .eq("id", id)
    .single();

  if (postError || !postData) {
    notFound();
  }

  const post = postData as SocialPostRow;

  const { data: videoAssetsData } = await supabaseServer
    .from("social_assets")
    .select("id, public_url, status, created_at")
    .eq("post_id", id)
    .eq("asset_type", "video")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(6);

  const videoAssets = (videoAssetsData || []) as SocialAssetRow[];
  const latestVideoAsset = videoAssets[0] || null;

  return (
    <main className="min-h-screen bg-[#FBF7F0] px-4 py-8 text-[#102A43] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-[2rem] border border-[#E7D8C3] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <div className="mb-4 flex flex-wrap gap-3">
                <Link
                  href={`/admin/social/${post.id}/posting`}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-sm font-black text-[#A23A2E] transition hover:bg-[#F5E8D8]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Zurück zur Posting-Seite
                </Link>

                <Link
                  href={`/admin/social/${post.id}`}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#D9E2EC] bg-white px-4 py-2 text-sm font-black text-[#486581] transition hover:bg-[#F8FAFC]"
                >
                  Zurück zum Beitrag
                </Link>

                <Link
                  href="/admin/social/tiktok-review"
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#D9E2EC] bg-white px-4 py-2 text-sm font-black text-[#486581] transition hover:bg-[#F8FAFC]"
                >
                  Review-Material öffnen
                </Link>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
                <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
                TikTok Review-Demo / Draft-Upload
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                {post.topic || post.hook || "TikTok Upload vorbereiten"}
              </h1>

              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#627D98]">
                Diese Seite ist der zentrale Nachweis für die TikTok-App-Review:
                TikTok-Video, Asset-Status, Audio-Erkennung, finaler TikTok-Text
                und Upload-Sperre sind hier sichtbar. Der echte Upload bleibt bis
                zur video.upload-Freigabe bewusst deaktiviert.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4 text-sm font-bold leading-6 text-[#102A43]">
              <p>Status: {post.status || "—"}</p>
              <p>
                Review:{" "}
                <span
                  className={`ml-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-black ${getReviewBadgeClasses(
                    post.review_status
                  )}`}
                >
                  {getReviewLabel(post.review_status)}
                </span>
              </p>
              <p>Videos: {videoAssets.length}</p>
            </div>
          </div>
        </header>

        <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-amber-900">
                <Lock className="h-4 w-4" />
                Sicherheitsmodus aktiv
              </div>

              <h2 className="mt-4 text-2xl font-black text-[#102A43]">
                V2J.1B · TikTok-Review-Demo ohne echten Upload
              </h2>

              <p className="mt-2 text-sm font-semibold leading-6 text-amber-950">
                Diese Seite darf TikTok im Review zeigen, dass der Upload-Flow
                vorbereitet ist. Sie darf aber keinen echten Upload auslösen,
                solange der Scope video.upload fehlt oder das Sicherheitsflag
                TIKTOK_ENABLE_DRAFT_UPLOAD nicht bewusst aktiviert wurde.
              </p>
            </div>

            <div className="grid gap-2 text-xs font-black leading-5 text-amber-950 sm:grid-cols-2 lg:min-w-[420px]">
              <div className="rounded-2xl border border-amber-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  TikTok-Seite vorhanden
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  9:16-Rendering vorbereitet
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  Asset-/Audio-Status sichtbar
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-amber-700" />
                  Upload bewusst gesperrt
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[#D9E2EC] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F8FAFC] text-[#102A43]">
              <ClipboardCheck className="h-5 w-5" />
            </div>

            <div>
              <h2 className="text-2xl font-black text-[#102A43]">
                Was in der TikTok-Review-Aufnahme gezeigt werden soll
              </h2>

              <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-[#627D98]">
                Aufnahme kurz halten und keine privaten Daten zeigen. Wichtig ist
                nicht ein Werbevideo, sondern der echte interne Admin-Workflow.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[#D9E2EC] bg-[#F8FAFC] p-4">
              <Video className="h-5 w-5 text-[#A23A2E]" />
              <h3 className="mt-3 text-sm font-black text-[#102A43]">
                TikTok-Video
              </h3>
              <p className="mt-1 text-xs font-bold leading-5 text-[#627D98]">
                9:16-MP4-Vorschau öffnen und zeigen.
              </p>
            </div>

            <div className="rounded-2xl border border-[#D9E2EC] bg-[#F8FAFC] p-4">
              <ShieldCheck className="h-5 w-5 text-[#A23A2E]" />
              <h3 className="mt-3 text-sm font-black text-[#102A43]">
                Asset-Status
              </h3>
              <p className="mt-1 text-xs font-bold leading-5 text-[#627D98]">
                Quelle, Audio/Musik und aktuelle TikTok-Version zeigen.
              </p>
            </div>

            <div className="rounded-2xl border border-[#D9E2EC] bg-[#F8FAFC] p-4">
              <ClipboardCheck className="h-5 w-5 text-[#A23A2E]" />
              <h3 className="mt-3 text-sm font-black text-[#102A43]">
                Finaler Text
              </h3>
              <p className="mt-1 text-xs font-bold leading-5 text-[#627D98]">
                Caption anzeigen, aber keine privaten Kundendaten.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <Lock className="h-5 w-5 text-amber-700" />
              <h3 className="mt-3 text-sm font-black text-amber-950">
                Sperrgrund
              </h3>
              <p className="mt-1 text-xs font-bold leading-5 text-amber-900">
                Upload bleibt blockiert, bis Scope und ENV-Flag aktiv sind.
              </p>
            </div>
          </div>
        </section>

        <AdminSocialTikTokVerticalVideoButton postId={post.id} />

        <AdminSocialTikTokAssetStatus postId={post.id} />

        <AdminSocialTikTokDraftUploadPanel
          postId={post.id}
          initialVideoAssetId={latestVideoAsset?.id || null}
        />
      </div>
    </main>
  );
}

