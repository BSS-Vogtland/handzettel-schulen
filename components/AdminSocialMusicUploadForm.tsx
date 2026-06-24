"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Music, Upload } from "lucide-react";

export default function AdminSocialMusicUploadForm() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      setIsUploading(true);

      const response = await fetch("/api/admin/social/music/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "Musik konnte nicht hochgeladen werden.");
      }

      form.reset();
      router.refresh();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Musik-Upload."
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7"
    >
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#102A43] text-white">
          <Music className="h-5 w-5" />
        </div>

        <div>
          <h2 className="text-2xl font-black text-[#102A43]">
            Musik importieren
          </h2>
          <p className="mt-1 text-sm font-semibold text-[#627D98]">
            Lizenzfreie Musik zentral speichern und später für Social-Videos verwenden.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
            Audiodatei
          </span>
          <input
            required
            name="file"
            type="file"
            accept="audio/*"
            className="mt-2 w-full rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-3 text-sm font-bold text-[#102A43]"
          />
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
            Titel
          </span>
          <input
            name="title"
            type="text"
            placeholder="z. B. Sommer Akustik Chill"
            className="mt-2 w-full rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-3 text-sm font-bold text-[#102A43] outline-none focus:border-[#A23A2E]"
          />
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
            Dauer in Sekunden optional
          </span>
          <input
            name="durationSeconds"
            type="number"
            min="1"
            placeholder="z. B. 60"
            className="mt-2 w-full rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-3 text-sm font-bold text-[#102A43] outline-none focus:border-[#A23A2E]"
          />
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
            Stimmung / Tags
          </span>
          <input
            name="moodTags"
            type="text"
            placeholder="summer, family, warm, chill"
            className="mt-2 w-full rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-3 text-sm font-bold text-[#102A43] outline-none focus:border-[#A23A2E]"
          />
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
            Template-Keys
          </span>
          <input
            name="templateKeys"
            type="text"
            placeholder="sommer-familienzeit, erleichtert-loesung"
            className="mt-2 w-full rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-3 text-sm font-bold text-[#102A43] outline-none focus:border-[#A23A2E]"
          />
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
            Lizenztyp
          </span>
          <input
            name="licenseType"
            type="text"
            defaultValue="lizenzfrei"
            className="mt-2 w-full rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-3 text-sm font-bold text-[#102A43] outline-none focus:border-[#A23A2E]"
          />
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
            Lizenzquelle optional
          </span>
          <input
            name="licenseSource"
            type="text"
            placeholder="Quelle / Anbieter / Ordner"
            className="mt-2 w-full rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-3 text-sm font-bold text-[#102A43] outline-none focus:border-[#A23A2E]"
          />
        </label>

        <label className="block md:col-span-2">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-[#8A5A35]">
            Lizenznotiz optional
          </span>
          <textarea
            name="licenseNote"
            rows={3}
            placeholder="z. B. kommerzielle Nutzung erlaubt, Quelle lokal dokumentiert ..."
            className="mt-2 w-full rounded-2xl border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-3 text-sm font-bold text-[#102A43] outline-none focus:border-[#A23A2E]"
          />
        </label>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={isUploading}
          className="inline-flex items-center gap-2 rounded-2xl bg-[#A23A2E] px-5 py-3 text-sm font-black text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          {isUploading ? "Lädt hoch ..." : "Musik importieren"}
        </button>
      </div>
    </form>
  );
}
