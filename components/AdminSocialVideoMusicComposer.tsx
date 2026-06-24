"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Music, Wand2 } from "lucide-react";

type SocialMusicTrack = {
  id: string;
  title: string;
  public_url: string | null;
  duration_seconds: number | null;
  mood_tags: string[] | null;
  template_keys: string[] | null;
  license_type: string | null;
  license_note: string | null;
};

type AdminSocialVideoMusicComposerProps = {
  postId: string;
  sourceVideoAssetId: string;
  tracks: SocialMusicTrack[];
  templateKey?: string | null;
};

export default function AdminSocialVideoMusicComposer({
  postId,
  sourceVideoAssetId,
  tracks,
  templateKey,
}: AdminSocialVideoMusicComposerProps) {
  const router = useRouter();
  const [selectedTrackId, setSelectedTrackId] = useState(tracks[0]?.id || "");
  const [volume, setVolume] = useState(0.35);
  const [isGenerating, setIsGenerating] = useState(false);

  const sortedTracks = useMemo(() => {
    if (!templateKey) return tracks;

    return [...tracks].sort((a, b) => {
      const aMatch = (a.template_keys || []).includes(templateKey);
      const bMatch = (b.template_keys || []).includes(templateKey);

      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;

      return a.title.localeCompare(b.title, "de");
    });
  }, [templateKey, tracks]);

  const selectedTrack =
    sortedTracks.find((track) => track.id === selectedTrackId) || null;

  async function generateVideoWithMusic() {
    if (!selectedTrackId) {
      alert("Bitte zuerst einen Musiktitel auswählen.");
      return;
    }

    const confirmed = window.confirm(
      "Video wirklich mit diesem Musiktitel neu erzeugen?\n\nEs entsteht ein neues MP4-Video mit eingebetteter Audiospur."
    );

    if (!confirmed) return;

    try {
      setIsGenerating(true);

      const response = await fetch(
        `/api/admin/social/${postId}/generate-video-with-music`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sourceVideoAssetId,
            musicTrackId: selectedTrackId,
            volume,
          }),
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message || "Video mit Musik konnte nicht erzeugt werden."
        );
      }

      alert(result.message || "Video mit Musik wurde erzeugt.");
      router.refresh();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Erzeugen des Videos mit Musik."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="mt-5 rounded-[1.5rem] border border-[#E7D8C3] bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Music className="h-4 w-4 text-[#A23A2E]" />
        <p className="text-sm font-black text-[#102A43]">
          Video mit Musik erzeugen
        </p>
      </div>

      {tracks.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
          Noch keine Musik in der Musikbibliothek vorhanden. Importiere zuerst
          lizenzfreie Musik unter /admin/social/music.
        </div>
      ) : (
        <>
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
              Musiktitel
            </span>

            <select
              value={selectedTrackId}
              onChange={(event) => setSelectedTrackId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-3 text-sm font-black text-[#102A43] outline-none focus:border-[#A23A2E]"
            >
              {sortedTracks.map((track) => {
                const matchesTemplate =
                  templateKey &&
                  (track.template_keys || []).includes(templateKey);

                return (
                  <option key={track.id} value={track.id}>
                    {matchesTemplate ? "★ " : ""}
                    {track.title}
                    {track.duration_seconds ? ` · ${track.duration_seconds}s` : ""}
                  </option>
                );
              })}
            </select>
          </label>

          {selectedTrack?.public_url ? (
            <audio
              src={selectedTrack.public_url}
              controls
              className="mt-4 w-full"
            />
          ) : null}

          {selectedTrack ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {(selectedTrack.template_keys || []).map((tag) => (
                <span
                  key={`template-${tag}`}
                  className="rounded-full bg-[#102A43] px-3 py-1 text-xs font-black text-white"
                >
                  {tag}
                </span>
              ))}

              {(selectedTrack.mood_tags || []).map((tag) => (
                <span
                  key={`mood-${tag}`}
                  className="rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-3 py-1 text-xs font-black text-[#486581]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <label className="mt-4 block">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
              Musiklautstärke: {Math.round(volume * 100)} %
            </span>

            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="mt-2 w-full"
            />
          </label>

          <button
            type="button"
            onClick={generateVideoWithMusic}
            disabled={isGenerating || !selectedTrackId}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#102A43] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Wand2 className="h-4 w-4" />
            {isGenerating
              ? "Erzeuge MP4 mit Musik ..."
              : "MP4 mit Musik erzeugen"}
          </button>

          <p className="mt-3 text-xs font-semibold leading-5 text-[#627D98]">
            Das erzeugt ein neues Video-Asset mit eingebetteter Musikspur.
            Später kann diese Auswahl automatisch nach Template-Key erfolgen.
          </p>
        </>
      )}
    </div>
  );
}
