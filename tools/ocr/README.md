# OCR trên máy — công cụ đo (Python)

App Android ở chế độ **TEST** tự đọc chữ ảnh chụp chat bằng PP-OCRv5 mobile (ONNX Runtime) và gửi kèm ảnh
vào `bot-don`. Gemini vẫn lên đơn; kết quả OCR lưu ở bảng `ocr_mau` (Supabase Test, cập nhật 34).
Mô hình nằm ở `android/app/src/ocr/assets/ocr/`.

| File | Việc |
|---|---|
| `ocr_ref.py` | Pipeline tham chiếu, **giống hệt** `OcrEngine.kt` (tiền xử lý, ngưỡng, unclip, giải mã CTC). Dùng để so kết quả app với máy tính |
| `gen_chat.py` | Sinh ảnh giả lập Messenger / Zalo (sáng / tối) kèm đáp án từng dòng — chỉ để đo nhanh |
| `eval_ocr.py` | Đo CER, CER bỏ dấu, số dòng đúng hết, thời gian trên một thư mục ảnh có đáp án |

```bash
pip install onnxruntime opencv-python-headless pillow pyyaml
cd tools/ocr
python3 gen_chat.py synth 20
A=../../android/app/src/ocr/assets/ocr
python3 eval_ocr.py synth $A/det.onnx $A/rec.onnx $A/rec_dict.txt
python3 ocr_ref.py anh-chat.png $A/det.onnx $A/rec.onnx $A/rec_dict.txt   # xem từng dòng
```

## Kết quả mốc (04/11/2026, 20 ảnh giả lập, cạnh dài 1600px như app chụp, CPU máy chủ 4 luồng)

| Mô hình rec | CER | CER bỏ dấu | Dòng đúng hết | Tìm chữ | Đọc chữ |
|---|---|---|---|---|---|
| `latin_PP-OCRv5_mobile_rec` (gốc) | 10,4% | 10,0% | 93/353 | ~345 ms | ~860 ms |

Kích thước ảnh đưa vào bước tìm chữ hầu như không đổi kết quả (736: 10,4% · 960: 10,4% · 1280: 10,2%), nên app dùng 960.
Đọc theo lô 8 dòng chậm hơn và làm lệch kết quả, nên app đọc từng dòng.

**Vì sao CER cao:** bảng ký tự của bản `latin` gốc **không có** 90/134 chữ tiếng Việt có dấu
(ả ạ ầ ấ ậ ẻ ẽ ẹ ề ế ệ ỉ ị ỏ ọ ồ ố ộ ờ ớ ợ ủ ụ ừ ứ ự ỳ ỷ ỹ ỵ … và chữ hoa). Mô hình không thể in ra các chữ đó nên
bỏ mất: "Đang hoạt động" → "Đang hot đng". Bản đa ngôn ngữ `PP-OCRv5_mobile_rec` (tiếng Trung) còn thiếu 108/134.
⇒ **Bắt buộc fine-tune rec** với bảng ký tự mở rộng đủ tiếng Việt. Bước tìm chữ (det) dùng nguyên được.

## Thay mô hình

Đặt `rec.onnx` + `rec_dict.txt` (1 ký tự / dòng, đúng thứ tự lớp; lớp 0 = blank, lớp cuối = dấu cách)
+ `model.txt` (tên hiện trong bảng `ocr_mau`) vào `android/app/src/ocr/assets/ocr/`, chạy `eval_ocr.py` để so,
rồi build lại APK. Không cần sửa code.

## Đọc kết quả từ máy thật

Supabase **Test** → SQL Editor:

```sql
select * from ocr_tong_hop;                                  -- trung bình theo mô hình
select created_at, det_ms, rec_ms, n_dong, cer_gemini, chu from ocr_mau order by id desc limit 20;
```

`cer_gemini` lấy đoạn chat Gemini chép ra làm đáp án tạm (Gemini chỉ chép các tin liên quan đơn, và có thể chép sai),
nên chỉ dùng để theo dõi xu hướng. Số liệu cho báo cáo: chép tay nguyên văn vào cột `dap_an` cho một tập ảnh
(ảnh ở bucket `don-anh`, đường dẫn cột `anh`) rồi đo bằng `eval_ocr.py`.
