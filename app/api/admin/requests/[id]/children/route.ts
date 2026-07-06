import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function cleanText(value: unknown) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: requestId } = await context.params;
    const body = await request.json().catch(() => ({}));

    const childName = cleanText(body.childName);
    const schoolName = cleanText(body.schoolName);
    const className = cleanText(body.className);

    const { data: existingChildren, error: existingChildrenError } =
      await supabaseServer
        .from("school_request_children")
        .select("id")
        .eq("request_id", requestId);

    if (existingChildrenError) {
      throw new Error(existingChildrenError.message);
    }

    const nextSortOrder = (existingChildren || []).length + 1;
    const label = childName || `Kind ${nextSortOrder}`;

    const { data: child, error: insertError } = await supabaseServer
      .from("school_request_children")
      .insert({
        request_id: requestId,
        sort_order: nextSortOrder,
        label,
        child_name: childName,
        school_name: schoolName,
        class_name: className,
        source: "admin_manual",
      })
      .select("id, label, child_name, school_name, class_name, sort_order")
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    await supabaseServer.from("school_request_events").insert({
      request_id: requestId,
      event_type: "admin_request_child_created",
      title: "Kind hinzugefügt",
      description: `${label} wurde für diese Anfrage angelegt.`,
      message: `${label} wurde für diese Anfrage angelegt.`,
    });

    return NextResponse.json({
      ok: true,
      message: `${label} wurde angelegt.`,
      child,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Das Kind konnte nicht angelegt werden.",
      },
      { status: 500 }
    );
  }
}
