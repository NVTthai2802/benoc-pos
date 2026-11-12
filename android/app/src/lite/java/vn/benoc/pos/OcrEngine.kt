package vn.benoc.pos

import android.content.Context
import android.graphics.Bitmap

/**
 * Bản build "lite" (bản đăng trên trang quán): KHÔNG có OCR, không kèm ONNX Runtime + mô hình (~60MB),
 * APK nhẹ như cũ. OCR trên máy chỉ có ở bản "ocr" (src/ocr/).
 */
object OcrEngine {
    const val available = false
    val model = ""
    fun load(ctx: Context) {}
    fun run(ctx: Context, bmp: Bitmap): OcrResult = throw UnsupportedOperationException("Bản app này không có OCR")
}
