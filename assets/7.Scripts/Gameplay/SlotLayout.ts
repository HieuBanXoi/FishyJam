import { _decorator, Camera, Component, director, Node, Sprite, UITransform, v3, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { Slot } from './Slot';
const { ccclass, property, executeInEditMode } = _decorator;

/**
 * Gắn vào node chứa các bể (Slots). Mỗi frame đo vùng màn hình đang thấy (theo camera render bể) rồi chia đều các bể
 * theo chiều dọc: mỗi bể 1 ô cao bằng nhau, phần hình của bể (từ đỉnh sao tới đáy khung) nằm giữa ô. Chạy được với
 * mọi độ phân giải / xoay ngang - màn thấp quá thì (khi chạy game) thu nhỏ bể cho vừa, không ghi scale vào scene.
 */
@ccclass('SlotLayout')
@executeInEditMode
export class SlotLayout extends Component {

    @property({ tooltip: 'Tắt để kéo tay vị trí các bể như cũ' })
    auto: boolean = true;

    @property({ slide: true, range: [0, 0.5], step: 0.005, tooltip: 'Lề trên, tính theo tỉ lệ chiều cao màn hình (0.05 = 5%)' })
    topMargin: number = 0.02;

    @property({ slide: true, range: [0, 0.5], step: 0.005, tooltip: 'Lề dưới, tính theo tỉ lệ chiều cao màn hình (chừa chỗ nút Play Now...)' })
    bottomMargin: number = 0.09;

    @property({ tooltip: 'Lệch cả cột bể theo chiều dọc (đơn vị local của Slots), dương = lên trên' })
    offsetY: number = 0;

    @property({ tooltip: 'Khi chạy game: màn thấp không đủ chỗ thì thu nhỏ bể cho vừa ô' })
    autoShrink: boolean = true;

    @property({ slide: true, range: [0, 0.5], step: 0.01, visible() { return this.autoShrink; },
        tooltip: 'Khoảng hở tối thiểu giữa 2 bể khi thu nhỏ, theo tỉ lệ chiều cao hình bể' })
    minGap: number = 0.04;

    @property({ type: Camera, tooltip: 'Camera render các bể. Để trống = tự tìm camera nhìn thấy layer của node này' })
    cam: Camera = null;

    /** Khung hình của từng bể trong local của chính bể (chưa nhân scale bể): đỉnh / đáy theo y. */
    private extents: Map<Node, { top: number, bottom: number }> = new Map();
    /** Scale gốc của bể trong scene - thu nhỏ luôn tính từ giá trị này, không nhân dồn. */
    private baseScales: Map<Node, Vec3> = new Map();
    private lastKey = '';

    /** Đo lại khung hình bể (gọi khi vừa đổi visual bể: thêm sao, đổi khung...). */
    remeasure() {
        this.extents.clear();
        this.lastKey = '';
    }

    private getSlots(): Node[] {
        return this.node.children.filter(c => c.active && c.getComponent(Slot));
    }

    private getCam(): Camera {
        if (this.cam && this.cam.isValid) return this.cam;
        const scene = director.getScene();
        if (!scene) return null;
        const layer = this.node.layer;
        return scene.getComponentsInChildren(Camera).find(c => c.enabledInHierarchy && (c.visibility & layer) !== 0) || null;
    }

    /** Đo đỉnh / đáy phần hình bể từ mọi Sprite đang bật (khung, bể kính, sao...), quy về local của bể, bỏ scale bể. */
    private measure(slot: Node) {
        let top = -Infinity, bottom = Infinity;
        const inv = slot.worldScale.y || 1;
        const y0 = slot.worldPosition.y;
        slot.getComponentsInChildren(Sprite).forEach(sp => {
            if (!sp.enabledInHierarchy) return;
            const ut = sp.getComponent(UITransform);
            if (!ut) return;
            const box = ut.getBoundingBoxToWorld();
            top = Math.max(top, (box.yMax - y0) / inv);
            bottom = Math.min(bottom, (box.yMin - y0) / inv);
        });
        if (!isFinite(top) || !isFinite(bottom)) { top = 100; bottom = -100; }
        this.extents.set(slot, { top, bottom });
    }

    lateUpdate() {
        if (!this.auto) return;
        const slots = this.getSlots();
        if (slots.length === 0) return;
        const cam = this.getCam();
        if (!cam) return;

        slots.forEach(s => {
            if (!this.baseScales.has(s)) this.baseScales.set(s, s.scale.clone());
            // Đo lúc bể đang ở scale gốc (không đo khi đang tween thu về 0 / nảy).
            if (!this.extents.has(s) && s.scale.equals(this.baseScales.get(s))) this.measure(s);
        });
        if (slots.some(s => !this.extents.has(s))) return;

        // Vùng thấy được theo chiều dọc (world) -> local của node Slots.
        const cy = cam.node.worldPosition.y;
        const half = cam.orthoHeight;
        const cx = this.node.worldPosition.x;
        const topL = this.node.inverseTransformPoint(v3(), v3(cx, cy + half, 0)).y;
        const botL = this.node.inverseTransformPoint(v3(), v3(cx, cy - half, 0)).y;
        const screenH = topL - botL;
        const areaTop = topL - screenH * this.topMargin + this.offsetY;
        const areaBot = botL + screenH * this.bottomMargin + this.offsetY;

        const key = [areaTop, areaBot, slots.length, this.minGap, this.autoShrink].map(v => typeof v === 'number' ? v.toFixed(2) : v).join('|');
        if (key === this.lastKey) return;
        this.lastKey = key;

        // Giữ thứ tự hiện tại trên -> dưới.
        const ordered = [...slots].sort((a, b) => b.position.y - a.position.y);
        const cell = (areaTop - areaBot) / ordered.length;

        // Thu nhỏ đồng đều nếu bể cao nhất không vừa ô (chỉ khi chạy game - trong Editor giữ scale scene).
        const tallest = Math.max(...ordered.map(s => {
            const e = this.extents.get(s);
            return (e.top - e.bottom) * this.baseScales.get(s).y;
        }));
        let k = 1;
        if (!EDITOR && this.autoShrink && tallest > 0) k = Math.min(1, cell / (tallest * (1 + this.minGap)));

        ordered.forEach((s, i) => {
            const e = this.extents.get(s);
            const base = this.baseScales.get(s);
            const sy = base.y * k;
            const cellCenter = areaTop - cell * (i + 0.5);
            // Tâm phần hình (không phải pivot) nằm giữa ô.
            const visualMid = (e.top + e.bottom) * 0.5 * sy;
            s.setPosition(s.position.x, cellCenter - visualMid, s.position.z);
            if (!EDITOR) {
                const scaled = base.clone().multiplyScalar(k);
                const slot = s.getComponent(Slot);
                // Bể đang ở scale gốc thì đổi luôn; đang tween (nảy / thu về 0) thì chỉ cập nhật đích để tween tự về đúng.
                if (!slot.baseScale || s.scale.equals(slot.baseScale)) s.setScale(scaled);
                slot.baseScale = scaled;
            }
        });
    }
}
