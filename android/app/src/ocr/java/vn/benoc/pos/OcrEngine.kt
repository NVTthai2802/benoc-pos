package vn.benoc.pos

import ai.onnxruntime.OrtEnvironment
import android.content.Context
import android.graphics.Bitmap
import kotlin.math.min

/**
 * (Bản build "ocr") OCR chạy ngay trên điện thoại: PP-OCRv5 mobile (ONNX Runtime). Phần xử lý ở OcrCore.
 * Mô hình ở assets/ocr/: det.onnx, rec.onnx, rec_dict.txt (1 ký tự / dòng), model.txt (tên hiển thị).
 * Đổi mô hình (vd bản fine-tune tiếng Việt): thay rec.onnx + rec_dict.txt + model.txt rồi build lại, không cần sửa code.
 */
object OcrEngine {
    /** Bản build này có OCR (bản "ocr"); bản "lite" thì false */
    const val available = true

    private var core: OcrCore? = null
    var model = ""
        private set

    /** Nạp mô hình (khoảng 0,3–1 giây, chỉ lần đầu). Gọi trên luồng nền. */
    @Synchronized
    fun load(ctx: Context) {
        if (core != null) return
        val am = ctx.assets
        val env = OrtEnvironment.getEnvironment()
        val opt = OcrCore.options(min(4, Runtime.getRuntime().availableProcessors()))
        val det = env.createSession(am.open("ocr/det.onnx").use { it.readBytes() }, opt)
        val rec = env.createSession(am.open("ocr/rec.onnx").use { it.readBytes() }, opt)
        val chars = am.open("ocr/rec_dict.txt").bufferedReader(Charsets.UTF_8).use { r -> r.readLines().map { it.trimEnd('\r') } }
        model = runCatching { am.open("ocr/model.txt").bufferedReader().use { it.readText().trim() } }.getOrDefault("PP-OCRv5 mobile")
        core = OcrCore(env, det, rec, chars)
    }

    /** Đọc chữ cả ảnh. Gọi trên luồng nền (không chạy song song 2 ảnh). */
    @Synchronized
    fun run(ctx: Context, bmp: Bitmap): OcrResult {
        load(ctx)
        val w = bmp.width; val h = bmp.height
        val px = IntArray(w * h).also { bmp.getPixels(it, 0, w, 0, 0, w, h) }
        val r = core!!.run(px, w, h)
        return OcrResult(r.lines, w, h, r.detMs, r.recMs, model)
    }
}
