package vn.benoc.pos

import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import java.util.concurrent.Executors

/** Cài đặt chụp đơn: địa chỉ bot, mã bí mật, tên máy, chế độ đợi kết quả. */
class SettingsActivity : ComponentActivity() {
    private val io = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val p = Prefs(this)
        val d = resources.displayMetrics.density
        val pad = (20 * d).toInt()
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, pad) }

        fun label(s: String, sub: String? = null) {
            col.addView(TextView(this).apply { text = s; textSize = 15f; setTypeface(typeface, Typeface.BOLD); setPadding(0, (16 * d).toInt(), 0, (2 * d).toInt()) })
            if (sub != null) col.addView(TextView(this).apply { text = sub; textSize = 13f; alpha = 0.7f })
        }
        fun field(v: String, type: Int) = EditText(this).apply { setText(v); inputType = type; isSingleLine = true }.also { col.addView(it) }

        col.addView(TextView(this).apply { text = "Cài đặt chụp đơn"; textSize = 22f; setTypeface(typeface, Typeface.BOLD) })
        col.addView(TextView(this).apply { text = "Nút nổi gửi ảnh chụp đoạn chat cho bot lên đơn (giống Phím tắt iPhone). Đơn vào thẳng bếp / pha chế với nhãn ĐƠN ONLINE."; textSize = 14f; alpha = 0.8f; setPadding(0, (6 * d).toInt(), 0, 0) })

        label("Mã bí mật (CAPTURE_KEY)", "Lấy từ người quản lý POS. Giống mã trong Phím tắt iPhone.")
        val key = field(p.captureKey, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        val show = Switch(this).apply { text = "Hiện mã"; setOnCheckedChangeListener { _, on ->
            key.inputType = InputType.TYPE_CLASS_TEXT or if (on) InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD else InputType.TYPE_TEXT_VARIATION_PASSWORD
            key.setSelection(key.text.length) } }
        col.addView(show)

        label("Tên máy", "Không dấu, không trùng máy khác (vd android-nhan-vien-1). \"Sửa đơn\" chỉ sửa đơn vừa gửi từ máy này.")
        val dev = field(p.device, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS)

        label("Đợi kết quả từng ảnh", "Tắt (khuyên dùng): báo \"📥 Đã nhận\" ngay, chụp liên tục được. Bật: đợi bot đọc xong, báo tên khách và món (chậm hơn).")
        val wait = Switch(this).apply { text = "Đợi bot đọc xong"; isChecked = p.waitResult }
        col.addView(wait)

        label("Địa chỉ bot", "Để mặc định (Product). Chỉ đổi khi dùng môi trường khác.")
        val url = field(p.botUrl, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI)

        val status = TextView(this).apply { textSize = 14f; setPadding(0, (12 * d).toInt(), 0, 0); setTextIsSelectable(true) }
        fun save(): Boolean {
            if (!url.text.startsWith("https://")) { Toast.makeText(this, "Địa chỉ bot phải bắt đầu bằng https://", Toast.LENGTH_SHORT).show(); return false }
            p.captureKey = key.text.toString(); p.device = dev.text.toString(); p.botUrl = url.text.toString(); p.waitResult = wait.isChecked
            dev.setText(p.device)
            return true
        }
        val test = Button(this).apply { text = "Lưu và kiểm tra kết nối"; setOnClickListener {
            if (!save()) return@setOnClickListener
            status.text = "Đang kiểm tra…"
            io.execute {
                val r = BotClient.sendText(p, "hd")   // bot trả hướng dẫn, không tạo đơn
                runOnUiThread { status.text = if (r.ok) "✅ Kết nối được bot.\n\n" + r.text.take(400) else r.text }
            }
        } }
        val done = Button(this).apply { text = "Lưu"; setOnClickListener { if (save()) { Toast.makeText(this@SettingsActivity, "Đã lưu", Toast.LENGTH_SHORT).show(); finish() } } }
        col.addView(View(this), LinearLayout.LayoutParams(1, (16 * d).toInt()))
        col.addView(test); col.addView(done); col.addView(status)
        setContentView(ScrollView(this).apply { addView(col); fitSystemBars(this) })
    }

    override fun onDestroy() { io.shutdown(); super.onDestroy() }
}
