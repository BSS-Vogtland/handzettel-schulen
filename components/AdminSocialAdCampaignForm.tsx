"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone, Save } from "lucide-react";

type SocialPostOption = {
  id: string;
  topic: string;
  hook: string;
};

type SocialAssetOption = {
  id: string;
  post_id: string;
  public_url: string | null;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
};

type FormState = {
  campaign_name: string;
  platform: string;
  objective: string;
  post_id: string;
  asset_id: string;
  ad_headline: string;
  ad_text: string;
  landing_page_url: string;
  target_location: string;
  target_audience_description: string;
  placements_text: string;
  daily_budget_eur: string;
  lifetime_budget_eur: string;
  start_at: string;
  end_at: string;
  notes: string;
};

export default function AdminSocialAdCampaignForm({
  posts,
  assets,
}: {
  posts: SocialPostOption[];
  assets: SocialAssetOption[];
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState<FormState>({
    campaign_name: "",
    platform: "meta",
    objective: "traffic",
    post_id: "",
    asset_id: "",
    ad_headline: "",
    ad_text: "",
    landing_page_url: "",
    target_location: "",
    target_audience_description: "",
    placements_text: "Facebook\nInstagram",
    daily_budget_eur: "10",
    lifetime_budget_eur: "70",
    start_at: "",
    end_at: "",
    notes: "",
  });

  const selectedPost = posts.find((post) => post.id === form.post_id);
  const availableAssets = assets.filter((asset) =>
    form.post_id ? asset.post_id === form.post_id : true
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function splitList(value: string) {
    return value
      .split(/[\n,]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function handleSubmit() {
    if (isSaving) return;

    if (!form.campaign_name.trim()) {
      window.alert("Bitte gib einen Kampagnennamen ein.");
      return;
    }

    if (!form.daily_budget_eur.trim() && !form.lifetime_budget_eur.trim()) {
      window.alert("Bitte gib mindestens ein Tagesbudget oder Gesamtbudget ein.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/social/ads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaign_name: form.campaign_name,
          platform: form.platform,
          objective: form.objective,
          post_id: form.post_id || null,
          asset_id: form.asset_id || null,
          ad_headline: form.ad_headline,
          ad_text: form.ad_text,
          landing_page_url: form.landing_page_url,
          target_location: form.target_location,
          target_audience_description: form.target_audience_description,
          placements: splitList(form.placements_text),
          daily_budget_eur: form.daily_budget_eur,
          lifetime_budget_eur: form.lifetime_budget_eur,
          start_at: form.start_at || null,
          end_at: form.end_at || null,
          notes: form.notes,
        }),
      });

      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        window.alert(json.message || "Kampagne konnte nicht erstellt werden.");
        return;
      }

      window.alert(json.message || "Kampagne wurde erstellt.");
      router.refresh();

      setForm((current) => ({
        ...current,
        campaign_name: "",
        ad_headline: "",
        ad_text: "",
        notes: "",
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Erstellen der Kampagne.";

      window.alert(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-[#E7D8C3] bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#E7D8C3] bg-[#FFFCF7] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8A5A35]">
          <Megaphone className="h-4 w-4" />
          Neue Ads-Kampagne
        </div>

        <h2 className="mt-4 text-2xl font-black text-[#102A43]">
          Kampagnenentwurf erstellen
        </h2>

        <p className="mt-2 text-sm font-semibold leading-6 text-[#52616F]">
          Hier wird noch keine echte Werbung geschaltet. Es entsteht nur ein
          interner Entwurf mit Budget, Zielgruppe, Laufzeit und Freigabeprozess.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Kampagnenname
          </label>
          <input
            value={form.campaign_name}
            onChange={(event) =>
              updateField("campaign_name", event.target.value)
            }
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="z. B. Schulstart Upload-Kampagne"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Plattform
          </label>
          <select
            value={form.platform}
            onChange={(event) => updateField("platform", event.target.value)}
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-black outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          >
            <option value="meta">Meta: Facebook / Instagram</option>
            <option value="google">Google Ads</option>
            <option value="tiktok">TikTok Ads</option>
            <option value="manual">Manuelle Kampagne</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Ziel
          </label>
          <select
            value={form.objective}
            onChange={(event) => updateField("objective", event.target.value)}
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-black outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          >
            <option value="traffic">Website-Besuche</option>
            <option value="leads">Leads / Anfragen</option>
            <option value="messages">Nachrichten</option>
            <option value="reach">Reichweite</option>
            <option value="awareness">Bekanntheit</option>
            <option value="conversions">Conversions</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Beitrag
          </label>
          <select
            value={form.post_id}
            onChange={(event) => {
              updateField("post_id", event.target.value);
              updateField("asset_id", "");
            }}
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-black outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          >
            <option value="">Kein Beitrag ausgewählt</option>
            {posts.map((post) => (
              <option key={post.id} value={post.id}>
                {post.topic}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Bild
          </label>
          <select
            value={form.asset_id}
            onChange={(event) => updateField("asset_id", event.target.value)}
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-black outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          >
            <option value="">Kein Bild ausgewählt</option>
            {availableAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                Bild {asset.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Landingpage
          </label>
          <input
            value={form.landing_page_url}
            onChange={(event) =>
              updateField("landing_page_url", event.target.value)
            }
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="https://www..."
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Anzeigenheadline
          </label>
          <input
            value={form.ad_headline}
            onChange={(event) => updateField("ad_headline", event.target.value)}
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder={selectedPost?.hook || "Headline der Anzeige"}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Zielregion
          </label>
          <input
            value={form.target_location}
            onChange={(event) =>
              updateField("target_location", event.target.value)
            }
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="z. B. 25 km um Plauen"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Tagesbudget in €
          </label>
          <input
            value={form.daily_budget_eur}
            onChange={(event) =>
              updateField("daily_budget_eur", event.target.value)
            }
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="10"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Gesamtbudget in €
          </label>
          <input
            value={form.lifetime_budget_eur}
            onChange={(event) =>
              updateField("lifetime_budget_eur", event.target.value)
            }
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="70"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Start
          </label>
          <input
            type="datetime-local"
            value={form.start_at}
            onChange={(event) => updateField("start_at", event.target.value)}
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Ende
          </label>
          <input
            type="datetime-local"
            value={form.end_at}
            onChange={(event) => updateField("end_at", event.target.value)}
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-semibold outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
          />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Zielgruppe
          </label>
          <textarea
            value={form.target_audience_description}
            onChange={(event) =>
              updateField("target_audience_description", event.target.value)
            }
            rows={5}
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-semibold leading-6 outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="z. B. Eltern 25–45, Schulstart, regionale Familien ..."
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Anzeigentext
          </label>
          <textarea
            value={form.ad_text}
            onChange={(event) => updateField("ad_text", event.target.value)}
            rows={5}
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-semibold leading-6 outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder={selectedPost?.hook || "Text der Anzeige"}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Platzierungen
          </label>
          <textarea
            value={form.placements_text}
            onChange={(event) =>
              updateField("placements_text", event.target.value)
            }
            rows={4}
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-semibold leading-6 outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder={"Facebook\nInstagram\nReels"}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-black text-[#102A43]">
            Interne Notiz
          </label>
          <textarea
            value={form.notes}
            onChange={(event) => updateField("notes", event.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-[#E7D8C3] px-4 py-3 text-sm font-semibold leading-6 outline-none focus:border-[#B5282D] focus:ring-4 focus:ring-[#B5282D]/10"
            placeholder="Hinweise, Ziel, Strategie, Besonderheiten ..."
          />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
        Hinweis: Dieser Entwurf gibt noch kein Werbebudget aus. Erst eine
        separate Freigabe bestätigt später das Budget.
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSaving}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {isSaving ? "Speichern ..." : "Kampagnenentwurf speichern"}
      </button>
    </section>
  );
}