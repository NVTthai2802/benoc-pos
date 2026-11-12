# Mô hình OCR trên máy

| File | Nguồn | Giấy phép |
|---|---|---|
| det.onnx | [PaddlePaddle/PP-OCRv5_mobile_det_onnx](https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx) | Apache-2.0 |
| rec.onnx | [PaddlePaddle/latin_PP-OCRv5_mobile_rec_onnx](https://huggingface.co/PaddlePaddle/latin_PP-OCRv5_mobile_rec_onnx) | Apache-2.0 |
| rec_dict.txt | bảng ký tự lấy từ `inference.yml` của rec (836 ký tự, 1 ký tự / dòng) | Apache-2.0 |

**Lưu ý:** bản `latin` gốc **không có lớp** cho 90/134 chữ tiếng Việt có dấu (ả, ạ, ầ, ế, ọ, ữ…),
nên các chữ đó bị bỏ mất. Đây chỉ là mốc so sánh. Bước tiếp theo: fine-tune rec với bảng ký tự
mở rộng đủ tiếng Việt, rồi thay `rec.onnx` + `rec_dict.txt` + `model.txt` ở đây và build lại.
