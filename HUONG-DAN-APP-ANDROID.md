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
3. **⋮** → **Chuyển sang TEST** khi muốn thử trên môi trường Test (thanh tiêu đề có chữ **TEST**).

## Cài nút chụp đơn

1. **⋮** → **Cài đặt chụp đơn**:
   - **Mã bí mật**: giống mã `x-capture-key` trong Phím tắt iPhone (hỏi người quản lý POS).
   - **Tên máy**: tự điền `android-<tên máy>`. Không trùng máy khác.
   - **Đợi kết quả từng ảnh**: để **tắt** (chụp liên tục được).
   - Bấm **Lưu và kiểm tra kết nối** → phải hiện **✅ Kết nối được bot**.
2. Về màn hình chính, bấm **📸 Nút chụp đơn** trên thanh cam:
   - Lần đầu Android mở trang **Hiển thị trên ứng dụng khác** → bật cho **Bé Nốc POS** → quay lại app → bấm **📸 Nút chụp đơn** lần nữa.
   - Cho phép **thông báo**.
   - Android hỏi **bắt đầu ghi / chia sẻ màn hình** → chọn **Toàn bộ màn hình** (nếu có lựa chọn) → **Bắt đầu**.
3. Nút tròn cam hiện lên, thanh thông báo có **"Nút chụp đơn đang bật"**.

Mỗi lần khởi động lại điện thoại hoặc tắt nút thì bấm **📸 Nút chụp đơn** lại (Android bắt xác nhận ghi màn hình mỗi lần bật).

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
| ⛔ Sai mã x-capture-key | Sửa mã trong **Cài đặt chụp đơn** |
| Bấm **📸 Nút chụp đơn** không thấy nút cam | Chưa bật **Hiển thị trên ứng dụng khác**: Cài đặt → Ứng dụng → Bé Nốc POS → bật |
| Nút cam biến mất sau một lúc | Máy tắt app chạy nền để tiết kiệm pin: Cài đặt → Ứng dụng → Bé Nốc POS → **Pin** → **Không hạn chế**. Xiaomi / Oppo / Vivo thêm **Tự khởi động** |
| Ảnh gửi đi bị đen | App kia chặn chụp màn hình (ngân hàng…); Messenger / Zalo không bị |
| ⚠️ Chưa lấy được hình | Chạm lại nút |
| Chạm xong mà bếp không có đơn (sau ~30 giây) | Ảnh không có đoạn chat đặt món hoặc AI quá tải: chụp lại. Muốn biết lý do: bật **Đợi kết quả từng ảnh** rồi chụp lại |
| Không đăng nhập được / trang trắng | **⋮** → **Tải lại trang**; kiểm tra mạng |

## Bảo mật

- Mã bí mật chỉ lưu trên điện thoại (không có trong file APK). Máy mất / nhân viên nghỉ: đổi secret `CAPTURE_KEY` trên Supabase, nhập mã mới cho các máy còn dùng (cả Phím tắt iPhone).
- Ảnh chụp gửi cho AI (Google Gemini) để đọc và lưu ở kho ảnh riêng tư của quán, giống bot Zalo.

---

<details>
<summary>Dành cho người phát triển: build lại APK</summary>

Mã nguồn ở `android/` (Kotlin, không dùng thư viện ngoài ngoài AndroidX). Cần JDK 17+, Android SDK 35.

```bash
cd android
echo "sdk.dir=/đường/dẫn/android-sdk" > local.properties
# khoá ký: keystore.properties (storeFile, storePassword, keyAlias, keyPassword) — KHÔNG đưa lên git
./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../app/benoc-pos.apk
```

Phải ký bằng **cùng khoá** thì điện thoại mới cài đè được; mất khoá thì phải gỡ app cũ rồi cài lại (mất đăng nhập). Tăng `versionCode` / `versionName` trong `android/app/build.gradle.kts` mỗi lần phát hành.

| Tệp | Việc |
|---|---|
| `MainActivity.kt` | WebView trang POS, đổi màn hình, mở RawBT (`intent:`), camera / chọn ảnh, lưu file tải về |
| `StartCaptureActivity.kt` | Xin quyền hiện trên app khác, thông báo, ghi màn hình (Android 14+: chỉ toàn màn hình) |
| `BubbleService.kt` | Dịch vụ nền: nút nổi, giữ phiên MediaProjection, chạm → lấy 1 khung hình → JPEG → `bot-don` |
| `EditOrderActivity.kt` | Ô sửa đơn (gửi chữ cho bot) |
| `SettingsActivity.kt`, `Prefs.kt`, `BotClient.kt` | Cài đặt, gọi `bot-don` (tiêu đề `x-capture-key`, `x-device`, tuỳ chọn `x-wait`) |

App dùng chung kênh `ios` của `bot-don` (cập nhật 33), phân biệt máy bằng `x-device`.

</details>
