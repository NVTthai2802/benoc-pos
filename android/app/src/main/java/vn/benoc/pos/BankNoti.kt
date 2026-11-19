package vn.benoc.pos

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Đọc thông báo tiền vào của app ngân hàng (vd Techcombank Store Noti) → gửi /api/bank-noti
 * để phần mềm tự đánh dấu đơn "Đã thu · Chuyển khoản".
 *
 * - Chỉ đọc thông báo của ĐÚNG app đã chọn; mọi app khác bỏ qua, không lưu, không gửi.
 * - Xoá số dư ngay trên máy trước khi lưu / gửi.
 * - Mất mạng: giữ trong hàng đợi trên máy, gửi lại khi có mạng (thử lại mỗi phút).
 * - Tuỳ chọn tự xoá thông báo sau khi đọc (để thông báo im lặng không làm đầy thanh thông báo).
 */
class BankNotiService : NotificationListenerService() {
    private val main = Handler(Looper.getMainLooper())
    private val retry = Runnable { BankNoti.flush(this) { if (BankNoti.pending(this) > 0) scheduleRetry() } }
    private fun scheduleRetry() { main.removeCallbacks(retry); main.postDelayed(retry, 60_000) }

    override fun onListenerConnected() { connected = true; BankNoti.flush(this) { if (BankNoti.pending(this) > 0) scheduleRetry() } }
    override fun onListenerDisconnected() { connected = false }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val p = Prefs(this)
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val pkg = sbn.packageName ?: return
        if (pkg == packageName) return
        BankNoti.rememberApp(this, pkg)                       // chỉ ghi tên app (để chọn), không ghi nội dung
        if (!p.notiOn) return
        if (p.notiPkg.isBlank()) { if (BankNoti.looksLikeBank(this, pkg)) p.notiPkg = pkg else return }
        if (pkg != p.notiPkg) return

        val ex = n.extras
        val title = ex.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = (ex.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: ex.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
        if (title.isBlank() && text.isBlank()) return
        BankNoti.enqueue(this, JSONObject()
            .put("title", BankNoti.stripBalance(title)).put("text", BankNoti.stripBalance(text))
            .put("pkg", pkg).put("key", sbn.key).put("posted_at", sbn.postTime.toString())
            .put("device", p.device).put("test", p.notiTest))
        if (p.notiClear && !p.notiTest) runCatching { cancelNotification(sbn.key) }
        BankNoti.flush(this) { if (BankNoti.pending(this) > 0) scheduleRetry() }
    }

    override fun onDestroy() { main.removeCallbacks(retry); super.onDestroy() }

    companion object { @Volatile var connected = false }
}

object BankNoti {
    private val io = Executors.newSingleThreadExecutor()
    private const val Q = "noti_queue"; private const val LOG = "noti_log"; private const val APPS = "noti_apps"
    private fun sp(c: Context) = c.getSharedPreferences("benoc_noti", Context.MODE_PRIVATE)

    val url get() = Prefs.SITE + "api/bank-noti"

    /** Xoá số dư: "SD: 12,345,678 VND", "Số dư 9.999.000đ"… */
    fun stripBalance(s: String) = s.replace(
        Regex("(số\\s*dư|so\\s*du|\\bSD\\b)\\s*[:：]?\\s*[-+]?\\d[\\d.,]*\\s*(vnđ|vnd|đ|₫|d(?![a-z]))?", RegexOption.IGNORE_CASE), "[số dư]"
    ).take(500)

    fun permissionOn(c: Context): Boolean {
        val flat = Settings.Secure.getString(c.contentResolver, "enabled_notification_listeners") ?: return false
        val me = ComponentName(c, BankNotiService::class.java).flattenToString()
        return flat.split(':').any { it == me }
    }

    fun appLabel(c: Context, pkg: String): String = runCatching {
        val pm = c.packageManager; pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    }.getOrDefault(pkg)

    /** App có vẻ là app ngân hàng / Store Noti của Techcombank */
    fun looksLikeBank(c: Context, pkg: String): Boolean {
        val s = (pkg + " " + appLabel(c, pkg)).lowercase()
        return listOf("techcombank", "tcb", "sharenoti", "share noti", "storenoti", "store noti").any { s.contains(it) }
    }

    /** Các app vừa có thông báo (để chọn app nguồn), mới nhất trước, tối đa 15 */
    fun rememberApp(c: Context, pkg: String) {
        val arr = JSONArray(sp(c).getString(APPS, "[]")); val out = JSONArray().put(pkg)
        for (i in 0 until arr.length()) if (arr.getString(i) != pkg && out.length() < 15) out.put(arr.getString(i))
        sp(c).edit().putString(APPS, out.toString()).apply()
    }
    fun recentApps(c: Context): List<String> = JSONArray(sp(c).getString(APPS, "[]")).let { a -> (0 until a.length()).map { a.getString(it) } }

    @Synchronized fun enqueue(c: Context, j: JSONObject) {
        val a = JSONArray(sp(c).getString(Q, "[]")); a.put(j)
        val keep = JSONArray(); val from = maxOf(0, a.length() - 200)
        for (i in from until a.length()) keep.put(a.get(i))
        sp(c).edit().putString(Q, keep.toString()).apply()
    }
    fun pending(c: Context) = JSONArray(sp(c).getString(Q, "[]")).length()

    /** Gửi hết hàng đợi (luồng nền). done chạy ở luồng nền sau khi xong. */
    fun flush(c: Context, done: (() -> Unit)? = null) {
        val app = c.applicationContext
        io.execute {
            val key = Prefs(app).notiKey
            while (key.isNotBlank()) {
                val head = synchronized(this) { JSONArray(sp(app).getString(Q, "[]")).let { if (it.length() > 0) it.getJSONObject(0) else null } } ?: break
                val r = post(key, head)
                if (r == null) break                                   // mất mạng / máy chủ lỗi: để lần sau
                synchronized(this) {
                    val a = JSONArray(sp(app).getString(Q, "[]")); val rest = JSONArray()
                    for (i in 1 until a.length()) rest.put(a.get(i))
                    sp(app).edit().putString(Q, rest.toString()).apply()
                }
                log(app, describe(head, r))
            }
            done?.invoke()
        }
    }

    /** Kiểm tra khoá + đường truyền (không tạo giao dịch). Gọi trên luồng nền. */
    fun ping(key: String): String {
        val r = post(key, JSONObject().put("ping", true)) ?: return "⚠️ Không kết nối được máy chủ (kiểm tra mạng)"
        return when {
            r.optBoolean("ok") -> "✅ Kết nối được, khoá đúng"
            else -> "⛔ " + r.optString("error", "Lỗi")
        }
    }

    /** null = lỗi mạng hoặc máy chủ (thử lại sau); JSON = máy chủ đã trả lời (kể cả sai khoá) */
    private fun post(key: String, body: JSONObject): JSONObject? = try {
        val con = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; doOutput = true; connectTimeout = 15000; readTimeout = 20000
            setRequestProperty("content-type", "application/json; charset=utf-8"); setRequestProperty("x-key", key)
        }
        con.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        val code = con.responseCode
        val txt = (if (code < 400) con.inputStream else con.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
        con.disconnect()
        if (code >= 500) null else runCatching { JSONObject(txt) }.getOrElse { JSONObject().put("ok", false).put("error", "HTTP $code") }
    } catch (e: Exception) { null }

    private fun money(v: Int) = String.format(Locale("vi", "VN"), "%,d", v).replace(',', '.') + "đ"
    private fun describe(sent: JSONObject, r: JSONObject): String {
        val amt = r.optInt("amount", 0)
        return when {
            !r.optBoolean("ok") -> "⛔ " + r.optString("error", "Lỗi")
            r.optString("skip") == "duplicate" -> "↺ Đã gửi trước đó"
            r.optString("skip").isNotEmpty() -> "· Bỏ qua (" + r.optString("skip") + ")"
            r.optBoolean("test") -> "🧪 Ghi thử: đọc được " + (if (amt > 0) money(amt) else "KHÔNG thấy số tiền") +
                (if (r.isNull("code")) ", không có mã BN" else ", mã " + r.optString("code")) + "\n   \"" + sent.optString("title") + " | " + sent.optString("text").take(160) + "\""
            r.optBoolean("matched") -> "✅ " + money(amt) + " → " + r.optString("where") + when (r.optString("status")) {
                "thieu_tien" -> " (thiếu tiền)"; "don_da_thu" -> " (đơn đã thu trước)"; else -> " · Đã thu" }
            amt <= 0 -> "⚠️ Không đọc được số tiền: \"" + sent.optString("text").take(120) + "\""
            else -> "• " + money(amt) + " chưa khớp đơn (nhân viên bấm tay)"
        }
    }

    private fun log(c: Context, line: String) {
        val t = SimpleDateFormat("HH:mm dd/MM", Locale.US).format(Date())
        val a = JSONArray(sp(c).getString(LOG, "[]")); val out = JSONArray().put("$t  $line")
        for (i in 0 until minOf(a.length(), 29)) out.put(a.getString(i))
        sp(c).edit().putString(LOG, out.toString()).apply()
    }
    fun logLines(c: Context): List<String> = JSONArray(sp(c).getString(LOG, "[]")).let { a -> (0 until a.length()).map { a.getString(it) } }
}
