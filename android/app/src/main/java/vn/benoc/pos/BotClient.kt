package vn.benoc.pos

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Gửi ảnh / chữ cho bot-don (giống Phím tắt iPhone): tiêu đề x-capture-key + x-device.
 * Trả câu bot trả lời (trường tom_tat). Gọi trên luồng nền.
 */
object BotClient {
    data class Result(val ok: Boolean, val text: String)

    fun sendImage(p: Prefs, jpeg: ByteArray): Result =
        post(p, jpeg, "image/jpeg", wait = p.waitResult)

    fun sendText(p: Prefs, text: String): Result =
        post(p, JSONObject().put("text", text).toString().toByteArray(), "application/json", wait = false)

    private fun post(p: Prefs, body: ByteArray, type: String, wait: Boolean): Result {
        if (!p.ready) return Result(false, "⚠️ Chưa nhập mã bí mật. Mở app Bé Nốc POS → ⋮ → Cài đặt chụp đơn.")
        var c: HttpURLConnection? = null
        return try {
            c = (URL(p.botUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15_000
                readTimeout = if (wait || type.startsWith("application")) 150_000 else 30_000
                doOutput = true
                setFixedLengthStreamingMode(body.size)
                setRequestProperty("content-type", type)
                setRequestProperty("x-capture-key", p.captureKey)
                setRequestProperty("x-device", p.device)
                if (wait) setRequestProperty("x-wait", "1")
            }
            c.outputStream.use { it.write(body) }
            val code = c.responseCode
            val raw = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            val msg = runCatching { JSONObject(raw).optString("tom_tat") }.getOrNull()
            Result(code in 200..299, msg?.takeIf { it.isNotBlank() } ?: "Lỗi $code từ bot")
        } catch (e: Exception) {
            Result(false, "⚠️ Không gửi được (mạng?): ${e.message ?: e.javaClass.simpleName}")
        } finally {
            c?.disconnect()
        }
    }
}
