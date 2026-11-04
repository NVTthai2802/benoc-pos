package vn.benoc.pos

import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import java.util.concurrent.Executors

/** Ô "Sửa đơn" nổi trên Messenger: gõ "thêm 1 trà đào", "giờ 18h30", "huỷ"… gửi bot, hiện kết quả. */
class EditOrderActivity : ComponentActivity() {
    private val io = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val d = resources.displayMetrics.density
        val pad = (18 * d).toInt()
        val prefs = Prefs(this)

        val title = TextView(this).apply { text = "Sửa đơn vừa gửi"; textSize = 18f; setTypeface(typeface, Typeface.BOLD) }
        val guide = TextView(this).apply { text = "Vd: thêm 1 trà đào · bỏ kimbap · giờ 18h30 · ship 12 ngõ 5…, sđt 09… · huỷ"; textSize = 13f; alpha = 0.7f; setPadding(0, (4 * d).toInt(), 0, (8 * d).toInt()) }
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            imeOptions = EditorInfo.IME_ACTION_SEND
            setHint("Nhắn cho bot…")
            isSingleLine = true
        }
        val result = TextView(this).apply { textSize = 14f; setPadding(0, (10 * d).toInt(), 0, 0); setTextIsSelectable(true) }
        val send = Button(this).apply { text = "Gửi" }
        val close = Button(this).apply { text = "Đóng"; setOnClickListener { finish() } }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.END
            addView(close); addView(send)
        }

        fun go() {
            val t = input.text.toString().trim()
            if (t.isEmpty()) return
            send.isEnabled = false; send.text = "Đang gửi…"; result.text = ""
            io.execute {
                val r = BotClient.sendText(prefs, t)
                runOnUiThread {
                    send.isEnabled = true; send.text = "Gửi"
                    result.text = r.text
                    if (r.ok) input.setText("")
                }
            }
        }
        send.setOnClickListener { go() }
        input.setOnEditorActionListener { _, a, _ -> if (a == EditorInfo.IME_ACTION_SEND) { go(); true } else false }

        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad / 2)
            addView(title); addView(guide); addView(input); addView(result); addView(row)
        }
        setContentView(ScrollView(this).apply { addView(col) })
        input.requestFocus()
    }

    override fun onDestroy() { io.shutdown(); super.onDestroy() }
}
