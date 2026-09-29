import { _decorator, Component, Node, Quat, Vec3 } from 'cc';
const { ccclass } = _decorator;

const DEG2RAD = Math.PI / 180;
const _qInv = new Quat();
const _v = new Vec3();

/**
 * Lớp cơ sở cho animator procedural riêng của từng loại sinh vật (sao biển, cua...). Gắn lên node gốc của model
 * (con của Room/Fish/SK_FishN) - node này là "root space" của rig. Fish.ts thấy component kế thừa lớp này trong model
 * thì giao hẳn việc animate cho nó (build / step / resetPose), không dò bone Spine/Tail/Fin_ như cá thường.
 */
@ccclass('CustomFishAnim')
export class CustomFishAnim extends Component {

    /** Dò bone, lưu bind pose. */
    build(): void { }

    /** Mỗi frame, gọi từ Fish.step(): speed là Fish.speed do FishMove đặt (idle 0.5, bơi >= 1). */
    step(dt: number, speed: number): void { }

    /** Trả bone về bind pose. */
    resetPose(): void { }

    // ---------- Tiện ích dùng chung ----------

    /** Vị trí bone trong root space (local space của node gắn component). */
    protected localPos(t: Node, out = new Vec3()): Vec3 {
        return this.node.inverseTransformPoint(out, Vec3.clone(t.worldPosition));
    }

    /** Hướng from -> to trong root space, trùng nhau thì trả fallback. */
    protected dir(from: Node, to: Node | null, fallback: Vec3): Vec3 {
        if (!to) return fallback.clone();
        const d = this.localPos(to).subtract(this.localPos(from));
        return d.lengthSqr() > 1e-10 ? d.normalize() : fallback.clone();
    }

    /** Trục nằm ngang (vuông góc trục lên +Y) và vuông góc với chi hướng dir - xoay quanh trục này chi nhấc / đạp
     * lên xuống. Chi dựng gần thẳng đứng thì dùng fallback. */
    protected swingAxis(dir: Vec3, fallback: Vec3): Vec3 {
        const a = new Vec3();
        Vec3.cross(a, Vec3.UNIT_Y, dir);
        if (a.lengthSqr() > 1e-6) return a.normalize();
        return fallback.clone().normalize();
    }

    /** Chuỗi đốt: gốc + con đầu tiên nối tiếp, bỏ qua bone *_end (chóp không skin). */
    protected chain(root: Node | null): Node[] {
        const list: Node[] = [];
        let cur: Node | null = root;
        while (cur && !/_end$/i.test(cur.name)) {
            list.push(cur);
            cur = cur.children.length > 0 ? cur.children[0] : null;
        }
        return list;
    }

    /** Con trực tiếp đầu tiên có tên bắt đầu bằng prefix. */
    protected child(parent: Node | null, prefix: string): Node | null {
        return parent ? parent.children.find(c => c.name.startsWith(prefix)) || null : null;
    }

    /** Mọi con trực tiếp có tên bắt đầu bằng prefix. */
    protected children(parent: Node | null, prefix: string): Node[] {
        return parent ? parent.children.filter(c => c.name.startsWith(prefix) && !/_end$/i.test(c.name)) : [];
    }

    /** Bone nông nhất (duyệt theo tầng) có tên bắt đầu bằng prefix. */
    protected findShallowest(root: Node, prefix: string): Node | null {
        let queue: Node[] = [...root.children];
        while (queue.length > 0) {
            const next: Node[] = [];
            for (const n of queue) {
                if (n.name.startsWith(prefix)) return n;
                next.push(...n.children);
            }
            queue = next;
        }
        return null;
    }

    /** Bên trái / phải: theo dấu x trong root space (+1 = +X), x ~ 0 thì theo tên (_L = -1, _R = +1). */
    protected sideOf(n: Node): number {
        const x = this.localPos(n).x;
        if (Math.abs(x) > 1e-5) return Math.sign(x);
        if (/_R(_|$)/.test(n.name)) return 1;
        if (/_L(_|$)/.test(n.name)) return -1;
        return 0;
    }

    /** Quaternion xoay `degrees` quanh trục worldAxis, biểu diễn trong parent space (dùng: node.rotation = out * bindLocal). */
    protected rotateAbout(parent: Node, worldAxis: Vec3, degrees: number, out: Quat): Quat {
        Quat.invert(_qInv, parent.worldRotation);
        Vec3.transformQuat(_v, worldAxis, _qInv);
        _v.normalize();
        return Quat.fromAxisAngle(out, _v, degrees * DEG2RAD);
    }

    /** Sắp bone cha trước con để khi xoay con đọc được worldRotation cha đã cập nhật trong frame. */
    protected static sortByDepth<T extends { node: Node }>(bones: T[]): void {
        const depth = (n: Node) => { let d = 0; let cur = n.parent; while (cur) { d++; cur = cur.parent; } return d; };
        bones.sort((a, b) => depth(a.node) - depth(b.node));
    }
}
