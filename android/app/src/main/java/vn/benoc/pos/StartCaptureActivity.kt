package vn.benoc.pos

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts

/**
 * Bật nút nổi: kiểm tra cài đặt → quyền hiện trên app khác → quyền thông báo → xin ghi màn hình → chạy BubbleService.
 * Màn hình trong suốt, xong việc tự đóng.
 */
class StartCaptureActivity : ComponentActivity() {

    private val notiPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { askProjection() }

    private val projectionPerm = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        if (r.resultCode == RESULT_OK && r.data != null) {
            startForegroundService(Intent(this, BubbleService::class.java)
                .setAction(BubbleService.ACTION_START)
                .putExtra(BubbleService.EXTRA_CODE, r.resultCode)
                .putExtra(BubbleService.EXTRA_DATA, r.data))
            Toast.makeText(this, if (Prefs(this).testEnv) "🧪 Đã bật nút chụp đơn (TEST, nút màu tím). Đơn gửi vào môi trường TEST." else "✅ Đã bật nút chụp đơn. Mở Messenger / Zalo, chạm nút cam để gửi đơn.", Toast.LENGTH_LONG).show()
            if (intent.getBooleanExtra(EXTRA_HOME, false)) moveToHome()
        } else {
            Toast.makeText(this, "Chưa cho phép ghi màn hình nên chưa bật được nút chụp đơn.", Toast.LENGTH_LONG).show()
        }
        finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val p = Prefs(this)
        if (!p.ready) {
            Toast.makeText(this, "Nhập mã bí mật " + (if (p.testEnv) "TEST" else "PRODUCT") + " trước đã.", Toast.LENGTH_LONG).show()
            startActivity(Intent(this, SettingsActivity::class.java)); finish(); return
        }
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Bật \"Hiển thị trên ứng dụng khác\" cho Bé Nốc POS, rồi quay lại bấm Bật nút chụp đơn.", Toast.LENGTH_LONG).show()
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            finish(); return
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notiPerm.launch(Manifest.permission.POST_NOTIFICATIONS)   // không cho cũng vẫn chạy được
        } else askProjection()
    }

    private fun askProjection() {
        val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        // Android 14+: chỉ cho chọn "toàn màn hình" (chọn 1 app thì không chụp được Messenger khi đổi app)
        val i = if (Build.VERSION.SDK_INT >= 34) mpm.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
                else mpm.createScreenCaptureIntent()
        projectionPerm.launch(i)
    }

    private fun moveToHome() = startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

    companion object {
        private const val EXTRA_HOME = "home"
        fun start(ctx: Context, goHome: Boolean = false) =
            ctx.startActivity(Intent(ctx, StartCaptureActivity::class.java).putExtra(EXTRA_HOME, goHome))
    }
}
