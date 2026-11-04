package vn.benoc.pos

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.nio.FloatBuffer
import java.text.Normalizer
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Lõi OCR thuần Kotlin (không dùng lớp Android) để chạy kiểm tra được cả trên máy tính:
 * nhận ảnh dạng mảng điểm ARGB, trả các dòng chữ. Giống hệt tools/ocr/ocr_ref.py.
 *   1. det (DB): bản đồ xác suất có chữ → các hộp chữ (ảnh chụp màn hình không nghiêng nên dùng hộp thẳng)
 *   2. rec (SVTR + CTC): từng hộp → chuỗi ký tự
 */
class OcrCore(private val env: OrtEnvironment, private val det: OrtSession, private val rec: OrtSession, private val chars: List<String>) {
    class Timed(val lines: List<OcrLine>, val detMs: Long, val recMs: Long)

    companion object {
        const val DET_MAX_SIDE = 960
        const val DET_THRESH = 0.3f
        const val BOX_THRESH = 0.6f
        const val UNCLIP = 1.5f
        const val REC_H = 48
        const val REC_MAX_W = 1600
        private val DET_MEAN = floatArrayOf(0.485f, 0.456f, 0.406f)   // áp theo thứ tự kênh B, G, R như PaddleOCR
        private val DET_STD = floatArrayOf(0.229f, 0.224f, 0.225f)

        fun options(threads: Int) = OrtSession.SessionOptions().apply {
            setIntraOpNumThreads(threads)
            setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
        }

        /** Co giãn song tuyến (bilinear, tâm điểm ảnh như OpenCV INTER_LINEAR) một vùng của ảnh ARGB.
         *  Ghi vào out theo kênh B, G, R (CHW), mỗi giá trị qua hàm norm(kênh, 0..255). */
        fun resizeChw(src: IntArray, sw: Int, x0: Int, y0: Int, cw: Int, ch: Int, nw: Int, nh: Int, out: FloatArray, norm: (Int, Float) -> Float) {
            val plane = nw * nh
            val fx = cw.toFloat() / nw; val fy = ch.toFloat() / nh
            for (y in 0 until nh) {
                val syf = ((y + 0.5f) * fy - 0.5f).coerceIn(0f, ch - 1f)
                val ya = syf.toInt(); val yb = min(ch - 1, ya + 1); val wy = syf - ya
                val ra = (y0 + ya) * sw + x0; val rb = (y0 + yb) * sw + x0
                for (x in 0 until nw) {
                    val sxf = ((x + 0.5f) * fx - 0.5f).coerceIn(0f, cw - 1f)
                    val xa = sxf.toInt(); val xb = min(cw - 1, xa + 1); val wx = sxf - xa
                    val p00 = src[ra + xa]; val p01 = src[ra + xb]; val p10 = src[rb + xa]; val p11 = src[rb + xb]
                    val i = y * nw + x
                    for (c in 0..2) {
                        val sh = c * 8   // c=0 → B (bit 0–7), 1 → G, 2 → R
                        val v = ((p00 shr sh) and 0xff) * (1 - wx) * (1 - wy) + ((p01 shr sh) and 0xff) * wx * (1 - wy) +
                            ((p10 shr sh) and 0xff) * (1 - wx) * wy + ((p11 shr sh) and 0xff) * wx * wy
                        out[c * plane + i] = norm(c, v)
                    }
                }
            }
        }
    }

    fun run(px: IntArray, w: Int, h: Int): Timed {
        val t0 = System.nanoTime()
        val boxes = detect(px, w, h)
        val t1 = System.nanoTime()
        val lines = ArrayList<OcrLine>(boxes.size)
        for (b in boxes) {
            val (t, c) = recognize(px, w, b[0], b[1], b[2], b[3])
            if (t.isNotBlank()) lines.add(OcrLine(b[0], b[1], b[2], b[3], t, c))
        }
        return Timed(lines, (t1 - t0) / 1_000_000, (System.nanoTime() - t1) / 1_000_000)
    }

    // ------------------------------------------------------------------ 1. phát hiện vùng chữ
    fun detect(px: IntArray, w: Int, h: Int): List<IntArray> {
        val s = min(1f, DET_MAX_SIDE.toFloat() / max(w, h))
        val nw = max(32, (w * s / 32f).roundToInt() * 32)
        val nh = max(32, (h * s / 32f).roundToInt() * 32)
        val plane = nw * nh
        val buf = FloatBuffer.allocate(3 * plane)
        resizeChw(px, w, 0, 0, w, h, nw, nh, buf.array()) { c, v -> (v / 255f - DET_MEAN[c]) / DET_STD[c] }
        val prob = FloatArray(plane)
        OnnxTensor.createTensor(env, buf, longArrayOf(1, 3, nh.toLong(), nw.toLong())).use { x ->
            det.run(mapOf(det.inputNames.first() to x)).use { out -> (out[0] as OnnxTensor).floatBuffer.get(prob) }
        }
        // Gom điểm ảnh > ngưỡng thành từng vùng liền nhau (4 hướng)
        val label = IntArray(plane)
        val stack = IntArray(plane)
        val sx = w.toFloat() / nw; val sy = h.toFloat() / nh
        val boxes = ArrayList<IntArray>()
        var id = 0
        for (start in 0 until plane) {
            if (label[start] != 0 || prob[start] <= DET_THRESH) continue
            id++
            var sp = 0; stack[sp++] = start; label[start] = id
            var x0 = nw; var y0 = nh; var x1 = -1; var y1 = -1; var sum = 0.0; var n = 0
            while (sp > 0) {
                val q = stack[--sp]; val qx = q % nw; val qy = q / nw
                sum += prob[q]; n++
                if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy
                if (qx > 0) { val r = q - 1; if (label[r] == 0 && prob[r] > DET_THRESH) { label[r] = id; stack[sp++] = r } }
                if (qx < nw - 1) { val r = q + 1; if (label[r] == 0 && prob[r] > DET_THRESH) { label[r] = id; stack[sp++] = r } }
                if (qy > 0) { val r = q - nw; if (label[r] == 0 && prob[r] > DET_THRESH) { label[r] = id; stack[sp++] = r } }
                if (qy < nh - 1) { val r = q + nw; if (label[r] == 0 && prob[r] > DET_THRESH) { label[r] = id; stack[sp++] = r } }
            }
            val bw = x1 - x0 + 1; val bh = y1 - y0 + 1
            if (min(bw, bh) < 3 || sum / n < BOX_THRESH) continue
            val d = bw * bh * UNCLIP / (2f * (bw + bh))      // nới hộp như DB "unclip" (với hình chữ nhật)
            val X0 = max(0f, (x0 - d) * sx).toInt(); val Y0 = max(0f, (y0 - d) * sy).toInt()
            val X1 = min(w.toFloat(), (x0 + bw + d) * sx).toInt(); val Y1 = min(h.toFloat(), (y0 + bh + d) * sy).toInt()
            if (X1 - X0 < 6 || Y1 - Y0 < 6) continue
            boxes.add(intArrayOf(X0, Y0, X1, Y1))
        }
        // Thứ tự đọc: theo hàng (10px) rồi trái sang phải, giống bản Python
        return boxes.sortedWith(compareBy({ it[1] / 10 }, { it[0] }))
    }

    // ------------------------------------------------------------------ 2. đọc chữ một hộp
    fun recognize(src: IntArray, sw: Int, x0: Int, y0: Int, x1: Int, y1: Int): Pair<String, Float> {
        val cw = x1 - x0; val ch = y1 - y0
        val nw = min(REC_MAX_W, max(16, ceil(REC_H.toDouble() * cw / ch).toInt()))
        val buf = FloatBuffer.allocate(3 * REC_H * nw)
        resizeChw(src, sw, x0, y0, cw, ch, nw, REC_H, buf.array()) { _, v -> (v / 255f - 0.5f) / 0.5f }
        OnnxTensor.createTensor(env, buf, longArrayOf(1, 3, REC_H.toLong(), nw.toLong())).use { x ->
            rec.run(mapOf(rec.inputNames.first() to x)).use { out ->
                val t = out[0] as OnnxTensor
                val shape = t.info.shape   // [1, T, C]
                val steps = shape[1].toInt(); val cls = shape[2].toInt()
                val fb = t.floatBuffer
                val sb = StringBuilder(); var conf = 0f; var n = 0; var prev = -1
                val row = FloatArray(cls)
                for (k in 0 until steps) {
                    fb.get(row)
                    var best = 0; var bp = row[0]
                    for (j in 1 until cls) if (row[j] > bp) { bp = row[j]; best = j }
                    if (best != prev && best != 0) {   // CTC: bỏ blank (0), gộp ký tự lặp liền nhau
                        sb.append(if (best - 1 < chars.size) chars[best - 1] else " ")
                        conf += bp; n++
                    }
                    prev = best
                }
                return Normalizer.normalize(sb.toString(), Normalizer.Form.NFC) to (if (n > 0) conf / n else 0f)
            }
        }
    }
}
