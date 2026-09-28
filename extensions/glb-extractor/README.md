# GLB Extractor

Cocos Creator editor extension (>=3.8.8): quét toàn bộ file `.fbx` đã import
trong `assets/` của project, cho chọn 1 hoặc nhiều file, rồi trích xuất:

- **Mesh → `.glb`**: mỗi `cc.Mesh` sinh ra từ file fbx được dựng lại thành 1
  file `.glb` (glTF Binary) hợp lệ, mở được bằng Blender/Windows 3D
  Viewer/bất kỳ viewer glTF nào.
- **Texture nhúng**: ảnh nhúng trong fbx (nếu có) được copy nguyên vẹn ra
  file ảnh riêng (giữ đúng định dạng gốc: `.png`/`.jpg`/`.tga`...).

## Cơ chế (giống hướng đã dùng trong CocosInspectorCustom)

Cocos serialize asset trong `library/` có thể là JSON thường hoặc định dạng
nén riêng (CCON) tuỳ bản engine — thay vì tự đoán/parse định dạng đó (dễ đọc
sai mà không báo lỗi), extension nhờ **scene script**
([source/contributions/scene.ts](source/contributions/scene.ts)) chạy ngay
trong tiến trình Scene của Editor — nơi `cc.assetManager` thật đang sống —
load asset bằng uuid rồi lấy lại `mesh.struct` + `mesh.data` đã được CHÍNH
ENGINE giải mã sẵn. Panel ở tiến trình khác chỉ nhận lại kết quả này (qua
`Editor.Message.request('scene', 'execute-scene-script', ...)`) và dựng
thành container `.glb` chuẩn glTF 2.0
([source/core/glbBuilder.ts](source/core/glbBuilder.ts)) — cùng thuật toán
giải mã vertex-format (`cc.gfx.FormatInfos`) đã dùng trong
`CocosInspectorCustom/src/core/meshExport.ts`.

**Giới hạn (nói rõ, không giả vờ đầy đủ):**
- Chỉ dựng lại hình học (vị trí/normal/UV/màu) — không kèm material/texture
  reference bên trong `.glb`, không kèm khớp xương (skeleton) nên mesh có
  animation sẽ ra ở dáng tĩnh (bind pose).
- Cần **đang mở 1 Scene bất kỳ** trong Editor khi bấm "Trích xuất" — scene
  script chỉ chạy được khi tiến trình Scene tồn tại.
- Không xuất trực tiếp `.fbx`/skeleton — muốn có FBX thì mở `.glb` bằng
  Blender rồi `Export → FBX`.

## Cài đặt

```bash
npm install
npm run build
```

Bật extension trong `Extension Manager`, mở panel qua menu
`Panel → glb-extractor → GLB Extractor`.

## Sử dụng

1. Mở 1 Scene bất kỳ trong Editor (bắt buộc, để scene script chạy được).
2. Bấm **"🔍 Quét .fbx trong project"** — liệt kê mọi file `.fbx` đã import
   dưới `assets/`, kèm số Mesh/Texture nhúng của từng file.
3. Tick chọn file cần xuất (hoặc "Chọn tất cả"), chỉnh **Thư mục xuất** nếu
   cần (mặc định `<project>/extracted_glb`).
4. Bấm **"⬇ Trích xuất đã chọn"** — mỗi file fbx được xuất vào 1 thư mục con
   cùng tên, chứa các file `.glb` + ảnh nhúng (nếu có). Xem tiến trình/lỗi ở
   khung Log.

## Cấu trúc

```
package.json
source/
  main.ts                      # entry tien trinh chinh (menu "open-panel")
  global.ts                    # hang so + helper log
  contributions/
    scene.ts                    # scene script - doc mesh.struct/mesh.data qua cc.assetManager that
  core/
    fbxScan.ts                    # quet asset-db tim .fbx + sub-asset (Mesh/Texture)
    glbBuilder.ts                  # dung struct+buffer thanh container .glb (glTF 2.0)
    extract.ts                      # dieu phoi: goi scene script, ghi .glb, copy texture
  panels/default/
    index.ts                        # UI panel (quet, chon, xuat, log)
static/
  template/default/index.html
  style/default/index.css
```
