// Deno + Supabase Edge Function (namespaced: design_context)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0?target=deno";

type BgMode = 'light' | 'dark' | 'auto' | null;
type Density = 'airy' | 'comfortable' | 'compact' | null;
type Radius = 'sharp' | 'soft' | 'rounded' | null;
type Shadow = 'none' | 'subtle' | 'strong' | null;
type Casing = 'sentence' | 'title' | 'all_caps' | null;

interface ColorWithWeight { hex: string; weight?: number }
interface DesignSummary {
  user_id: string;
  screen_count: number;
  primary_colors: ColorWithWeight[];
  accent_colors: ColorWithWeight[];
  bg_mode: BgMode;
  type_family: string | null;
  type_scale: number[];
  density: Density;
  radius: Radius;
  shadow: Shadow;
  casing: Casing;
  copy_tone: string | null;
  a11y_min_contrast: number | null;
  patterns: string[];
  components: string[];
  icon_style: string | null;
  illustration_style: string | null;
  notes: string | null;
  detail_scores: Record<string, number>;
  context_pct?: number;
  updated_at?: string;
}

function buildDesignContract(summary: DesignSummary): string {
  const parts: string[] = [];
  if (summary.bg_mode) parts.push(`${summary.bg_mode} UI`);
  const primary = summary.primary_colors?.[0]?.hex;
  const accent = summary.accent_colors?.[0]?.hex;
  if (primary && accent) parts.push(`primary ${primary} + accent ${accent}`);
  else if (primary) parts.push(`primary ${primary}`);
  if (summary.density) parts.push(`${summary.density} density`);
  if (summary.radius) parts.push(`${summary.radius} radii`);
  if (summary.shadow) parts.push(`${summary.shadow} elevation`);
  if (summary.type_family) {
    const scale = summary.type_scale?.length ? ` ${summary.type_scale.join('/')}` : '';
    parts.push(`${summary.type_family}${scale}`);
  }
  if (summary.casing) parts.push(`${summary.casing} case`);
  const patterns = summary.patterns?.length ? `patterns: ${summary.patterns.join(', ')}` : '';
  if (patterns) parts.push(patterns);
  if (summary.a11y_min_contrast) parts.push(`min contrast ${summary.a11y_min_contrast}:1`);
  if (summary.copy_tone) parts.push(`tone ${summary.copy_tone}`);
  return parts.join('; ') + '.';
}

type AnalyzeInput = { user_id: string; asset_ids: string[] };
async function analyzeAssets(input: AnalyzeInput): Promise<DesignSummary> {
  const screenCount = input.asset_ids?.length || 0;
  const detailScores: Record<string, number> = {
    screen_count: screenCount > 0 ? 1.0 : 0.0,
    primary_colors: 0.0,
    accent_colors: 0.0,
    bg_mode: 0.5,
    type: 0.0,
    density: 0.5,
    radius: 0.5,
    shadow: 0.5,
    casing: 0.5,
    copy_tone: 0.0,
    a11y_min_contrast: 0.0,
    patterns: 0.0,
    components: 0.0,
    icon_style: 0.0,
    illustration_style: 0.0,
    notes: 0.5,
  };
  return {
    user_id: input.user_id,
    screen_count: screenCount,
    primary_colors: [],
    accent_colors: [],
    bg_mode: 'light',
    type_family: null,
    type_scale: [],
    density: 'comfortable',
    radius: 'soft',
    shadow: 'subtle',
    casing: 'sentence',
    copy_tone: null,
    a11y_min_contrast: null,
    patterns: [],
    components: [],
    icon_style: null,
    illustration_style: null,
    notes: 'Initial pass from limited signals; refine by adding more screens.',
    detail_scores: detailScores,
  };
}

// Optional: call Gemini (Google) for better heuristics later using GOOGLE_API_KEY

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function upsertDesignSummary(summary: DesignSummary) {
  const { data, error } = await supabase
    .from('design_context.user_design_style')
    .upsert(summary, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data as DesignSummary;
}

async function getDesignSummary(user_id: string) {
  const { data, error } = await supabase
    .from('design_context.user_design_style')
    .select('*')
    .eq('user_id', user_id)
    .maybeSingle();
  if (error) throw error;
  return data as DesignSummary | null;
}

const corsHeaders: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
}

serve(async (req) => {
  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/*$/, '');
    // Normalize to allow both '/upload' and '/design_context/upload'
    const normalized = path.replace(/^\/?design_context\b/, '') || '/';

    if (req.method === 'GET' && (normalized.endsWith('/get') || path.endsWith('/design_context/get'))) {
      const user_id = url.searchParams.get('user_id');
      if (!user_id) return jsonResponse({ error: 'user_id required' }, 400);
      const row = await getDesignSummary(user_id);
      return jsonResponse({ ok: true, data: row });
    }

    if (req.method === 'POST' && (normalized.endsWith('/upload') || path.endsWith('/design_context/upload'))) {
      // Optional helper: echo back asset_ids; storage handled elsewhere
      const payload = await req.json().catch(() => ({}));
      const asset_ids = Array.isArray(payload.asset_ids) ? payload.asset_ids : [];
      console.log('telemetry: upload_started', { count: asset_ids.length });
      console.log('telemetry: upload_completed', { count: asset_ids.length });
      return jsonResponse({ ok: true, asset_ids });
    }

    if (req.method === 'POST' && (normalized.endsWith('/analyze') || normalized.endsWith('/replace') || path.endsWith('/design_context/analyze') || path.endsWith('/design_context/replace'))) {
      const payload = await req.json();
      const { user_id, asset_ids } = payload || {};
      if (!user_id || !Array.isArray(asset_ids)) return jsonResponse({ error: 'user_id and asset_ids[] required' }, 400);

      console.log('telemetry: analyze_started', { user_id, count: asset_ids.length });
      const summary = await analyzeAssets({ user_id, asset_ids });
      const upserted = await upsertDesignSummary(summary);
      const contract = buildDesignContract(upserted);
      console.log('telemetry: analyze_success', { user_id, context_pct: upserted.context_pct });
      return jsonResponse({ ok: true, contract, context_pct: upserted.context_pct });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (e) {
    console.error('design_context error', e);
    return jsonResponse({ ok: false, error: String(e?.message || e) }, 500);
  }
});



