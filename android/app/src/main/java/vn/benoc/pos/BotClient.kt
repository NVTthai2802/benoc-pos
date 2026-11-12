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

    fun sendImage(p: Prefs, jpeg: ByteArray, test: Boolean = p.testEnv): Result =
        post(p, test, jpeg, "image/jpeg", wait = p.waitResult)

    /** Ảnh + kết quả OCR trên máy (multipart: anh, ocr). Bot vẫn đọc ảnh bằng Gemini, OCR chỉ lưu để so sánh. */
    fun sendImageOcr(p: Prefs, jpeg: ByteArray, ocrJson: String, test: Boolean): Result {
        val b = "----benoc" + System.nanoTime()
        val out = java.io.ByteArrayOutputStream(jpeg.size + ocrJson.length * 2 + 512)
        fun w(s: String) = out.write(s.toByteArray(Charsets.UTF_8))
        w("--$b\r\ncontent-disposition: form-data; name=\"anh\"; filename=\"anh.jpg\"\r\ncontent-type: image/jpeg\r\n\r\n"); out.write(jpeg)
        w("\r\n--$b\r\ncontent-disposition: form-data; name=\"ocr\"\r\ncontent-type: application/json; charset=utf-8\r\n\r\n"); w(ocrJson)
        w("\r\n--$b--\r\n")
        return post(p, test, out.toByteArray(), "multipart/form-data; boundary=$b", wait = p.waitResult)
    }

    fun sendText(p: Prefs, text: String, test: Boolean = p.testEnv): Result =
        post(p, test, JSONObject().put("text", text).toString().toByteArray(), "application/json", wait = false)

    /** Chữ đứng đầu mọi câu báo khi đang gửi vào TEST, để không nhầm với đơn thật */
    const val TEST_TAG = "🧪 TEST · "

    private fun post(p: Prefs, test: Boolean, body: ByteArray, type: String, wait: Boolean): Result {
        val r = postRaw(p, test, body, type, wait)
        return if (test) r.copy(text = TEST_TAG + r.text) else r
    }

    private fun postRaw(p: Prefs, test: Boolean, body: ByteArray, type: String, wait: Boolean): Result {
        if (!p.readyFor(test)) return Result(false, "⚠️ Chưa nhập mã bí mật " + (if (test) "TEST" else "PRODUCT") + ". Mở app Bé Nốc POS → ⋮ → Cài đặt chụp đơn.")
        var c: HttpURLConnection? = null
        return try {
            c = (URL(p.url(test)).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15_000
                readTimeout = if (wait || type.startsWith("application")) 150_000 else 30_000
                doOutput = true
                setFixedLengthStreamingMode(body.size)
                setRequestProperty("content-type", type)
                setRequestProperty("x-capture-key", p.key(test))
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
