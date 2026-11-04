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

/**
 * Cài đặt chụp đơn. PRODUCT và TEST có mã bí mật / địa chỉ bot riêng:
 * nút chụp gửi vào môi trường đang chọn trong app (⋮ → Chuyển sang TEST / PRODUCT).
 */
class SettingsActivity : ComponentActivity() {
    private val io = Executors.newFixedThreadPool(2)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val p = Prefs(this)
        val d = resources.displayMetrics.density
        val pad = (20 * d).toInt()
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, pad) }

        fun heading(s: String, color: Int? = null) = col.addView(TextView(this).apply {
            text = s; textSize = 17f; setTypeface(typeface, Typeface.BOLD); setPadding(0, (22 * d).toInt(), 0, 0)
            if (color != null) setTextColor(color)
        })
        fun label(s: String, sub: String? = null) {
            col.addView(TextView(this).apply { text = s; textSize = 15f; setTypeface(typeface, Typeface.BOLD); setPadding(0, (12 * d).toInt(), 0, (2 * d).toInt()) })
            if (sub != null) col.addView(TextView(this).apply { text = sub; textSize = 13f; alpha = 0.7f })
        }
        fun field(v: String, type: Int) = EditText(this).apply { setText(v); inputType = type; isSingleLine = true }.also { col.addView(it) }
        val hidden = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        val shown = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
        val uri = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI

        col.addView(TextView(this).apply { text = "Cài đặt chụp đơn"; textSize = 22f; setTypeface(typeface, Typeface.BOLD) })
        col.addView(TextView(this).apply {
            text = "Nút chụp gửi đơn vào môi trường đang chọn trong app (hiện đang chọn: " + (if (p.testEnv) "TEST" else "PRODUCT") +
                "). Đổi ở ⋮ → Chuyển sang TEST / PRODUCT. Nút cam = PRODUCT (đơn thật), nút tím chữ T = TEST."
            textSize = 14f; alpha = 0.8f; setPadding(0, (6 * d).toInt(), 0, 0)
        })

        // ---- PRODUCT
        heading("PRODUCT · quán dùng thật", getColor(R.color.cam_dam))
        label("Mã bí mật PRODUCT", "Giống mã x-capture-key trong Phím tắt iPhone.")
        val key = field(p.captureKey, hidden)

        // ---- TEST
        heading("TEST · thử tính năng", 0xFF7C3AED.toInt())
        label("Mã bí mật TEST", "Mã riêng của Supabase Test. Để trống thì ở chế độ TEST nút chụp không gửi gì.")
        val keyTest = field(p.captureKeyTest, hidden)

        val show = Switch(this).apply { text = "Hiện mã"; setPadding(0, (8 * d).toInt(), 0, 0); setOnCheckedChangeListener { _, on ->
            for (k in listOf(key, keyTest)) { k.inputType = if (on) shown else hidden; k.setSelection(k.text.length) } } }
        col.addView(show)

        // ---- chung
        heading("Chung")
        label("Tên máy", "Không dấu, không trùng máy khác (vd android-nhan-vien-1). \"Sửa đơn\" chỉ sửa đơn vừa gửi từ máy này.")
        val dev = field(p.device, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS)

        label("Đợi kết quả từng ảnh", "Tắt (khuyên dùng): báo \"📥 Đã nhận\" ngay, chụp liên tục được. Bật: đợi bot đọc xong, báo tên khách và món (chậm hơn).")
        val wait = Switch(this).apply { text = "Đợi bot đọc xong"; isChecked = p.waitResult }
        col.addView(wait)

        label("Địa chỉ bot (nâng cao)", "Để mặc định. Dòng trên: PRODUCT, dòng dưới: TEST.")
        val url = field(p.botUrl, uri)
        val urlTest = field(p.botUrlTest, uri)

        val status = TextView(this).apply { textSize = 14f; setPadding(0, (12 * d).toInt(), 0, 0); setTextIsSelectable(true) }
        fun save(): Boolean {
            if (!url.text.startsWith("https://") || !urlTest.text.startsWith("https://")) {
                Toast.makeText(this, "Địa chỉ bot phải bắt đầu bằng https://", Toast.LENGTH_SHORT).show(); return false
            }
            p.captureKey = key.text.toString(); p.captureKeyTest = keyTest.text.toString()
            p.botUrl = url.text.toString(); p.botUrlTest = urlTest.text.toString()
            p.device = dev.text.toString(); p.waitResult = wait.isChecked
            dev.setText(p.device)
            return true
        }
        val test = Button(this).apply { text = "Lưu và kiểm tra kết nối"; setOnClickListener {
            if (!save()) return@setOnClickListener
            status.text = "Đang kiểm tra…"
            val lines = arrayOfNulls<String>(2)   // mỗi luồng ghi 1 ô riêng
            fun check(isTest: Boolean, idx: Int) {
                val name = if (isTest) "TEST" else "PRODUCT"
                if (!p.readyFor(isTest)) { lines[idx] = "— $name: chưa nhập mã"; return }
                val r = BotClient.sendText(p, "hd", isTest)   // bot trả hướng dẫn, không tạo đơn
                lines[idx] = if (r.ok) "✅ $name: kết nối được bot" else "❌ $name: " + r.text.removePrefix(BotClient.TEST_TAG)
            }
            io.execute {
                val a = Thread { check(false, 0) }; val b = Thread { check(true, 1) }
                a.start(); b.start(); a.join(); b.join()
                runOnUiThread { status.text = lines.filterNotNull().joinToString("\n") }
            }
        } }
        val done = Button(this).apply { text = "Lưu"; setOnClickListener {
            if (save()) { BubbleService.refresh(this@SettingsActivity); Toast.makeText(this@SettingsActivity, "Đã lưu", Toast.LENGTH_SHORT).show(); finish() }
        } }
        col.addView(View(this), LinearLayout.LayoutParams(1, (16 * d).toInt()))
        col.addView(test); col.addView(done); col.addView(status)
        setContentView(ScrollView(this).apply { addView(col); fitSystemBars(this) })
    }

    override fun onDestroy() { io.shutdown(); super.onDestroy() }
}
