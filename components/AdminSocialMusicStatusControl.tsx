"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Music, Save } from "lucide-react";

type MusicStatus = "none" | "manual_added" | "planned";

type AdminSocialMusicStatusControlProps = {
  assetId: string;
  currentStatus?: MusicStatus;
  currentNote?: string;
};

const MUSIC_STATUS_OPTIONS: {
  value: MusicStatus;
  label: string;
  description: string;
}[] = [
  {
    value: "none",
    label: "Keine Musik",
    description: "Video ist ohne Musik/Audio geplant.",
  },
  {
    value: "manual_added",
    label: "Musik manuell ergänzt",
    description: "Musik/Reel-Audio wurde oder wird direkt in der Plattform ergänzt.",
  },
  {
    value: "planned",
    label: "Musik später geplant",
    description: "Video ist vorbereitet, Musik wird später ergänzt.",
  },
];

export default function AdminSocialMusicStatusControl({
  assetId,
  currentStatus = "none",
  currentNote = "",
}: AdminSocialMusicStatusControlProps) {
  const router = useRouter();
  const [musicStatus, setMusicStatus] = useState<MusicStatus>(currentStatus);
  const [musicNote, setMusicNote] = useState(currentNote);
  const [isSaving, setIsSaving] = useState(false);

  async function saveMusicStatus(nextStatus?: MusicStatus) {
    const statusToSave = nextStatus || musicStatus;

    try {
      setIsSaving(true);

      const response = await fetch(
        `/api/admin/social/assets/${assetId}/music-status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            musicStatus: statusToSave,
            musicNote,
          }),
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message || "Musikstatus konnte nicht gespeichert werden."
        );
      }

      router.refresh();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Speichern des Musikstatus."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-5 rounded-[1.5rem] border border-[#E7D8C3] bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Music className="h-4 w-4 text-[#A23A2E]" />
        <p className="text-sm font-black text-[#102A43]">
          Musik / Audio-Status
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {MUSIC_STATUS_OPTIONS.map((option) => {
          const isActive = musicStatus === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setMusicStatus(option.value);
                void saveMusicStatus(option.value);
              }}
              disabled={isSaving}
              className={
                isActive
                  ? "rounded-2xl border border-[#102A43] bg-[#102A43] px-4 py-3 text-left text-white shadow-sm disabled:opacity-60"
                  : "rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-3 text-left text-[#102A43] hover:bg-[#F5E8D8] disabled:opacity-60"
              }
            >
              <span className="block text-sm font-black">{option.label}</span>
              <span className="mt-1 block text-xs font-bold leading-5 opacity-80">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
          Musik-/Audio-Notiz optional
        </span>

        <textarea
          value={musicNote}
          onChange={(event) => setMusicNote(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="z. B. Instagram Reel-Audio manuell ergänzen, ruhiger Sommer-Sound, Plattform-Musik später auswählen ..."
          className="mt-2 w-full rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-3 text-sm font-semibold text-[#102A43] outline-none focus:border-[#A23A2E]"
        />
      </label>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold leading-5 text-[#627D98]">
          Es wird aktuell keine Musikdatei eingebettet. Der Status dokumentiert
          nur die manuelle Musik-/Audio-Nachbearbeitung.
        </p>

        <button
          type="button"
          onClick={() => saveMusicStatus()}
          disabled={isSaving}
          className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-[#A23A2E] px-4 py-2 text-xs font-black text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Speichert ..." : "Notiz speichern"}
        </button>
      </div>
    </div>
  );
}
