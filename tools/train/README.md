# Tự build mô hình đọc đơn cho bot Bé Nốc

Mục tiêu: dần thay AI API (Gemini / Claude) bằng mô hình của riêng quán, để **đỡ tốn tiền API** và **tin nhắn khách không phải gửi ra dịch vụ ngoài**. Làm theo từng bước, không bỏ API cho tới khi mô hình tự build đọc đúng gần bằng nó.

## Bước 0. Bot tự thu dữ liệu (đã có)

Mỗi lần khách nhắn, bot lưu 1 mẫu vào bảng `fb_train` (SQL cập nhật 24): đoạn chat **đã ẩn tên, SĐT, số tài khoản** (địa chỉ giữ nguyên), đơn đang ghi, đơn AI đọc ra.
Khi chủ quán **Duyệt** đơn, mẫu cuối của đơn được gắn thêm **đơn chủ quán duyệt = đáp án đúng**, kèm danh sách chỗ chủ quán phải sửa (`edits`: món / hình thức / giờ).

| Loại mẫu | Ý nghĩa | Dùng để |
|---|---|---|
| gold | đơn chủ quán đã duyệt | chấm điểm, tinh chỉnh |
| silver | đơn AI đọc (chưa ai kiểm) | học thêm, không dùng chấm điểm |
| huỷ | chủ quán huỷ đơn | bỏ |

Tải file: **Quản lý → Facebook → Cài đặt bot → Tải dữ liệu huấn luyện (.jsonl)**. File chứa đoạn chat và **địa chỉ giao hàng** của khách (tên, SĐT đã ẩn nhưng chỉ là cố gắng hết sức): **đừng đăng công khai**, và cân nhắc trước khi đưa lên Colab / dịch vụ ngoài.

## Bước 1. Đo AI API đang đọc đúng bao nhiêu %

```
python3 score.py baseline benoc-huan-luyen-2026-10-26.jsonl
```

Ra: đúng hết món, đúng hình thức nhận, đúng giờ, đúng cả đơn (trên các đơn gold). Đây là mốc mô hình tự build phải bắt kịp. Số đơn gold ít (dưới vài chục) thì con số chưa đáng tin.

## Bước 2. Chuẩn bị dữ liệu

```
python3 prepare.py benoc-huan-luyen-2026-10-26.jsonl --out data/
```

Ra `data/train.jsonl`, `data/val.jsonl` (chia theo khách), `data/stats.json`. Mỗi dòng: `input` (giờ hiện tại + đơn đang ghi + hội thoại) → `output` (JSON đơn). Thêm `--gold-only` nếu chỉ muốn mẫu có đáp án chủ quán duyệt.

## Bước 3. Chọn cách làm (từ dễ tới khó)

1. **Luật + từ điển**: viết tắt (`ts`, `tcdd`, `6r`), regex giờ và SĐT, so khớp gần đúng tên món. Không cần dữ liệu, làm trước để có mốc so sánh.
2. **PhoBERT / ViSoBERT**: phân loại ý định + gán nhãn từ (món, số lượng, tuỳ chọn, giờ), rồi nối với menu. Cần chuyển `train.jsonl` sang định dạng gán nhãn từ (chưa có script).
3. **ViT5 hoặc LLM nhỏ (Qwen 1.5B) + LoRA**: học thẳng `input` → `output` bằng `train.jsonl`, xử lý được "thêm 1 cái nữa", "đổi qua ship". Train trên Colab.

Chấm mô hình trên tập val:

```
python3 score.py model data/val.jsonl preds.jsonl      # preds.jsonl: {"id":…, "output":"<JSON mô hình sinh>"}
```

## Bước 4. Cắm vào bot (chưa làm)

Chạy mô hình trên máy chủ riêng (Edge Function của Supabase không chạy được PyTorch), cho bot gọi qua `askAi()` như một nhà cung cấp mới. Làm theo thứ tự:

1. **Chạy bóng**: mô hình đọc song song với API, chỉ ghi kết quả để so sánh, khách vẫn nhận trả lời từ API.
2. **Mô hình đọc trước**, chỗ nào không chắc thì hỏi API.
3. Chỉ khi điểm trên đơn thật bằng API mới bỏ API.

## Lưu ý quan trọng

- **SĐT và tên** bị ẩn (`<SDT>`, `<TEN>`), nên mô hình không học trích SĐT: khi chạy thật SĐT lấy bằng regex. **Địa chỉ được giữ nguyên**, mô hình học trích địa chỉ từ chính dữ liệu này (`output` có trường `address` là đoạn địa chỉ khách gửi).
- Trong lúc còn dùng API, tin nhắn khách vẫn gửi cho Google / Anthropic. Gemini gói miễn phí có thể dùng dữ liệu đó để cải thiện sản phẩm; bật Cloud Billing cho khoá hoặc dùng Claude API để tránh.
- Khách nhắn "xoá dữ liệu của tôi" thì bot xoá cả mẫu huấn luyện của khách đó. Dữ liệu đã tải về máy bạn thì bạn tự xoá.
