# MUSIC-CHILL

Vừa nghe nhạc SoundCloud vừa luyện gõ phím.

## Gõ phím (kiểu Monkeytype)
- Tự dán đoạn văn của mình (＋ đoạn mới), chọn đoạn ở ô thả xuống, gõ hết đoạn là hiện kết quả.
- Kết quả: WPM, độ chính xác, raw, ký tự đúng/sai/thừa/thiếu, độ đều tay, biểu đồ theo từng giây, kỷ lục từng đoạn.
- Gõ tiếng Việt có dấu bằng Unikey/Telex được; hoặc bật "không dấu".
- `Tab` gõ lại từ đầu, `Enter` gõ lại khi đang xem kết quả.

## Nhạc
- Mỗi link SoundCloud có **Start → End**; chế độ **lặp danh sách** hoặc **lặp 1 bài** (đổi được ngay trên thanh nhạc mini lúc gõ).
- Link hỏng / riêng tư tự bỏ qua; bài kế tiếp được tải sẵn để chuyển nhanh; vẫn tự chuyển bài khi tab bị ẩn.

## Lưu ở đâu
- Danh sách nhạc: `playlist.json`. Các đoạn gõ: `texts.json`. Cả hai lưu trong repo này qua GitHub API
  (bấm **Kết nối GitHub** ở tab Nhạc, dán token fine-grained chỉ cho repo này, quyền Contents: Read and write).
- Kỷ lục gõ phím lưu trên trình duyệt.

Không cần build: `index.html` + `typing.js`, chạy bằng GitHub Pages.
