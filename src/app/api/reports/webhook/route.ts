// app/api/reports/webhook/route.ts
// Endpoint que n8n llama cuando termina el análisis.
// Valida el secret, actualiza el reporte en Supabase.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET!;

// Usamos service role para poder actualizar sin auth de usuario
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // --- Validar el secret ---
    const secret = req.headers.get("X-Webhook-Secret");
    if (secret !== N8N_WEBHOOK_SECRET) {
      console.warn("Webhook: secret inválido");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { report_id, status, ai_analysis } = body;

    if (!report_id || !status) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: report_id, status" },
        { status: 400 }
      );
    }

    // --- Actualizar el reporte ---
    const updateData: Record<string, unknown> = {
      status, // "completed" o "failed"
      updated_at: new Date().toISOString(),
    };

    if (status === "completed" && ai_analysis) {
      updateData.ai_analysis = ai_analysis;
      updateData.completed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabaseAdmin
      .from("reports")
      .update(updateData)
      .eq("id", report_id);

    if (updateError) {
      console.error("Error actualizando reporte:", updateError);
      return NextResponse.json(
        { error: "Error al actualizar el reporte" },
        { status: 500 }
      );
    }

    console.log(`Reporte ${report_id} actualizado a: ${status}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en webhook callback:", error);
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
