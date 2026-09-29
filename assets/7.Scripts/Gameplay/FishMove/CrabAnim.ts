import { _decorator, Node, Quat, Vec3, clamp, clamp01 } from 'cc';
import { CustomFishAnim } from './CustomFishAnim';
const { ccclass, property } = _decorator;

const RAD2DEG = 180 / Math.PI;

enum Kind { Body, Head, Eye, Arm, ClawUpper, ClawLower, Leg }

class Bone {
    node!: Node;
    bindLocal = new Quat();
    kind: Kind = Kind.Body;
    axis = new Vec3();      // trục xoay trong root space
    amp = 0;                // độ, khi Speed = 1
    lag = 0;                // rad trễ pha
    bendScale = 0;          // hệ số nhận góc nghiêng theo hướng rẽ
}

// scratch dùng chung mỗi frame
const _qA = new Quat();
const _qB = new Quat();
const _axisWorld = new Vec3();
const _v = new Vec3();

/**
 * Animator procedural cho cua (SK_Fish24), port từ CrabProceduralAnimator (Unity).
 * Rig: Root > Spine_1 > Head; Eye_1_<L|R> > Eye_2 (cuống mắt); Arm_<L|R> > Claw > ClawUpper_1..2 / ClawLower_1..2 (càng);
 * Leg_1_<F|B>_<L|R> > Leg_2 > Leg_3 (4 chân 3 đốt; chóp chân sau trùng tên Leg_2_B_* nên duyệt theo cây, không theo tên).
 * Gắn lên node gốc của model - root space: mặt +Z, lưng +Y, phải +X; bên trái / phải lấy theo dấu x của bone.
 * Chuyển động mỗi frame (xoay so với bind pose, tần số kickFrequency × Speed, biên độ × √Speed):
 *  - thân lắc nhẹ quanh trục dọc lên + nghiêng theo hướng rẽ; đầu gật nhẹ;
 *  - cuống mắt nghiêng sang bên quanh trục dọc thân, hai mắt ngược chiều, đốt chóp trễ pha;
 *  - càng: cả cánh tay nhấc lên xuống quanh trục vuông góc tay, hai bên ngược pha; càng trên / dưới mở khép ngược chiều
 *    quanh bản lề (pháp tuyến mặt phẳng hai nửa càng), đốt chóp trễ pha;
 *  - chân đạp lên xuống quanh trục nằm ngang vuông góc chân, đốt sau trễ pha, chân trước / sau ngược pha, trái / phải lệch
 *    1/4 chu kỳ.
 */
@ccclass('CrabAnim')
export class CrabAnim extends CustomFishAnim {

    @property({ type: Node, tooltip: 'Thân (Spine_1). Để trống = tự tìm bone Spine nông nhất' })
    body: Node | null = null;

    @property({ tooltip: 'Hz khi Speed = 1', group: { name: 'Thân / đầu / mắt', id: '1' } })
    kickFrequency = 1.6;
    @property({ tooltip: 'Độ lắc thân quanh trục dọc lên', group: { name: 'Thân / đầu / mắt', id: '1' } })
    bodySway = 2;
    @property({ tooltip: 'Độ gật đầu quanh trục ngang', group: { name: 'Thân / đầu / mắt', id: '1' } })
    headNod = 2;
    @property({ tooltip: 'Độ nghiêng cuống mắt (gốc), hai mắt ngược chiều', group: { name: 'Thân / đầu / mắt', id: '1' } })
    eyeWobble = 5;
    @property({ tooltip: 'Rad trễ pha đốt chóp mắt', group: { name: 'Thân / đầu / mắt', id: '1' } })
    eyeLag = 0.7;

    @property({ tooltip: 'Độ nhấc cánh tay lên xuống', group: { name: 'Càng', id: '2' } })
    armLift = 6;
    @property({ tooltip: 'Độ mở / khép mỗi nửa càng', group: { name: 'Càng', id: '2' } })
    clawOpen = 10;
    @property({ tooltip: 'Rad trễ pha đốt chóp càng', group: { name: 'Càng', id: '2' } })
    clawLag = 0.6;

    @property({ tooltip: 'Độ đạp ở gốc chân (đốt sau giảm dần)', group: { name: 'Chân', id: '3' } })
    legKick = 12;
    @property({ tooltip: 'Rad trễ pha mỗi đốt', group: { name: 'Chân', id: '3' } })
    legLag = 0.7;
    @property({ tooltip: 'Rad lệch pha trái / phải', group: { name: 'Chân', id: '3' } })
    legSidePhase = Math.PI * 0.5;
    @property({ tooltip: 'Rad lệch pha chân trước / sau', group: { name: 'Chân', id: '3' } })
    legFrontBackPhase = Math.PI;
    @property({ tooltip: 'Hệ số chân bị kéo theo hướng rẽ', group: { name: 'Chân', id: '3' } })
    legBend = 0.2;

    @property({ tooltip: 'Độ nghiêng khi rẽ 90°/giây (nhân với hệ số của từng bone: thân 1, đầu / càng 0.3, chân legBend)', group: { name: 'Rẽ hướng', id: '4' } })
    turnBend = 10;
    @property({ tooltip: 'Kẹp góc nghiêng theo hướng rẽ (độ)', group: { name: 'Rẽ hướng', id: '4' } })
    maxTurnBend = 15;
    @property({ tooltip: 'Lọc rung tốc độ rẽ (càng lớn càng nhạy)', group: { name: 'Rẽ hướng', id: '4' } })
    bendSmoothing = 8;

    private bones: Bone[] = [];
    private built = false;
    private phase = 0;
    private hasPrev = false;
    private prevRot = new Quat();
    private yawRate = 0;

    // ---------- Dò bone (tương đương nút Find Bones + OnBuild + BakeBone của bản Unity) ----------

    build(): void {
        this.resetPose();
        this.bones.length = 0;
        this.phase = 0;
        this.hasPrev = false;
        this.yawRate = 0;
        this.built = true;

        const body = this.body || this.findShallowest(this.node, 'Spine');
        if (!body) {
            console.warn(`CrabAnim '${this.node.name}': không tìm thấy bone Spine (thân), không animate.`);
            return;
        }

        // thân: lắc quanh trục dọc lên, nghiêng theo hướng rẽ
        this.add(body, Kind.Body, Vec3.UNIT_Y, this.bodySway, 0, 1);

        // đầu: gật quanh trục ngang
        const head = this.child(body, 'Head');
        if (head) this.add(head, Kind.Head, Vec3.UNIT_X, this.headNod, 0, 0.3);

        // cuống mắt: nghiêng sang bên quanh trục dọc thân, hai mắt ngược chiều
        for (const root of this.children(body, 'Eye_')) {
            const side = this.sideOf(root);
            this.chain(root).forEach((seg, i) =>
                this.add(seg, Kind.Eye, Vec3.UNIT_Z, this.eyeWobble * side * (i === 0 ? 1 : 0.7), i * this.eyeLag, 0));
        }

        // càng
        for (const arm of this.children(body, 'Arm_')) {
            const side = this.sideOf(arm);
            const claw = this.child(arm, 'Claw');
            const upper = this.child(claw, 'ClawUpper');
            const lower = this.child(claw, 'ClawLower');
            if (!claw || !upper || !lower) console.warn(`CrabAnim '${this.node.name}': càng '${arm.name}' thiếu Claw / ClawUpper / ClawLower.`);

            const reach = claw || upper;
            const armDir = this.dir(arm, reach, new Vec3(0, 0, 1));
            const liftAxis = this.swingAxis(armDir, Vec3.UNIT_X);
            const sidePhase = side < 0 ? 0 : Math.PI;
            this.add(arm, Kind.Arm, liftAxis, this.armLift, sidePhase, 0.3);
            if (claw) this.add(claw, Kind.Arm, liftAxis, this.armLift * 0.5, 0.5 + sidePhase, 0.3);

            // bản lề càng: pháp tuyến mặt phẳng hai nửa càng
            const pivot = claw || arm;
            const hinge = new Vec3(1, 0, 0);
            if (upper && lower) {
                const u = this.dir(pivot, upper, new Vec3(0, 0, 1));
                const l = this.dir(pivot, lower, new Vec3(0, 0, 1));
                Vec3.cross(_v, u, l);
                if (_v.lengthSqr() > 1e-8) hinge.set(_v.normalize());
            }
            const clawPhase = side < 0 ? 0 : Math.PI * 0.5;
            this.chain(upper).forEach((seg, i) =>
                this.add(seg, Kind.ClawUpper, hinge, this.clawOpen * (i === 0 ? 1 : 0.5), i * this.clawLag + clawPhase, 0));
            this.chain(lower).forEach((seg, i) =>
                this.add(seg, Kind.ClawLower, hinge, -this.clawOpen * (i === 0 ? 1 : 0.5), i * this.clawLag + clawPhase, 0));
        }

        // chân: đạp lên xuống quanh trục nằm ngang vuông góc chân
        for (const root of this.children(body, 'Leg_')) {
            const segs = this.chain(root);
            const side = this.sideOf(root);
            const front = root.name.includes('_F_');
            const next = segs.length > 1 ? segs[1] : (root.children[0] || null);
            const legDir = this.dir(root, next, new Vec3(side, 0, 0));
            const kickAxis = this.swingAxis(legDir, Vec3.UNIT_Z);
            const basePhase = (front ? 0 : this.legFrontBackPhase) + (side < 0 ? 0 : this.legSidePhase);
            segs.forEach((seg, i) =>
                this.add(seg, Kind.Leg, kickAxis, this.legKick * Math.max(0.2, 1 - 0.2 * i), i * this.legLag + basePhase, this.legBend));
        }

        CustomFishAnim.sortByDepth(this.bones);
    }

    resetPose(): void {
        for (const b of this.bones) if (b.node && b.node.isValid) b.node.rotation = b.bindLocal;
    }

    // ---------- Mỗi frame ----------

    step(dt: number, speed: number): void {
        if (!this.built) this.build();
        if (dt <= 0) return;

        const s = Math.max(speed, 0.05);
        this.phase += dt * this.kickFrequency * s * Math.PI * 2;
        const ampScale = Math.sqrt(s);
        this.measureTurn(dt);
        const turn = clamp(-this.turnBend * this.yawRate / 90, -this.maxTurnBend, this.maxTurnBend);

        const rootRot = this.node.worldRotation;
        for (const b of this.bones) {
            const p = b.node.parent;
            if (!p) continue;
            const deg = b.amp * ampScale * Math.sin(this.phase - b.lag) + b.bendScale * turn;
            Vec3.transformQuat(_axisWorld, b.axis, rootRot);
            this.rotateAbout(p, _axisWorld, deg, _qA);
            Quat.multiply(_qA, _qA, b.bindLocal);
            b.node.rotation = _qA;
        }
    }

    /** Tốc độ rẽ (độ/giây quanh trục lên của root space, đã lọc) - đo từ thay đổi worldRotation mà FishMove đặt. */
    private measureTurn(dt: number): void {
        const rot = this.node.worldRotation;
        if (this.hasPrev) {
            Quat.conjugate(_qB, this.prevRot);
            Quat.multiply(_qB, _qB, rot);
            let ang = Quat.getAxisAngle(_v, _qB) * RAD2DEG;
            if (ang > 180) ang -= 360;
            const y = ang * _v.y / dt;
            this.yawRate += (y - this.yawRate) * clamp01(1 - Math.exp(-this.bendSmoothing * dt));
        }
        Quat.copy(this.prevRot, rot);
        this.hasPrev = true;
    }

    private add(node: Node, kind: Kind, axis: Vec3, amp: number, lag: number, bendScale: number): void {
        const b = new Bone();
        b.node = node;
        b.kind = kind;
        b.axis.set(axis);
        b.amp = amp;
        b.lag = lag;
        b.bendScale = bendScale;
        Quat.copy(b.bindLocal, node.rotation);
        this.bones.push(b);
    }
}
