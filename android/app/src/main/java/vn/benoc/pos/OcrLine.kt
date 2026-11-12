package vn.benoc.pos

/** Một dòng chữ OCR đọc được: hộp (toạ độ trên ảnh gửi bot) + chữ + độ tin cậy 0..1. Thuần Kotlin. */
data class OcrLine(val x0: Int, val y0: Int, val x1: Int, val y1: Int, val text: String, val conf: Float)
