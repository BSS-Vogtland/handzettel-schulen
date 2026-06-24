import Link from "next/link";
import { Music, Upload } from "lucide-react";

export default function AdminSocialMusicLibraryShortcut() {
  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#8A5A35]">
            <Music className="h-4 w-4 text-[#A23A2E]" />
            Musik / Audio
          </div>

          <h2 className="mt-4 text-2xl font-black text-[#102A43]">
            SocialPilot Musikbibliothek
          </h2>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#627D98]">
            Lizenzfreie Musik hochladen, mit Template-Keys versehen und später für Social-Videos verwenden.
          </p>
        </div>

        <Link
          href="/admin/social/music"
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110"
        >
          <Upload className="h-4 w-4" />
          Musikbibliothek öffnen
        </Link>
      </div>
    </section>
  );
}
