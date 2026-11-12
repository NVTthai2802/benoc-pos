# Cầu nối JavaScript ↔ Android của WebView
-keepclassmembers class vn.benoc.pos.WebBridge { @android.webkit.JavascriptInterface <methods>; }

# ONNX Runtime gọi ngược từ mã máy (JNI): giữ nguyên lớp
-keep class ai.onnxruntime.** { *; }
