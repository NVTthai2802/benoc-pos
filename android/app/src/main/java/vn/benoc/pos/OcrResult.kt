package vn.benoc.pos

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

/** Kết quả OCR một ảnh, gửi kèm ảnh cho bot-don (trường "ocr") */
class OcrResult(val lines: List<OcrLine>, val w: Int, val h: Int, val detMs: Long, val recMs: Long, val model: String) {
    fun toJson(): String = JSONObject()
        .put("model", model).put("w", w).put("h", h).put("det_ms", detMs).put("rec_ms", recMs)
        .put("lines", JSONArray().apply {
            lines.forEach { l -> put(JSONObject().put("b", JSONArray(listOf(l.x0, l.y0, l.x1, l.y1))).put("t", l.text).put("c", (l.conf * 1000).roundToInt() / 1000.0)) }
        }).toString()
}
