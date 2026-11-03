// Edge Function `chup-chat` — nhận ảnh chụp màn hình đoạn chat từ Phím tắt iPhone,
// lưu ảnh, chép NGUYÊN VĂN nội dung ảnh (chưa tạo đơn).
//
// POST  (body = ảnh, hoặc multipart: anh, chu_ios?, thiet_bi?)  → chép ảnh, trả tóm tắt
// GET   ?limit=20&before=<id>                                  → danh sách
// GET   ?id=<id>                                               → 1 ảnh + link ảnh 1 giờ
// PATCH {id, status?, note?, label_json?}                      → đánh dấu / sửa tay
//
// Header bắt buộc: x-capture-key = secret CAPTURE_KEY. Tắt "Verify JWT" cho function này.
// Secret cần có: CAPTURE_KEY, GEMINI_API_KEY. Tuỳ chọn: GEMINI_MODELS="m1,m2".

import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const BUCKET = "chat-captures";
const MAX_BYTES = 8 * 1024 * 1024;
const MODELS = (Deno.env.get("GEMINI_MODELS") ?? "gemini-3.5-flash,gemini-3.5-flash-lite")
  .split(",").map((s) => s.trim()).filter(Boolean);

const THINKING = Deno.env.get("GEMINI_THINKING") ?? "minimal"; // "" = để model tự quyết

// Trả lời Phím tắt ngay rồi chép ở nền (EdgeRuntime.waitUntil của Supabase).
// deno-lint-ignore no-explicit-any
const RT = (globalThis as any).EdgeRuntime as { waitUntil?: (p: Promise<unknown>) => void } | undefined;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-capture-key, x-device, x-wait, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

export const PROMPT = `Bạn là bộ chép lại màn hình (OCR). Ảnh là ảnh chụp màn hình điện thoại, thường là đoạn chat Messenger hoặc Zalo bằng tiếng Việt.

NHIỆM VỤ: chép lại ĐẦY ĐỦ và NGUYÊN VĂN mọi thứ nhìn thấy, theo thứ tự từ trên xuống dưới.
- KHÔNG tóm tắt, KHÔNG sửa chính tả, KHÔNG viết đầy đủ chữ viết tắt (giữ nguyên "ko", "đc", "tx", "2 cđ"...).
- KHÔNG suy luận thành đơn hàng, KHÔNG thêm chữ không có trong ảnh, KHÔNG đoán phần bị che.
- Giữ nguyên dấu tiếng Việt, số, ký hiệu, emoji. Xuống dòng trong cùng một bong bóng ghi bằng \\n.

Trả về JSON đúng mẫu sau:
{
  "ung_dung": "messenger" | "zalo" | "khac",
  "thanh_tren": { "ten_hien_thi": string | null, "phu": string | null },
  "muc": [
    {
      "loai": "tin_nhan" | "moc_thoi_gian" | "he_thong" | "anh" | "sticker" | "tep" | "cuoc_goi" | "link" | "da_xem",
      "ben": "trai" | "phai" | "giua",
      "nguoi_gui": string | null,
      "noi_dung": string,
      "tra_loi_cho": string | null,
      "cam_xuc": string | null,
      "gio": string | null
    }
  ],
  "chu_khac": [string],
  "khong_ro": [string]
}

Giải thích:
- thanh_tren: tên người/nhóm ở đầu cuộc chat (ten_hien_thi) và dòng nhỏ dưới tên, vd "Đang hoạt động" (phu).
- ben: bong bóng sát lề trái = "trai", sát lề phải = "phai", dòng căn giữa (mốc thời gian, thông báo hệ thống) = "giua".
- nguoi_gui: tên hiện cạnh bong bóng (chat nhóm), không có thì null.
- noi_dung: nguyên văn. Với ảnh / sticker / tệp / cuộc gọi: mô tả ngắn trong ngoặc vuông, vd "[ảnh: cốc trà sữa]", "[cuộc gọi thoại · 2 phút]".
- tra_loi_cho: phần tin được trích dẫn (trả lời tin) phía trên bong bóng, nguyên văn.
- cam_xuc: emoji được thả vào tin. gio: giờ nhỏ cạnh tin nếu có.
- da_xem: avatar nhỏ / chữ "Đã xem" báo đã đọc.
- chu_khac: chữ khác trên màn hình: thanh trạng thái (giờ, pin), ô soạn tin, nút, banner thông báo.
- khong_ro: đoạn mờ hoặc bị cắt ở mép ảnh: ghi phần đọc được kèm "…". Tin bị cắt vẫn đưa vào "muc", thêm "…" ở chỗ bị cắt.`;

// ---------- tiện ích ----------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export function sniffMime(b: Uint8Array): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const s = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (s(0, 4) === "RIFF" && s(8, 4) === "WEBP") return "image/webp";
  if (s(4, 4) === "ftyp") {
    const brand = s(8, 4);
    if (["heic", "heix", "hevc", "heim", "heis"].includes(brand)) return "image/heic";
    if (["mif1", "msf1"].includes(brand)) return "image/heif";
  }
  return null;
}

async function sha256Hex(b: Uint8Array<ArrayBuffer>): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", b));
  return [...h].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
};

// Bản chép dạng chữ, dễ đọc trên điện thoại.
// deno-lint-ignore no-explicit-any
export function renderText(ai: any): string {
  if (!ai || typeof ai !== "object") return "";
  const out: string[] = [];
  const top = ai.thanh_tren ?? {};
  if (top.ten_hien_thi || top.phu) {
    out.push(`[ĐẦU] ${[top.ten_hien_thi, top.phu].filter(Boolean).join(" · ")}`);
  }
  const BEN: Record<string, string> = { trai: "TRÁI", phai: "PHẢI", giua: "GIỮA" };
  for (const m of Array.isArray(ai.muc) ? ai.muc : []) {
    let s = `[${BEN[m?.ben] ?? "?"}] `;
    if (m?.nguoi_gui) s += `${m.nguoi_gui}: `;
    if (m?.loai && m.loai !== "tin_nhan") s += `(${m.loai}) `;
    if (m?.tra_loi_cho) s += `↪ "${m.tra_loi_cho}" → `;
    s += String(m?.noi_dung ?? "");
    const extra = [m?.cam_xuc && `cảm xúc ${m.cam_xuc}`, m?.gio && `lúc ${m.gio}`].filter(Boolean);
    if (extra.length) s += `  {${extra.join(", ")}}`;
    out.push(s);
  }
  if (Array.isArray(ai.khong_ro) && ai.khong_ro.length) out.push(`[KHÔNG RÕ] ${ai.khong_ro.join(" | ")}`);
  if (Array.isArray(ai.chu_khac) && ai.chu_khac.length) out.push(`[CHỮ KHÁC] ${ai.chu_khac.join(" | ")}`);
  return out.join("\n");
}

// Tóm tắt ngắn cho thông báo trên iPhone.
// deno-lint-ignore no-explicit-any
export function summary(ai: any, trung: boolean): string {
  const muc = Array.isArray(ai?.muc) ? ai.muc : [];
  const tin = muc.filter((m: { loai?: string }) => m?.loai === "tin_nhan");
  const ten = ai?.thanh_tren?.ten_hien_thi ?? "không rõ tên";
  const cuoi = tin.slice(-2).map((m: { ben?: string; noi_dung?: string }) =>
    `${m.ben === "phai" ? "P" : m.ben === "trai" ? "T" : "G"}: ${String(m.noi_dung ?? "").replace(/\n/g, " ").slice(0, 60)}`
  );
  return [`${trung ? "Ảnh đã gửi trước đó · " : ""}${ten} · ${tin.length} tin / ${muc.length} mục`, ...cuoi].join("\n");
}

// ---------- Gemini ----------

async function transcribe(bytes: Uint8Array<ArrayBuffer>, mime: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("Chưa có secret GEMINI_API_KEY");
  const contents = [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: encodeBase64(bytes) } }, { text: PROMPT }] }];
  // Chép chữ không cần "suy nghĩ": tắt bớt thinking cho nhanh. Model không hỗ trợ thì gửi lại không có.
  const makeBody = (think: boolean) => JSON.stringify({
    contents,
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      ...(think && THINKING ? { thinkingConfig: { thinkingLevel: THINKING } } : {}),
    },
  });
  const errs: string[] = [];
  let last = "";
  for (const model of MODELS) {
    let think = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      const t0 = Date.now();
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: makeBody(think),
            signal: AbortSignal.timeout(40_000),
          },
        );
        if (!r.ok) {
          const t = await r.text();
          last = `${model} HTTP ${r.status}: ${t.slice(0, 200)}`;
          if (r.status === 400 && think && /think/i.test(t)) { think = false; continue; }
          if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 1200)); continue; }
          errs.push(last);
          last = "";
          break; // lỗi khác (400/404): sang model sau
        }
        const data = await r.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
        const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
        return { model, ms: Date.now() - t0, json: parsed };
      } catch (e) {
        last = `${model}: ${(e as Error).message}`;
      }
    }
  }
  if (last) errs.push(last);
  throw new Error(`Chưa chép được ảnh (${errs.join(" | ")})`);
}

// ---------- xử lý ----------

async function handlePost(req: Request): Promise<Response> {
  const ct = req.headers.get("content-type") ?? "";
  let bytes: Uint8Array<ArrayBuffer>;
  let declared = "";
  let iosText: string | null = null;
  let device = req.headers.get("x-device");

  if (ct.startsWith("multipart/form-data")) {
    const form = await req.formData();
    const f = form.get("anh") ?? form.get("file");
    if (!(f instanceof File)) return json({ ok: false, loi: "Thiếu ảnh (trường 'anh')" }, 400);
    bytes = new Uint8Array(await f.arrayBuffer());
    declared = f.type;
    const t = form.get("chu_ios");
    if (typeof t === "string" && t.trim()) iosText = t.slice(0, 20_000);
    const d = form.get("thiet_bi");
    if (typeof d === "string" && d.trim()) device = d;
  } else {
    bytes = new Uint8Array(await req.arrayBuffer());
    declared = ct.split(";")[0].trim();
  }

  if (!bytes.length) return json({ ok: false, loi: "Không nhận được ảnh" }, 400);
  if (bytes.length > MAX_BYTES) return json({ ok: false, loi: "Ảnh quá 8MB" }, 413);
  const mime = sniffMime(bytes) ?? declared;
  if (!EXT[mime]) return json({ ok: false, loi: `Không phải ảnh JPG/PNG/HEIC (${mime || "không rõ"})` }, 415);

  const sha = await sha256Hex(bytes);

  // Ảnh đã gửi: trả lại kết quả cũ (chép lại nếu lần trước lỗi)
  const { data: old } = await sb.from("chat_captures").select("*").eq("image_sha256", sha).maybeSingle();
  let row = old;
  if (!row) {
    const d = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "/"); // giờ VN
    const path = `${d}/${sha.slice(0, 20)}.${EXT[mime]}`;
    const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
    if (up.error) throw new Error(`Lưu ảnh lỗi: ${up.error.message}`);
    const ins = await sb.from("chat_captures").insert({
      device, image_path: path, image_sha256: sha, image_bytes: bytes.length, image_type: mime, ios_text: iosText,
    }).select("*").single();
    if (ins.error) {
      if (ins.error.code !== "23505") throw new Error(`Ghi bảng lỗi: ${ins.error.message}`);
      row = (await sb.from("chat_captures").select("*").eq("image_sha256", sha).single()).data;
    } else row = ins.data;
  }

  if (row.ai_json) {
    return json({ ok: true, id: row.id, trung: true, tom_tat: summary(row.ai_json, true), chu: row.ai_text });
  }

  const id = row.id;
  const work = (async () => {
    try {
      const r = await transcribe(bytes, mime);
      const text = renderText(r.json);
      await sb.from("chat_captures").update({
        ai_model: r.model, ai_ms: r.ms, ai_json: r.json, ai_text: text, ai_error: null,
        ...(iosText && !row.ios_text ? { ios_text: iosText } : {}),
      }).eq("id", id);
      return { ok: true as const, json: r.json, text };
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`#${id}`, msg);
      await sb.from("chat_captures").update({ ai_error: msg }).eq("id", id);
      return { ok: false as const, msg };
    }
  })();

  // Mặc định: báo "đã nhận" ngay (~1–2 giây), chép xong thì hiện trên trang xem.
  // Gửi kèm tiêu đề x-wait: 1 để đợi chép xong mới trả lời (dùng khi kiểm tra).
  const wait = req.headers.get("x-wait") === "1" || !RT?.waitUntil;
  if (!wait) {
    RT!.waitUntil!(work);
    return json({ ok: true, id, trung: !!old, dang_chep: true, tom_tat: `✅ Đã nhận ảnh #${id}. Kết quả xem trên trang Ảnh chụp chat.` });
  }
  const res = await work;
  if (res.ok) return json({ ok: true, id, trung: !!old, tom_tat: summary(res.json, false), chu: res.text });
  return json({ ok: false, id, loi: res.msg, tom_tat: `⚠️ Đã lưu ảnh #${id} nhưng chưa chép được. Thử gửi lại sau.` }, 502);
}

async function handleGet(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const id = u.searchParams.get("id");
  if (id) {
    const { data, error } = await sb.from("chat_captures").select("*").eq("id", Number(id)).maybeSingle();
    if (error) throw error;
    if (!data) return json({ ok: false, loi: "Không thấy" }, 404);
    const s = await sb.storage.from(BUCKET).createSignedUrl(data.image_path, 3600);
    return json({ ok: true, item: { ...data, image_url: s.data?.signedUrl ?? null } });
  }
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit") ?? 20), 1), 100);
  let q = sb.from("chat_captures")
    .select("id, created_at, device, image_path, image_bytes, ai_model, ai_ms, ai_error, status, note, ai_json->ung_dung, ai_json->thanh_tren")
    .order("id", { ascending: false }).limit(limit);
  const before = u.searchParams.get("before");
  if (before) q = q.lt("id", Number(before));
  const { data, error } = await q;
  if (error) throw error;
  const paths = (data ?? []).map((r) => r.image_path);
  const signed = paths.length ? (await sb.storage.from(BUCKET).createSignedUrls(paths, 3600)).data ?? [] : [];
  const urls = new Map(signed.map((s) => [s.path, s.signedUrl]));
  return json({ ok: true, items: (data ?? []).map((r) => ({ ...r, image_url: urls.get(r.image_path) ?? null })) });
}

async function handlePatch(req: Request): Promise<Response> {
  const b = await req.json().catch(() => null);
  if (!b?.id) return json({ ok: false, loi: "Thiếu id" }, 400);
  const patch: Record<string, unknown> = {};
  if (b.status !== undefined) {
    if (!["new", "seen", "labeled", "ignored"].includes(b.status)) return json({ ok: false, loi: "status sai" }, 400);
    patch.status = b.status;
  }
  if (b.note !== undefined) patch.note = b.note === null ? null : String(b.note).slice(0, 2000);
  if (b.label_json !== undefined) patch.label_json = b.label_json;
  if (!Object.keys(patch).length) return json({ ok: false, loi: "Không có gì để sửa" }, 400);
  const { error } = await sb.from("chat_captures").update(patch).eq("id", Number(b.id));
  if (error) throw error;
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const key = Deno.env.get("CAPTURE_KEY");
  if (!key) return json({ ok: false, loi: "Chưa cài secret CAPTURE_KEY" }, 500);
  const given = req.headers.get("x-capture-key") ?? "";
  if (!given || !safeEqual(given, key)) return json({ ok: false, loi: "Sai mã x-capture-key" }, 401);
  try {
    if (req.method === "POST") return await handlePost(req);
    if (req.method === "GET") return await handleGet(req);
    if (req.method === "PATCH") return await handlePatch(req);
    return json({ ok: false, loi: "Không hỗ trợ" }, 405);
  } catch (e) {
    console.error(e);
    return json({ ok: false, loi: (e as Error).message ?? String(e) }, 500);
  }
});
