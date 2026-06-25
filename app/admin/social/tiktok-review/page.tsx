import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import AdminSocialTikTokReviewMaterial from "@/components/AdminSocialTikTokReviewMaterial";

export const dynamic = "force-dynamic";

export default function AdminSocialTikTokReviewPage() {
  return (
    <main className="min-h-screen bg-[#FBF7F0] px-4 py-8 text-[#102A43] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-[2rem] border border-[#E7D8C3] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link
                href="/admin/social"
                className="inline-flex items-center gap-2 rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-sm font-black text-[#A23A2E] transition hover:bg-[#F5E8D8]"
              >
                <ArrowLeft className="h-4 w-4" />
                Zurück zu SocialPilot
              </Link>

              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
                <ShieldCheck className="h-4 w-4 text-[#A23A2E]" />
                TikTok Review
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43] sm:text-4xl">
                TikTok Demo- und Review-Material
              </h1>

              <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-[#627D98]">
                Zentrale Sammelseite für TikTok-App-Review, Demo-Skript,
                Production-Felder und Recording-Checkliste. Aktuell ist Login Kit
                verbunden; video.upload wird erst nach vollständigem Demo-Flow
                eingereicht.
              </p>
            </div>
          </div>
        </header>

        <AdminSocialTikTokReviewMaterial />
      </div>
    </main>
  );
}
