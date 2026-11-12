# App Android "Bé Nốc POS" (APK)

Một app gồm 2 phần:

1. **Phần mềm POS**: Quản lý / chấm công, Bếp, Pha chế, Menu khách. Đây là trang web của quán mở sẵn trong app (luôn là bản mới nhất, không cần cài lại khi web cập nhật).
2. **Nút chụp đơn**: nút tròn cam nổi trên Messenger / Zalo. **Chạm** là chụp màn hình gửi bot, đơn vào thẳng bếp / pha chế với nhãn **ĐƠN ONLINE**, giống Phím tắt iPhone.

Cần Android 8 trở lên.

---

## Cài app

1. Trên điện thoại Android, mở Chrome vào: **https://benoc-pos.pages.dev/app/benoc-pos.apk**
2. Tải xong bấm **Mở**. Lần đầu Android hỏi *"Cho phép cài ứng dụng không rõ nguồn"* → **Cài đặt** → bật **Cho phép từ nguồn này** → quay lại → **Cài đặt**.
3. Play Protect có thể cảnh báo *"ứng dụng chưa được xác minh"* (vì app không đưa lên CH Play) → **Chi tiết khác** → **Vẫn cài đặt**.

Cập nhật bản mới: tải lại link trên rồi cài đè, dữ liệu và đăng nhập vẫn giữ.

## Lần đầu mở app

1. App mở **Quản lý**. Đăng nhập như trên web.
2. Bấm tên màn hình trên thanh cam (vd *Quản lý / chấm công ▾*) để đổi sang **Bếp**, **Pha chế** hoặc **Menu khách**. App nhớ màn hình đã chọn. Bếp và Pha chế giữ màn hình luôn sáng.
3. **⋮** → **Chuyển sang TEST** khi muốn thử trên môi trường Test (thanh tiêu đề có chữ **TEST**). Từ bản 1.1, **nút chụp đơn cũng gửi theo môi trường này** (xem phần *PRODUCT và TEST* bên dưới).

## Cài nút chụp đơn

1. **⋮** → **Cài đặt chụp đơn**:
   - **Mã bí mật PRODUCT**: giống mã `x-capture-key` trong Phím tắt iPhone (hỏi người quản lý POS).
   - **Mã bí mật TEST**: mã riêng của Supabase Test (chỉ cần nếu dùng chế độ TEST).
   - **Tên máy**: tự điền `android-<tên máy>`. Không trùng máy khác.
   - **Đợi kết quả từng ảnh**: để **tắt** (chụp liên tục được).
   - Bấm **Lưu và kiểm tra kết nối** → phải hiện **✅ PRODUCT: kết nối được bot** (và **✅ TEST…** nếu đã nhập mã Test).
2. Về màn hình chính, bấm **📸 Nút chụp đơn** trên thanh cam:
   - Lần đầu Android mở trang **Hiển thị trên ứng dụng khác** → bật cho **Bé Nốc POS** → quay lại app → bấm **📸 Nút chụp đơn** lần nữa.
   - Cho phép **thông báo**.
   - Android hỏi **bắt đầu ghi / chia sẻ màn hình** → chọn **Toàn bộ màn hình** (nếu có lựa chọn) → **Bắt đầu**.
3. Nút tròn cam hiện lên, thanh thông báo có **"Nút chụp đơn đang bật"**.

Mỗi lần khởi động lại điện thoại hoặc tắt nút thì bấm **📸 Nút chụp đơn** lại (Android bắt xác nhận ghi màn hình mỗi lần bật).

## PRODUCT và TEST

Nút chụp đơn gửi vào **môi trường đang chọn trong app** (⋮ → Chuyển sang TEST / PRODUCT). Nhìn màu nút là biết:

| Nút | Gửi vào | Ghi chú |
|---|---|---|
| 🟠 **Cam** | **PRODUCT**: bếp của quán, **đơn thật** | Thông báo: *Nút chụp đơn · PRODUCT (đơn thật)* |
| 🟣 **Tím, huy hiệu vàng chữ T** | **TEST**: Supabase Test, quán không thấy | Mọi câu báo bắt đầu bằng **🧪 TEST ·** |

- Đổi môi trường khi nút đang bật thì nút đổi màu ngay, có báo *"Nút chụp đơn giờ gửi vào TEST / PRODUCT"*.
- Mỗi ảnh gửi vào môi trường **lúc chạm nút**; đổi môi trường ngay sau đó không làm ảnh vừa chụp đi nhầm chỗ.
- Ô **Sửa đơn** cũng theo môi trường (tiêu đề *🧪 Sửa đơn vừa gửi · TEST*).
- Chưa nhập **Mã bí mật TEST** mà ở chế độ TEST thì nút báo *"Chưa nhập mã bí mật TEST"*, **không gửi đi đâu cả** (không lọt sang Product).
- Phím tắt iPhone vẫn chỉ gửi vào Product.

### OCR trên máy (chỉ TEST)

Chỉ có ở **bản app `ocr`** (bản đăng trên trang quán không có, xem cuối trang). Ở chế độ **TEST**, mỗi lần chạm nút tím app tự **đọc chữ ngay trên điện thoại** (mô hình nhẹ PP-OCRv5 mobile, không cần mạng cho bước này) rồi gửi kèm ảnh. Gemini **vẫn lên đơn như cũ**; kết quả OCR chỉ lưu vào bảng `ocr_mau` của Supabase Test để so sánh (tốc độ, độ đúng).

- Sau khi chạm, câu báo có thêm dòng *🔤 OCR trên máy: …ms (tìm chữ … + đọc …), … dòng*.
- Xem chữ đọc được lần gần nhất: **⋮ → Cài đặt chụp đơn** → mục **OCR trên máy**.
- Tắt: bỏ chọn **Đọc chữ trên máy khi chụp ở TEST** trong Cài đặt.
- Lần chụp đầu sau khi mở app chậm hơn khoảng 1 giây (nạp mô hình).
- **PRODUCT không chạy OCR**, không gửi gì thêm.
- Supabase Test phải chạy `sql/cap-nhat-34-ocr-tren-may.sql` và deploy `bot-don` mới. Chưa chạy thì đơn vẫn lên, chỉ không lưu kết quả OCR.
- Mô hình hiện tại là bản gốc, **chưa đọc được nhiều chữ tiếng Việt có dấu** (ả, ạ, ế, ọ…), nên chữ hiện ra sẽ thiếu dấu, thiếu chữ. Đây là mốc để so sánh trước khi fine-tune. Chi tiết: `tools/ocr/README.md`.

## Dùng hằng ngày

| Làm gì | Kết quả |
|---|---|
| Mở đoạn chat đã chốt đơn trên Messenger / Zalo → **chạm nút cam** | Rung nhẹ, hiện **📥 Đã nhận ảnh** → mở chat khách khác, chạm tiếp |
| Đoạn chat dài: cuộn tiếp, chạm lần nữa | Ảnh của cùng khách chụp liền nhau gộp 1 đơn; chụp sau (90 phút, bếp chưa nhận) thì sửa đơn đó |
| **Giữ** nút cam (hoặc thông báo → **Sửa đơn**) | Ô sửa đơn: `thêm 1 trà đào`, `giờ 18h30`, `ship 12 ngõ 5…, sđt 09…`, `huỷ` → hiện kết quả của bot |
| **Kéo** nút cam | Di chuyển nút ra chỗ khác (app nhớ vị trí) |
| Thông báo → **Tắt** (hoặc bấm **● Tắt nút chụp** trong app) | Tắt nút và dừng ghi màn hình |

Lúc nút đang bật, Android hiện biểu tượng **ghi màn hình / truyền** ở thanh trạng thái: bình thường. App chỉ lấy hình **lúc chạm nút**, không quay video, không gửi gì khi không chạm.

Mỗi lần chạm là **đơn thật ở bếp**. Chụp nhầm thì giữ nút → `huỷ` ngay.

## Khác bản web trên trình duyệt

| Tính năng | Trong app |
|---|---|
| In phiếu qua **RawBT** | ✅ Chạy như Chrome |
| In **Bluetooth trực tiếp** (máy tem CLABEL qua Web Bluetooth) | ❌ App chưa hỗ trợ. Máy in tem dùng **Chrome** như cũ, hoặc chọn in tem qua RawBT |
| In bằng hộp thoại in của trình duyệt | ❌ Dùng Chrome |
| Chụp ảnh chấm công, quét mã vạch, ảnh món | ✅ (cho phép Camera khi được hỏi) |
| Xuất Excel | ✅ Lưu vào **Tải xuống** và tự mở file |
| Chuông đơn mới ở bếp, giữ màn hình sáng | ✅ |

## Khi có sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| ⛔ Sai mã x-capture-key | Sửa mã đúng môi trường trong **Cài đặt chụp đơn** (mã PRODUCT và TEST khác nhau) |
| 🧪 TEST · … AI đang quá tải / không lên đơn | Supabase Test chưa có khoá AI: thêm secret `GEMINI_API_KEY` cho project **benoc-pos-test** |
| Bấm **📸 Nút chụp đơn** không thấy nút cam | Chưa bật **Hiển thị trên ứng dụng khác**: Cài đặt → Ứng dụng → Bé Nốc POS → bật |
| Nút cam biến mất sau một lúc | Máy tắt app chạy nền để tiết kiệm pin: Cài đặt → Ứng dụng → Bé Nốc POS → **Pin** → **Không hạn chế**. Xiaomi / Oppo / Vivo thêm **Tự khởi động** |
| Ảnh gửi đi bị đen | App kia chặn chụp màn hình (ngân hàng…); Messenger / Zalo không bị |
| ⚠️ Chưa lấy được hình | Chạm lại nút |
| Chạm xong mà bếp không có đơn (sau ~30 giây) | Ảnh không có đoạn chat đặt món hoặc AI quá tải: chụp lại. Muốn biết lý do: bật **Đợi kết quả từng ảnh** rồi chụp lại |
| 🧪 Không thấy dòng *🔤 OCR* | Đang ở PRODUCT, hoặc đã tắt **OCR trên máy** trong Cài đặt |
| ⚠️ OCR lỗi: … | Ghi lại câu báo gửi người làm app; đơn vẫn gửi bình thường (không kèm OCR) |
| Không đăng nhập được / trang trắng | **⋮** → **Tải lại trang**; kiểm tra mạng |

## Bảo mật

- Mã bí mật chỉ lưu trên điện thoại (không có trong file APK). Máy mất / nhân viên nghỉ: đổi secret `CAPTURE_KEY` trên Supabase, nhập mã mới cho các máy còn dùng (cả Phím tắt iPhone).
- Ảnh chụp gửi cho AI (Google Gemini) để đọc và lưu ở kho ảnh riêng tư của quán, giống bot Zalo.

---

<details>
<summary>Dành cho người phát triển: build lại APK</summary>

Mã nguồn ở `android/` (Kotlin, AndroidX; bản `ocr` thêm ONNX Runtime). Cần JDK 17+, Android SDK 35.

Có **2 bản** cùng mã nguồn, cùng `applicationId` và khoá ký (cài đè qua lại được, giữ đăng nhập):

| Bản | Dung lượng | Dùng cho |
|---|---|---|
| `lite` | ~140 KB | Bản đăng trên trang quán (`app/benoc-pos.apk`). **Không có OCR** |
| `ocr` | ~39 MB | Test / đồ án: thêm OCR trên máy (ONNX Runtime + PP-OCRv5 mobile). Không đăng lên trang quán (Cloudflare Pages giới hạn 25 MB / file) |

```bash
cd android
echo "sdk.dir=/đường/dẫn/android-sdk" > local.properties
# khoá ký: keystore.properties (storeFile, storePassword, keyAlias, keyPassword) — KHÔNG đưa lên git
./gradlew assembleLiteRelease assembleOcrRelease
cp app/build/outputs/apk/lite/release/app-lite-release.apk ../app/benoc-pos.apk
# bản ocr: app/build/outputs/apk/ocr/release/app-ocr-release.apk → gửi thẳng file cho máy test, không đưa lên git
```

Phải ký bằng **cùng khoá** thì điện thoại mới cài đè được; mất khoá thì phải gỡ app cũ rồi cài lại (mất đăng nhập). Tăng `versionCode` / `versionName` trong `android/app/build.gradle.kts` mỗi lần phát hành.

| Tệp | Việc |
|---|---|
| `MainActivity.kt` | WebView trang POS, đổi màn hình, mở RawBT (`intent:`), camera / chọn ảnh, lưu file tải về |
| `StartCaptureActivity.kt` | Xin quyền hiện trên app khác, thông báo, ghi màn hình (Android 14+: chỉ toàn màn hình) |
| `BubbleService.kt` | Dịch vụ nền: nút nổi, giữ phiên MediaProjection, chạm → lấy 1 khung hình → JPEG → `bot-don` |
| `EditOrderActivity.kt` | Ô sửa đơn (gửi chữ cho bot) |
| `SettingsActivity.kt`, `Prefs.kt`, `BotClient.kt` | Cài đặt, gọi `bot-don` (tiêu đề `x-capture-key`, `x-device`, tuỳ chọn `x-wait`; bản ocr gửi multipart `anh` + `ocr`) |
| `OcrLine.kt`, `OcrResult.kt` | Kiểu dữ liệu kết quả OCR (dùng chung 2 bản) |
| `src/ocr/…/OcrCore.kt` | Lõi OCR thuần Kotlin (det DB + rec CTC), giống hệt `tools/ocr/ocr_ref.py`; chạy được cả trên máy tính để đối chiếu |
| `src/ocr/…/OcrEngine.kt`, `src/ocr/assets/ocr/` | Nạp mô hình từ assets, chạy OCR một ảnh. Thay mô hình: xem `tools/ocr/README.md` |
| `src/lite/…/OcrEngine.kt` | Bản rỗng (`available = false`) cho bản lite |

App dùng chung kênh `ios` của `bot-don` (cập nhật 33), phân biệt máy bằng `x-device`. Địa chỉ bot: PRODUCT `hixdacnaxfuxuccbajzn…/bot-don`, TEST `bsnpcinocphuruahpzwr…/bot-don`; mỗi project có secret `CAPTURE_KEY` riêng.

| Phiên bản | Thay đổi |
|---|---|
| 1.2 | Tách 2 bản `lite` / `ocr`. Bản `ocr`: OCR trên máy ở chế độ TEST, gửi kèm ảnh, lưu bảng `ocr_mau` (cập nhật 34) để so với Gemini |
| 1.1 | Nút chụp gửi theo môi trường đang chọn (mã / địa chỉ riêng PRODUCT và TEST), nút tím khi TEST |
| 1.0 | Bản đầu: POS trong WebView + nút nổi chụp đơn (luôn gửi PRODUCT) |

</details>
