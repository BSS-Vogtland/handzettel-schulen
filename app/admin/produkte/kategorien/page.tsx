import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import AdminProductCategoryManager, {
  type AdminProductCategoryRow,
} from "@/components/AdminProductCategoryManager";
import {
  loadProductCategoryOptions,
  loadProductCategoryUsageCounts,
  type ProductCategoryOptionRecord,
} from "@/lib/productCategoryDatabase";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Umgebungsvariablen fehlen. Pruefe NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export default async function AdminProductCategoriesPage() {
  const supabase = getSupabaseAdmin();

  const [categories, usageCounts] = await Promise.all([
    loadProductCategoryOptions(supabase, { activeOnly: false }),
    loadProductCategoryUsageCounts(supabase),
  ]);

  const rows: AdminProductCategoryRow[] = categories.map(
    (category: ProductCategoryOptionRecord) => ({
    id: category.id,
    value: category.value,
    label: category.label,
    keywords: category.keywords,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    productCount: usageCounts.get(category.label) || 0,
    source: category.source,
  })
  );

  return (
    <main className="min-h-screen bg-[#F7F1E8] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href="/admin/produkte"
              className="inline-flex rounded-full border border-[#D8C8B8] bg-white px-4 py-2 text-sm font-black text-[#102A43] transition hover:border-[#B5282D]"
            >
              Zurueck zur Produktverwaltung
            </Link>

            <h1 className="mt-4 text-3xl font-black tracking-tight text-[#102A43]">
              Produktkategorien verwalten
            </h1>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#52616F]">
              Fuege Kategorien hinzu, bearbeite Keywords oder loesche Kategorien.
              Wenn eine Kategorie noch Produkte nutzt, muessen diese beim Loeschen
              auf eine Zielkategorie umgezogen werden.
            </p>
          </div>

          <Link
            href="/admin/produkte/tabelle"
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#2F7D50] px-5 text-sm font-black text-white shadow-sm transition hover:brightness-110"
          >
            Produktdaten-Tabelle oeffnen
          </Link>
        </div>

        <AdminProductCategoryManager initialCategories={rows} />
      </div>
    </main>
  );
}
