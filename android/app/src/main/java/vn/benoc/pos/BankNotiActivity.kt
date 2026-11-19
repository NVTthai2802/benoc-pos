package vn.benoc.pos

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import java.util.concurrent.Executors

/**
 * Cài đặt "Đọc thông báo chuyển khoản": quyền đọc thông báo, pin, khoá, app nguồn, ghi thử, nhật ký.
 * Dùng cho máy Android nhận thông báo Techcombank Store Noti của quán.
 */
class BankNotiActivity : ComponentActivity() {
    private val io = Executors.newSingleThreadExecutor()
    private lateinit var col: LinearLayout
    private var d = 1f

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        d = resources.displayMetrics.density
        val pad = (20 * d).toInt()
        col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, pad) }
        setContentView(ScrollView(this).apply { addView(col) })
    }

    override fun onResume() { super.onResume(); build() }

    private fun t(s: String, size: Float = 14f, bold: Boolean = false, top: Int = 0, alpha: Float = 1f) = TextView(this).apply {
        text = s; textSize = size; if (bold) setTypeface(typeface, Typeface.BOLD); setPadding(0, (top * d).toInt(), 0, 0); this.alpha = alpha
    }.also { col.addView(it) }
    private fun btn(s: String, f: () -> Unit) = Button(this).apply { text = s; isAllCaps = false; setOnClickListener { f() } }.also { col.addView(it) }
    private fun sw(s: String, on: Boolean, f: (Boolean) -> Unit) = Switch(this).apply {
        text = s; textSize = 15f; isChecked = on; setPadding(0, (10 * d).toInt(), 0, (4 * d).toInt()); setOnCheckedChangeListener { _, v -> f(v) }
    }.also { col.addView(it) }

    @SuppressLint("BatteryLife")
    private fun build() {
        col.removeAllViews()
        val p = Prefs(this)
        val perm = BankNoti.permissionOn(this)
        val pm = getSystemService(PowerManager::class.java)
        val battery = pm.isIgnoringBatteryOptimizations(packageName)

        t("Đọc thông báo chuyển khoản", 22f, true)
        t("Có tiền vào, app ngân hàng (vd Techcombank Store Noti) hiện thông báo → Bé Nốc POS đọc số tiền và mã BN… → đơn tự chuyển sang Đã thu. " +
            "Chỉ đọc thông báo của app đã chọn, xoá số dư trước khi gửi.", 14f, top = 6, alpha = 0.8f)

        // ---- 1. Quyền
        t("1. Quyền trên máy", 17f, true, 20)
        t(if (perm) "✅ Đã cho phép đọc thông báo" else "❌ Chưa cho phép đọc thông báo", 15f, top = 6)
        if (!perm) btn("Mở trang cho phép (bật Bé Nốc POS)") { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
        t(if (battery) "✅ Pin: không hạn chế" else "⚠️ Pin đang bị tối ưu: máy để lâu có thể gửi chậm", 15f, top = 6)
        if (!battery) btn("Cho chạy nền không hạn chế") {
            runCatching { startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))) }
                .onFailure { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        }
        t("Xiaomi / Oppo / Vivo: bật thêm Tự khởi động cho Bé Nốc POS. Không vuốt tắt app trong đa nhiệm.", 13f, top = 4, alpha = 0.7f)

        // ---- 2. Khoá
        t("2. Khoá", 17f, true, 20)
        t("Lấy ở trang Quản lý → Cài đặt → Tự xác nhận chuyển khoản → Khoá → Chép.", 13f, top = 2, alpha = 0.7f)
        val key = EditText(this).apply { setText(p.notiKey); isSingleLine = true; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD }
        col.addView(key)
        val pingOut = TextView(this)
        btn("Lưu khoá và kiểm tra kết nối") {
            p.notiKey = key.text.toString(); pingOut.text = "Đang kiểm tra…"
            io.execute { val r = BankNoti.ping(p.notiKey); runOnUiThread { pingOut.text = r } }
        }
        col.addView(pingOut)

        // ---- 3. App nguồn
        t("3. App ngân hàng", 17f, true, 20)
        t(if (p.notiPkg.isBlank()) "Chưa chọn: tự nhận app có tên Techcombank / Store Noti ở thông báo đầu tiên."
          else "Đang đọc: " + BankNoti.appLabel(this, p.notiPkg) + "  (" + p.notiPkg + ")", 15f, top = 4)
        btn("Chọn app khác") { pickApp(p) }

        // ---- 4. Bật
        t("4. Bật", 17f, true, 20)
        var test: Switch? = null
        sw("Đọc thông báo chuyển khoản (công tắc chính)", p.notiOn) {
            p.notiOn = it; test?.isEnabled = it
            if (it && !perm) Toast.makeText(this, "Cần cho phép đọc thông báo ở bước 1", Toast.LENGTH_LONG).show()
        }
        test = sw("Ghi thử (đọc nhưng KHÔNG đánh dấu đơn đã thu)", p.notiTest) { p.notiTest = it }.apply { isEnabled = p.notiOn }
        t(if (!p.notiOn) "⚠️ Công tắc chính đang tắt: app không đọc thông báo nào (kể cả Ghi thử)."
          else if (p.notiTest) "Đang ghi thử: chuyển thử vài khoản, xem mục 5 đọc đúng số tiền và mã BN… rồi tắt Ghi thử để chạy thật."
          else "✅ Đang chạy thật: đơn có mã BN… tự chuyển sang Đã thu.", 13f, alpha = 0.8f)
        sw("Tự xoá thông báo của app ngân hàng sau khi đọc", p.notiClear) { p.notiClear = it }
        t("Muốn không bị làm phiền: Cài đặt → Thông báo → app ngân hàng → để Im lặng. Đừng chặn hẳn (chặn thì Bé Nốc POS không đọc được).", 13f, alpha = 0.7f)

        // ---- 5. Nhật ký
        t("5. Gần đây", 17f, true, 20)
        val q = BankNoti.pending(this)
        if (q > 0) t("⏳ $q thông báo chờ gửi (sẽ gửi khi có mạng)", 14f, top = 4)
        btn("Gửi lại ngay / tải lại") { BankNoti.flush(this) { runOnUiThread { build() } } }
        val lines = BankNoti.logLines(this)
        t(if (lines.isEmpty()) "Chưa có thông báo nào." else lines.joinToString("\n"), 13f, top = 4).setTextIsSelectable(true)
    }

    private fun pickApp(p: Prefs) {
        val apps = BankNoti.recentApps(this)
        if (apps.isEmpty()) {
            Toast.makeText(this, "Chưa thấy app nào có thông báo. Bật quyền ở bước 1, đợi app ngân hàng có thông báo rồi chọn lại.", Toast.LENGTH_LONG).show(); return
        }
        val names = apps.map { BankNoti.appLabel(this, it) + "\n" + it }.toTypedArray()
        AlertDialog.Builder(this).setTitle("App vừa có thông báo")
            .setItems(names) { _, i -> p.notiPkg = apps[i]; build() }
            .setNegativeButton("Tự nhận lại") { _, _ -> p.notiPkg = ""; build() }
            .show()
    }
}
