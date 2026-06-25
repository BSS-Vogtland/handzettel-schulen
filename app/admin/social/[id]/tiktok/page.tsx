import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
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
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
                <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
                TikTok Draft-Upload
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                {post.topic || post.hook || "TikTok Upload vorbereiten"}
              </h1>

              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#627D98]">
                Diese Seite bereitet den TikTok-Draft-Upload für den Beitrag vor.
                Der echte Upload bleibt bis zur video.upload-Freigabe gesperrt.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] p-4 text-sm font-bold leading-6 text-[#102A43]">
              <p>Status: {post.status || "—"}</p>
              <p>Review: {getReviewLabel(post.review_status)}</p>
              <p>Videos: {videoAssets.length}</p>
            </div>
          </div>
        </header>

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
