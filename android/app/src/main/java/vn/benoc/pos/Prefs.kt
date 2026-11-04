package vn.benoc.pos

import android.content.Context
import android.os.Build

/** Cài đặt lưu trên máy (không đưa mã bí mật vào mã nguồn). */
class Prefs(ctx: Context) {
    private val p = ctx.getSharedPreferences("benoc", Context.MODE_PRIVATE)

    // ---- PRODUCT (quán dùng thật)
    var botUrl: String
        get() = p.getString("bot_url", null)?.takeIf { it.isNotBlank() } ?: DEFAULT_BOT_URL
        set(v) = p.edit().putString("bot_url", v.trim()).apply()

    var captureKey: String
        get() = p.getString("capture_key", "") ?: ""
        set(v) = p.edit().putString("capture_key", v.trim()).apply()

    // ---- TEST
    var botUrlTest: String
        get() = p.getString("bot_url_test", null)?.takeIf { it.isNotBlank() } ?: TEST_BOT_URL
        set(v) = p.edit().putString("bot_url_test", v.trim()).apply()

    var captureKeyTest: String
        get() = p.getString("capture_key_test", "") ?: ""
        set(v) = p.edit().putString("capture_key_test", v.trim()).apply()

    fun url(test: Boolean) = if (test) botUrlTest else botUrl
    fun key(test: Boolean) = if (test) captureKeyTest else captureKey
    fun readyFor(test: Boolean) = key(test).isNotBlank() && url(test).startsWith("https://")

    var device: String
        get() = p.getString("device", null)?.takeIf { it.isNotBlank() } ?: defaultDevice()
        set(v) = p.edit().putString("device", cleanDevice(v)).apply()

    /** Đợi bot đọc xong mới báo (x-wait: 1). Mặc định tắt: báo "Đã nhận" ngay, chụp tiếp được. */
    var waitResult: Boolean
        get() = p.getBoolean("wait", false)
        set(v) = p.edit().putBoolean("wait", v).apply()

    /** Trang POS đang mở trong app (đường dẫn sau tên miền, vd "quanly.html"). */
    var page: String
        get() = p.getString("page", null) ?: ""
        set(v) = p.edit().putString("page", v).apply()

    /** Môi trường đang chọn: trang POS trong app VÀ nút chụp đơn cùng theo môi trường này. */
    var testEnv: Boolean
        get() = p.getBoolean("test_env", false)
        set(v) = p.edit().putBoolean("test_env", v).apply()

    val ready get() = readyFor(testEnv)

    companion object {
        const val DEFAULT_BOT_URL = "https://hixdacnaxfuxuccbajzn.supabase.co/functions/v1/bot-don"   // Supabase benoc-pos
        const val TEST_BOT_URL = "https://bsnpcinocphuruahpzwr.supabase.co/functions/v1/bot-don"      // Supabase benoc-pos-test
        const val SITE = "https://benoc-pos.pages.dev/"

        fun cleanDevice(s: String) = s.trim().lowercase()
            .replace(Regex("[àáạảãâầấậẩẫăằắặẳẵ]"), "a").replace(Regex("[èéẹẻẽêềếệểễ]"), "e")
            .replace(Regex("[ìíịỉĩ]"), "i").replace(Regex("[òóọỏõôồốộổỗơờớợởỡ]"), "o")
            .replace(Regex("[ùúụủũưừứựửữ]"), "u").replace(Regex("[ỳýỵỷỹ]"), "y").replace("đ", "d")
            .replace(Regex("[^a-z0-9._-]+"), "-").trim('-').take(40)

        fun defaultDevice() = cleanDevice("android-" + Build.MODEL).ifBlank { "android" }
    }
}
