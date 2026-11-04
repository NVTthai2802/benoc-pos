package vn.benoc.pos

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import java.io.File

/** Màn hình chính: trang POS (Cloudflare Pages) trong WebView + thanh trên cùng để đổi màn hình / bật nút chụp đơn. */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var prefs: Prefs
    private lateinit var title: TextView
    private lateinit var bubbleBtn: Button
    private lateinit var progress: ProgressBar

    private var fileCb: ValueCallback<Array<Uri>>? = null
    private var photoUri: Uri? = null
    private var pendingPerm: PermissionRequest? = null

    // Các màn hình của POS (đường dẫn trên trang web)
    private val pages = listOf(
        "quanly.html" to "Quản lý / chấm công",
        "bep.html" to "Bếp",
        "phache.html" to "Pha chế",
        "index.html?menu=an" to "Menu khách · Ăn vặt",
        "index.html?menu=tra" to "Menu khách · Trà, cà phê",
    )

    private val pickFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val uris = if (r.resultCode == RESULT_OK) r.data?.let { d ->
            d.clipData?.let { c -> Array(c.itemCount) { c.getItemAt(it).uri } } ?: d.data?.let { arrayOf(it) }
        } else null
        fileCb?.onReceiveValue(uris); fileCb = null
    }
    private val takePhoto = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        fileCb?.onReceiveValue(if (ok) photoUri?.let { arrayOf(it) } else null); fileCb = null
    }
    private val cameraPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        pendingPerm?.let { if (ok) it.grant(it.resources) else it.deny() }; pendingPerm = null
    }
    private val cameraForFile = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) launchCamera() else { fileCb?.onReceiveValue(null); fileCb = null }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        val d = resources.displayMetrics.density

        // ---- thanh trên cùng
        title = TextView(this).apply {
            setTextColor(Color.WHITE); textSize = 16f; setTypeface(typeface, Typeface.BOLD)
            setPadding((14 * d).toInt(), 0, (6 * d).toInt(), 0); gravity = Gravity.CENTER_VERTICAL
            setOnClickListener { showPages(it) }
        }
        bubbleBtn = Button(this).apply {
            textSize = 13f; isAllCaps = false; setTextColor(Color.WHITE)
            setBackgroundColor(0x33FFFFFF); setPadding((10 * d).toInt(), 0, (10 * d).toInt(), 0)
            setOnClickListener { toggleBubble() }
        }
        val more = TextView(this).apply {
            text = "⋮"; textSize = 22f; setTextColor(Color.WHITE); gravity = Gravity.CENTER
            setPadding((14 * d).toInt(), 0, (14 * d).toInt(), 0)
            setOnClickListener { showMore(it) }
        }
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; setBackgroundColor(getColor(R.color.cam_dam)); gravity = Gravity.CENTER_VERTICAL
            addView(title, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f))
            addView(bubbleBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, (34 * d).toInt()))
            addView(more, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
        }
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { isIndeterminate = true; visibility = View.GONE }

        // ---- trang web
        web = WebView(this)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true          // Supabase lưu đăng nhập trong localStorage
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false   // chuông đơn mới ở bếp
            allowFileAccess = false
            userAgentString = "$userAgentString BenocApp/${BuildConfigCompat.version(this@MainActivity)}"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        web.addJavascriptInterface(WebBridge(this), "BenocApp")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest) = handleUrl(req.url)
            override fun onPageFinished(view: WebView, url: String) {
                progress.visibility = View.GONE
                view.evaluateJavascript(INJECT, null)
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCb?.onReceiveValue(null); fileCb = cb
                val wantsCamera = params.isCaptureEnabled && params.acceptTypes.any { it.isEmpty() || it.startsWith("image") }
                if (wantsCamera) {
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) launchCamera()
                    else cameraForFile.launch(Manifest.permission.CAMERA)
                } else {
                    try { pickFile.launch(params.createIntent()) } catch (_: ActivityNotFoundException) { fileCb = null; return false }
                }
                return true
            }
            override fun onPermissionRequest(req: PermissionRequest) {
                runOnUiThread {
                    val cam = req.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    if (!cam) { req.deny(); return@runOnUiThread }
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) req.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                    else { pendingPerm = req; cameraPerm.launch(Manifest.permission.CAMERA) }
                }
            }
        }

        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            fitSystemBars(this)
            addView(bar, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (48 * d).toInt()))
            addView(progress, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (3 * d).toInt()))
            addView(web, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        })

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else finish() }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else if (prefs.page.isEmpty()) { openPage("quanly.html"); if (!prefs.ready) firstRunHint() }
        else openPage(prefs.page)
    }

    override fun onResume() { super.onResume(); refreshBar() }
    override fun onSaveInstanceState(out: Bundle) { super.onSaveInstanceState(out); web.saveState(out) }

    // ------------------------------------------------------------------ màn hình POS
    private fun baseUrl() = Prefs.SITE + if (prefs.testEnv) "test/" else ""

    private fun openPage(path: String) {
        prefs.page = path
        progress.visibility = View.VISIBLE
        web.loadUrl(baseUrl() + path)
        refreshBar()
        // Bếp / pha chế: giữ màn hình luôn sáng
        if (path.startsWith("bep") || path.startsWith("phache")) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun refreshBar() {
        val name = pages.firstOrNull { it.first == prefs.page }?.second ?: "Bé Nốc POS"
        title.text = name + (if (prefs.testEnv) " · TEST" else "") + "  ▾"
        bubbleBtn.text = if (BubbleService.running) "● Tắt nút chụp" else "📸 Nút chụp đơn"
        bubbleBtn.setBackgroundColor(if (prefs.testEnv) 0x667C3AED else 0x33FFFFFF)
    }

    private fun showPages(anchor: View) {
        PopupMenu(this, anchor).apply {
            pages.forEachIndexed { i, (_, n) -> menu.add(0, i, i, n) }
            setOnMenuItemClickListener { openPage(pages[it.itemId].first); true }
        }.show()
    }

    private fun showMore(anchor: View) {
        PopupMenu(this, anchor).apply {
            menu.add(0, 1, 1, "Cài đặt chụp đơn")
            menu.add(0, 2, 2, "Sửa đơn vừa gửi")
            menu.add(0, 3, 3, "Tải lại trang")
            menu.add(0, 4, 4, if (prefs.testEnv) "Chuyển sang PRODUCT (quán dùng thật)" else "Chuyển sang TEST")
            menu.add(0, 5, 5, "Phiên bản " + BuildConfigCompat.version(this@MainActivity))
            setOnMenuItemClickListener {
                when (it.itemId) {
                    1 -> startActivity(Intent(this@MainActivity, SettingsActivity::class.java))
                    2 -> startActivity(Intent(this@MainActivity, EditOrderActivity::class.java))
                    3 -> web.reload()
                    4 -> {
                        prefs.testEnv = !prefs.testEnv
                        openPage(prefs.page.ifEmpty { "quanly.html" })
                        BubbleService.refresh(this@MainActivity)
                        if (prefs.testEnv && !prefs.readyFor(true))
                            Toast.makeText(this@MainActivity, "Nút chụp đơn ở TEST cần mã bí mật TEST: ⋮ → Cài đặt chụp đơn.", Toast.LENGTH_LONG).show()
                    }
                }
                true
            }
        }.show()
    }

    private fun toggleBubble() {
        if (BubbleService.running) { BubbleService.stop(this); bubbleBtn.postDelayed({ refreshBar() }, 300) }
        else StartCaptureActivity.start(this, goHome = false)
    }

    private fun firstRunHint() {
        Toast.makeText(this, "Muốn dùng nút chụp đơn: ⋮ → Cài đặt chụp đơn → nhập mã bí mật.", Toast.LENGTH_LONG).show()
    }

    // ------------------------------------------------------------------ liên kết ngoài, in RawBT
    private fun handleUrl(u: Uri): Boolean {
        val s = u.toString()
        return when (u.scheme) {
            "http", "https" -> if (u.host == Uri.parse(Prefs.SITE).host) false else { open(Intent(Intent.ACTION_VIEW, u)); true }
            "intent" -> {
                val i = runCatching { Intent.parseUri(s, Intent.URI_INTENT_SCHEME) }.getOrNull() ?: return true
                i.addCategory(Intent.CATEGORY_BROWSABLE); i.component = null; i.selector = null
                try { startActivity(i) } catch (_: ActivityNotFoundException) {
                    val fb = i.getStringExtra("browser_fallback_url")
                    when {
                        fb != null -> open(Intent(Intent.ACTION_VIEW, Uri.parse(fb)))
                        i.`package` != null -> open(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + i.`package`)))
                        else -> Toast.makeText(this, "Không mở được ứng dụng cần dùng", Toast.LENGTH_SHORT).show()
                    }
                }
                true
            }
            else -> { open(Intent(Intent.ACTION_VIEW, u)); true }   // tel:, zalo:, rawbt:, market:…
        }
    }

    private fun open(i: Intent) {
        try { startActivity(i) } catch (_: ActivityNotFoundException) { Toast.makeText(this, "Chưa có ứng dụng mở được liên kết này", Toast.LENGTH_SHORT).show() }
    }

    // ------------------------------------------------------------------ chụp ảnh cho ô chọn ảnh (chấm công, ảnh món)
    private fun launchCamera() {
        val dir = File(cacheDir, "anh").apply { mkdirs() }
        val f = File.createTempFile("chup", ".jpg", dir)
        photoUri = FileProvider.getUriForFile(this, "vn.benoc.pos.files", f)
        try { takePhoto.launch(photoUri!!) } catch (_: ActivityNotFoundException) { fileCb?.onReceiveValue(null); fileCb = null }
    }

    /** Lưu file trang web gửi sang (Xuất Excel…) vào thư mục Tải xuống. */
    fun saveDownload(name: String, mime: String, b64: String) {
        runCatching {
            val bytes = Base64.decode(b64, Base64.DEFAULT)
            val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { "tai-ve" }
            if (Build.VERSION.SDK_INT >= 29) {
                val cv = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, safe); put(MediaStore.Downloads.MIME_TYPE, mime)
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv) ?: error("không tạo được file")
                contentResolver.openOutputStream(uri)!!.use { it.write(bytes) }
                runOnUiThread {
                    Toast.makeText(this, "✅ Đã lưu vào Tải xuống: $safe", Toast.LENGTH_LONG).show()
                    open(Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                }
            } else {
                val f = File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), safe)
                f.writeBytes(bytes)
                runOnUiThread { Toast.makeText(this, "✅ Đã lưu: ${f.absolutePath}", Toast.LENGTH_LONG).show() }
            }
        }.onFailure { e -> runOnUiThread { Toast.makeText(this, "⚠️ Không lưu được file: ${e.message}", Toast.LENGTH_LONG).show() } }
    }

    companion object {
        /** Bắt các lệnh tải file (a[download] với blob:/data:) để app lưu vào máy; báo cho trang biết đang chạy trong app */
        private val INJECT = """
            (function(){
              if (window.__benocApp) return; window.__benocApp = true;
              document.documentElement.classList.add('in-app');
              function send(a){
                var href = a.href || ''; if (!/^(blob:|data:)/.test(href)) return false;
                fetch(href).then(function(r){ return r.blob(); }).then(function(b){
                  var fr = new FileReader();
                  fr.onload = function(){ var s = String(fr.result); BenocApp.saveFile(a.download || 'tai-ve', b.type || 'application/octet-stream', s.slice(s.indexOf(',') + 1)); };
                  fr.readAsDataURL(b);
                });
                return true;
              }
              var click = HTMLAnchorElement.prototype.click;
              HTMLAnchorElement.prototype.click = function(){ if (this.hasAttribute('download') && send(this)) return; return click.apply(this, arguments); };
              document.addEventListener('click', function(e){
                var a = e.target && e.target.closest && e.target.closest('a[download]');
                if (a && send(a)) e.preventDefault();
              }, true);
            })();
        """.trimIndent()
    }
}

/** Cầu nối JavaScript → Android (window.BenocApp) */
class WebBridge(private val a: MainActivity) {
    @JavascriptInterface fun saveFile(name: String, mime: String, b64: String) = a.saveDownload(name, mime, b64)
    @JavascriptInterface fun isApp() = true
}

/** Android 15 vẽ tràn dưới thanh trạng thái / thanh điều hướng: chừa lề đúng bằng các thanh đó (và bàn phím). */
fun fitSystemBars(v: View) {
    v.setOnApplyWindowInsetsListener { view, ins ->
        if (Build.VERSION.SDK_INT >= 30) {
            val b = ins.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.ime())
            view.setPadding(b.left, b.top, b.right, b.bottom)
        } else {
            @Suppress("DEPRECATION")
            view.setPadding(ins.systemWindowInsetLeft, ins.systemWindowInsetTop, ins.systemWindowInsetRight, ins.systemWindowInsetBottom)
        }
        ins
    }
}

object BuildConfigCompat {
    fun version(a: android.content.Context): String =
        runCatching { a.packageManager.getPackageInfo(a.packageName, 0).versionName }.getOrNull() ?: "1.0"
}
