import Link from "next/link";
import { ArrowLeft, Music } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import AdminSocialMusicUploadForm from "@/components/AdminSocialMusicUploadForm";

export const dynamic = "force-dynamic";

type SocialMusicTrackRow = {
  id: string;
  title: string;
  public_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  bpm: number | null;
  mood_tags: string[] | null;
  template_keys: string[] | null;
  license_type: string | null;
  license_source: string | null;
  license_note: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  created_at: string;
};

function formatFileSize(value: number | null) {
  if (!value) return "-";

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default async function AdminSocialMusicPage() {
  const { data, error } = await supabaseServer
    .from("social_music_library")
    .select(
      "id, title, public_url, mime_type, file_size, duration_seconds, bpm, mood_tags, template_keys, license_type, license_source, license_note, is_active, sort_order, created_at"
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100);

  const tracks = (data || []) as SocialMusicTrackRow[];

  return (
    <main className="min-h-screen bg-[#FBF7F0] text-[#102A43]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin/social"
              className="inline-flex items-center gap-2 text-sm font-black text-[#A23A2E] hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück zum SocialPilot
            </Link>

            <h1 className="mt-4 text-3xl font-black text-[#102A43]">
              SocialPilot Musikbibliothek
            </h1>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#627D98]">
              Hier werden lizenzfreie Musikdateien zentral gespeichert, damit Videos später manuell oder automatisch passend zur Template-Version vertont werden können.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-white px-4 py-2 text-sm font-black text-[#102A43]">
            <Music className="h-4 w-4 text-[#A23A2E]" />
            {tracks.length} Tracks
          </div>
        </div>

        <AdminSocialMusicUploadForm />

        <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-2xl font-black text-[#102A43]">
            Importierte Musik
          </h2>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">
              {error.message}
            </div>
          ) : null}

          {tracks.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-[#E7D8C3] bg-[#FFFCF7] p-6 text-sm font-bold text-[#627D98]">
              Noch keine Musik importiert.
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {tracks.map((track) => (
                <article
                  key={track.id}
                  className="rounded-[1.5rem] border border-[#E7D8C3] bg-[#FFFCF7] p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-black text-[#102A43]">
                        {track.title}
                      </h3>

                      <p className="mt-1 text-xs font-semibold text-[#627D98]">
                        {track.mime_type || "Audio"} · {formatFileSize(track.file_size)}
                        {track.duration_seconds ? ` · ${track.duration_seconds}s` : ""}
                        {track.bpm ? ` · ${track.bpm} BPM` : ""}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {(track.template_keys || []).map((tag) => (
                          <span
                            key={`template-${tag}`}
                            className="rounded-full bg-[#102A43] px-3 py-1 text-xs font-black text-white"
                          >
                            {tag}
                          </span>
                        ))}

                        {(track.mood_tags || []).map((tag) => (
                          <span
                            key={`mood-${tag}`}
                            className="rounded-full border border-[#E7D8C3] bg-white px-3 py-1 text-xs font-black text-[#486581]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      {track.license_note ? (
                        <p className="mt-3 text-xs font-semibold leading-5 text-[#627D98]">
                          {track.license_note}
                        </p>
                      ) : null}
                    </div>

                    {track.public_url ? (
                      <audio
                        src={track.public_url}
                        controls
                        className="w-full lg:w-80"
                      />
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
