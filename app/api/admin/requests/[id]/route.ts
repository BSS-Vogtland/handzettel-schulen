import { requireAdminApiSession } from "@/app/lib/adminApiAuth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const unauthorized = await requireAdminApiSession();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { ok: false, message: "Keine Anfrage-ID übergeben." },
        { status: 400 }
      );
    }

    const { data: files, error: filesError } = await supabaseServer
      .from("school_request_files")
      .select("storage_path")
      .eq("request_id", id);

    if (filesError) {
      console.error("Fehler beim Laden der Dateien:", filesError);

      return NextResponse.json(
        {
          ok: false,
          message: "Die Dateien zur Anfrage konnten nicht geladen werden.",
        },
        { status: 500 }
      );
    }

    const storagePaths =
      files
        ?.map((file) => file.storage_path)
        .filter((path): path is string => Boolean(path)) || [];

    if (storagePaths.length > 0) {
      const { error: storageError } = await supabaseServer.storage
        .from("school-request-files")
        .remove(storagePaths);

      if (storageError) {
        console.error("Fehler beim Löschen aus Storage:", storageError);

        return NextResponse.json(
          {
            ok: false,
            message:
              "Die Anfrage wurde noch nicht gelöscht, weil die Datei im Speicher nicht entfernt werden konnte.",
          },
          { status: 500 }
        );
      }
    }

    const { error: deleteError } = await supabaseServer
      .from("school_requests")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Fehler beim Löschen der Anfrage:", deleteError);

      return NextResponse.json(
        { ok: false, message: "Die Anfrage konnte nicht gelöscht werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Anfrage wurde gelöscht.",
    });
  } catch (error) {
    console.error("Unerwarteter Fehler beim Löschen:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Beim Löschen ist ein unerwarteter Fehler aufgetreten.",
      },
      { status: 500 }
    );
  }
}