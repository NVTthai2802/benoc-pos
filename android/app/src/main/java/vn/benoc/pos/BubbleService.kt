package vn.benoc.pos

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.ImageView
import android.widget.Toast
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.abs

/**
 * Nút nổi chụp đơn. Chạy nền (thông báo thường trực), giữ phiên ghi màn hình (MediaProjection).
 *  - Chạm nút  → ẩn nút, lấy 1 khung hình màn hình, nén JPEG, gửi bot-don → báo "📥 Đã nhận" (chụp tiếp được ngay)
 *  - Giữ nút   → mở ô Sửa đơn (thêm món / đổi giờ / huỷ)
 *  - Kéo       → di chuyển nút
 */
class BubbleService : Service() {

    private lateinit var wm: WindowManager
    private lateinit var prefs: Prefs
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var bubble: ImageView? = null
    private var params: WindowManager.LayoutParams? = null
    private val main = Handler(Looper.getMainLooper())
    private val imgThread = HandlerThread("chup").apply { start() }
    private val imgHandler = Handler(imgThread.looper)
    private val net = Executors.newFixedThreadPool(3)
    private val sending = AtomicInteger(0)

    // Khung hình mới nhất (giữ 1 ảnh, đóng ảnh cũ) + yêu cầu chụp đang chờ
    @Volatile private var latest: Image? = null
    @Volatile private var wantAfter = 0L          // cần khung hình chụp SAU thời điểm này (đã ẩn nút)
    private var width = 0
    private var height = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        prefs = Prefs(this)
        running = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> { stopSelf(); return START_NOT_STICKY }
            ACTION_START -> {
                val code = intent.getIntExtra(EXTRA_CODE, Activity.RESULT_CANCELED)
                @Suppress("DEPRECATION")
                val data: Intent? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(EXTRA_DATA, Intent::class.java) else intent.getParcelableExtra(EXTRA_DATA)
                // Phải chạy foreground (loại mediaProjection) TRƯỚC khi lấy MediaProjection
                if (Build.VERSION.SDK_INT >= 29) startForeground(NOTI_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
                else startForeground(NOTI_ID, notification())
                if (data == null || code != Activity.RESULT_OK || !startProjection(code, data)) { stopSelf(); return START_NOT_STICKY }
                if (bubble == null) addBubble()
            }
        }
        return START_NOT_STICKY
    }

    // ------------------------------------------------------------------ ghi màn hình
    private fun startProjection(code: Int, data: Intent): Boolean {
        if (projection != null) return true
        val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val mp = runCatching { mpm.getMediaProjection(code, data) }.getOrNull() ?: return false
        mp.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() { main.post { stopSelf() } }   // người dùng bấm dừng chia sẻ màn hình
        }, main)
        val m = DisplayMetrics()
        @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(m)
        // Ảnh gửi bot không cần quá nét: cạnh dài tối đa ~1600px cho nhẹ, gửi nhanh
        val scale = minOf(1f, 1600f / maxOf(m.widthPixels, m.heightPixels))
        width = (m.widthPixels * scale).toInt() and 0x7ffffffe
        height = (m.heightPixels * scale).toInt() and 0x7ffffffe
        val r = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3)
        r.setOnImageAvailableListener({ onFrame(it) }, imgHandler)
        display = mp.createVirtualDisplay("benoc-chup", width, height, m.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, imgHandler)
        reader = r
        projection = mp
        return true
    }

    /** Luôn giữ khung hình mới nhất; đang chờ chụp thì xử lý luôn khung hình đầu tiên sau khi ẩn nút. */
    private fun onFrame(r: ImageReader) {
        val img = runCatching { r.acquireLatestImage() }.getOrNull() ?: return
        latest?.close()
        latest = img
        val after = wantAfter
        if (after > 0 && SystemClock.elapsedRealtime() >= after) { wantAfter = 0; grab() }
    }

    private fun capture() {
        if (wantAfter > 0) return
        bubble?.alpha = 0f    // ẩn nút để không lọt vào ảnh (đổi màn hình → có khung hình mới)
        wantAfter = SystemClock.elapsedRealtime() + 60
        // Màn hình đứng yên không sinh khung hình mới: quá 350ms thì lấy khung hình đang giữ
        imgHandler.postDelayed({ if (wantAfter > 0) { wantAfter = 0; grab() } }, 350)
    }

    /** Chạy trên luồng ảnh: Image → JPEG → gửi bot */
    private fun grab() {
        val img = latest
        latest = null
        main.post { bubble?.alpha = 1f }
        if (img == null) { toast("⚠️ Chưa lấy được hình, chạm lại giúp em"); return }
        val jpeg = try { toJpeg(img) } catch (e: Exception) { toast("⚠️ Lỗi chụp: ${e.message}"); return } finally { img.close() }
        vibrate()
        val n = sending.incrementAndGet()
        main.post { setBusy(true) }
        if (n == 1 || prefs.waitResult) toast(if (prefs.waitResult) "⏳ Đang đọc đơn…" else "⏳ Đang gửi…")
        net.execute {
            val res = BotClient.sendImage(prefs, jpeg)
            val left = sending.decrementAndGet()
            main.post { if (left == 0) setBusy(false) }
            toast(res.text, long = prefs.waitResult || !res.ok)
        }
    }

    private fun toJpeg(img: Image): ByteArray {
        val plane = img.planes[0]
        val rowPx = plane.rowStride / plane.pixelStride
        val full = Bitmap.createBitmap(rowPx, img.height, Bitmap.Config.ARGB_8888)
        full.copyPixelsFromBuffer(plane.buffer)
        val bmp = if (rowPx != img.width) Bitmap.createBitmap(full, 0, 0, img.width, img.height) else full
        val out = ByteArrayOutputStream(400_000)
        bmp.compress(Bitmap.CompressFormat.JPEG, 82, out)
        if (bmp !== full) bmp.recycle()
        full.recycle()
        return out.toByteArray()
    }

    // ------------------------------------------------------------------ nút nổi
    @SuppressLint("ClickableViewAccessibility")
    private fun addBubble() {
        val size = (56 * resources.displayMetrics.density).toInt()
        val v = ImageView(this).apply {
            setImageResource(R.drawable.ic_bubble)
            elevation = 8f
            contentDescription = "Chụp đơn"
        }
        val lp = WindowManager.LayoutParams(
            size, size,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            val dm = resources.displayMetrics
            x = getSharedPreferences("benoc", MODE_PRIVATE).getInt("bx", dm.widthPixels - size - 8)
            y = getSharedPreferences("benoc", MODE_PRIVATE).getInt("by", dm.heightPixels / 3)
        }
        val slop = ViewConfiguration.get(this).scaledTouchSlop
        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var moved = false
        var longFired = false
        val longPress = Runnable { longFired = true; if (!moved) { vibrate(); openEdit() } }
        v.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY; startX = lp.x; startY = lp.y; moved = false; longFired = false
                    main.postDelayed(longPress, ViewConfiguration.getLongPressTimeout().toLong() + 150)
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX; val dy = e.rawY - downY
                    if (!moved && (abs(dx) > slop || abs(dy) > slop)) { moved = true; main.removeCallbacks(longPress) }
                    if (moved) { lp.x = startX + dx.toInt(); lp.y = startY + dy.toInt(); runCatching { wm.updateViewLayout(v, lp) } }
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    main.removeCallbacks(longPress)
                    if (moved) getSharedPreferences("benoc", MODE_PRIVATE).edit().putInt("bx", lp.x).putInt("by", lp.y).apply()
                    else if (!longFired && e.actionMasked == MotionEvent.ACTION_UP) capture()
                }
            }
            true
        }
        wm.addView(v, lp)
        bubble = v; params = lp
    }

    private fun setBusy(b: Boolean) { bubble?.scaleX = if (b) 0.85f else 1f; bubble?.scaleY = if (b) 0.85f else 1f }

    private fun openEdit() {
        startActivity(Intent(this, EditOrderActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
    }

    // ------------------------------------------------------------------ tiện ích
    private fun toast(s: String, long: Boolean = false) = main.post {
        Toast.makeText(applicationContext, s, if (long) Toast.LENGTH_LONG else Toast.LENGTH_SHORT).show()
    }

    private fun vibrate() {
        val vb = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
        runCatching { vb.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE)) }
    }

    private fun notification(): Notification {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Nút chụp đơn", NotificationManager.IMPORTANCE_LOW))
        val pi = { i: Intent, rc: Int -> PendingIntent.getActivity(this, rc, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
        val stop = PendingIntent.getService(this, 2, Intent(this, BubbleService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_noti)
            .setContentTitle("Nút chụp đơn đang bật")
            .setContentText("Chạm nút cam để gửi đơn · giữ nút để sửa đơn")
            .setOngoing(true)
            .setContentIntent(pi(Intent(this, MainActivity::class.java), 1))
            .addAction(Notification.Action.Builder(null, "Sửa đơn", pi(Intent(this, EditOrderActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), 3)).build())
            .addAction(Notification.Action.Builder(null, "Tắt", stop).build())
            .build()
    }

    override fun onDestroy() {
        running = false
        bubble?.let { runCatching { wm.removeView(it) } }
        bubble = null
        display?.release(); display = null
        reader?.close(); reader = null
        latest?.close(); latest = null
        projection?.stop(); projection = null
        imgThread.quitSafely()
        net.shutdown()
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "vn.benoc.pos.START"
        const val ACTION_STOP = "vn.benoc.pos.STOP"
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"
        private const val CHANNEL = "nut-chup"
        private const val NOTI_ID = 7
        @Volatile var running = false
            private set

        fun stop(ctx: Context) { ctx.startService(Intent(ctx, BubbleService::class.java).setAction(ACTION_STOP)) }
    }
}
