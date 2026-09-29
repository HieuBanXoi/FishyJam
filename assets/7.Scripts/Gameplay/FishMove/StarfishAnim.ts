import { _decorator, Node, Quat, Vec3, Enum, clamp01, lerp } from 'cc';
import { CustomFishAnim } from './CustomFishAnim';
const { ccclass, property } = _decorator;

/** Kiểu uốn tay: InPlane = xoay quanh pháp tuyến mặt sao (tay quét trong mặt sao, đúng mô tả bản Unity);
 * Curl = xoay quanh trục tiếp tuyến (tay cong ra / vào mặt sao). */
export enum StarArmBend { InPlane, Curl }

enum Kind { Body, Arm }

class Bone {
    node!: Node;
    bindLocal = new Quat();
    kind: Kind = Kind.Body;
    chain = 0;                  // đốt thứ mấy (0 = gốc tay)
    angle = 0;                  // góc của tay quanh tâm sao (rad, 0 = phía +Y, tăng về +X)
    tangent = new Vec3();       // root space: trục cong tay khi armBend = Curl
}

// scratch dùng chung mỗi frame
const _qA = new Quat();
const _axis = new Vec3();
const _normalWorld = new Vec3();

/**
 * Animator procedural cho sao biển (SK_Fish23), port từ StarfishProceduralAnimator (Unity).
 * Gắn lên node gốc của model (con của Room/Fish/SK_FishN) - node này là "root space": sao phẳng trong mặt XY,
 * mặt sao (mắt, miệng) hướng +Z.
 *
 * Rig: Spine_1 (tâm sao) > 5 tay Arm_*, mỗi tay là chuỗi đốt (con đầu tiên nối tiếp, bỏ qua bone *_end).
 * Chuyển động: thân lắc quanh pháp tuyến mặt sao; mỗi tay uốn, đốt sau trễ pha (armLag), các tay lệch pha theo góc
 * quanh sao (ringWave) -> gợn sóng chạy vòng quanh sao.
 *  - IDLE: waveFrequency Hz × Speed, biên độ × √Speed.
 *  - BƠI: nhịp ổn định swimFrequency Hz, biên độ đúng swimArmAngle / swimArmTipAngle, không theo Speed.
 * Không uốn theo yaw / pitch rẽ hướng; faceCamera giữ mặt sao luôn quay về camera, đứng thẳng, không quay theo
 * hướng bơi mà FishMove đặt cho node cá.
 */
@ccclass('StarfishAnim')
export class StarfishAnim extends CustomFishAnim {

    @property({ type: Node, tooltip: 'Tâm sao (Spine_1). Để trống = tự tìm bone Spine nông nhất' })
    body: Node | null = null;

    @property({ type: Enum(StarArmBend), tooltip: 'InPlane: tay quét trong mặt sao (như bản Unity). Curl: tay cong ra / vào mặt sao' })
    armBend: StarArmBend = StarArmBend.InPlane;

    @property({ tooltip: 'Giữ mặt sao luôn quay về camera, không quay theo hướng bơi' })
    faceCamera = true;
    @property({ tooltip: 'Góc nghiêng (euler, độ) của mặt sao so với camera khi faceCamera bật', visible() { return this.faceCamera; } })
    faceTilt = new Vec3();

    @property({ tooltip: 'Hz idle khi Speed = 1', group: { name: 'Thân', id: '1' } })
    waveFrequency = 1;
    @property({ tooltip: 'Độ lắc thân quanh pháp tuyến mặt sao', group: { name: 'Thân', id: '1' } })
    bodyRock = 3;

    @property({ tooltip: 'Độ uốn ở gốc tay', group: { name: 'Tay (idle)', id: '2' } })
    armAngle = 6;
    @property({ tooltip: 'Độ uốn ở các đốt sau', group: { name: 'Tay (idle)', id: '2' } })
    armTipAngle = 8;
    @property({ tooltip: 'Rad trễ pha mỗi đốt', group: { name: 'Tay (idle)', id: '2' } })
    armLag = 0.9;
    @property({ tooltip: 'Số vòng sóng quanh sao (0 = mọi tay đồng pha)', group: { name: 'Tay (idle)', id: '2' } })
    ringWave = 1;

    @property({ tooltip: 'Hz gợn sóng khi bơi (nhịp ổn định, không theo Speed)', group: { name: 'Bơi', id: '3' } })
    swimFrequency = 0.6;
    @property({ tooltip: 'Độ uốn gốc tay khi bơi', group: { name: 'Bơi', id: '3' } })
    swimArmAngle = 6;
    @property({ tooltip: 'Độ uốn các đốt sau khi bơi', group: { name: 'Bơi', id: '3' } })
    swimArmTipAngle = 10;
    @property({ tooltip: 'Speed (do FishMove đặt) từ mức này trở lên coi là đang bơi; idle FishMove đặt 0.5, bơi >= 1', group: { name: 'Bơi', id: '3' } })
    swimSpeedThreshold = 0.75;
    @property({ tooltip: 'Tốc độ chuyển mượt giữa idle và bơi (1/giây)', group: { name: 'Bơi', id: '3' } })
    swimBlendSpeed = 4;

    private bones: Bone[] = [];
    private built = false;
    private phase = 0;
    private swimWeight = 0;

    // ---------- Dò bone ----------

    build(): void {
        this.resetPose();
        this.bones.length = 0;
        this.phase = 0;
        this.swimWeight = 0;
        this.built = true;
        this.applyFacing();

        const body = this.body || this.findShallowest(this.node, 'Spine');
        if (!body) {
            console.warn(`StarfishAnim '${this.node.name}': không tìm thấy bone Spine (tâm sao), không animate.`);
            return;
        }

        const center = this.localPos(body);
        this.registerBone(body, Kind.Body);

        for (const armRoot of this.children(body, 'Arm_')) {
            const segments = this.chain(armRoot);

            // hướng tay trong mặt sao (XY root space): từ tâm tới gốc tay, gốc trùng tâm thì lấy tới chóp tay
            const radial = this.localPos(segments[0]).subtract(center);
            radial.z = 0;
            if (radial.lengthSqr() < 1e-8) {
                const last = segments[segments.length - 1];
                const tip = last.children.length > 0 ? last.children[0] : last;
                Vec3.subtract(radial, this.localPos(tip), center);
                radial.z = 0;
            }
            if (radial.lengthSqr() < 1e-8) radial.set(0, 1, 0);
            const angle = Math.atan2(radial.x, radial.y);
            radial.normalize();
            const tangent = new Vec3();
            Vec3.cross(tangent, Vec3.UNIT_Z, radial); // pháp tuyến × hướng tay: trục cong tay ra / vào mặt sao

            segments.forEach((seg, i) => {
                const b = this.registerBone(seg, Kind.Arm);
                b.chain = i;
                b.angle = angle;
                b.tangent.set(tangent);
            });
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
        this.applyFacing();

        const s = Math.max(speed, 0.05);
        const swimTarget = s >= this.swimSpeedThreshold ? 1 : 0;
        this.swimWeight = lerp(this.swimWeight, swimTarget, clamp01(1 - Math.exp(-this.swimBlendSpeed * dt)));
        const w = this.swimWeight;

        const freq = lerp(this.waveFrequency * s, this.swimFrequency, w);
        this.phase += dt * freq * Math.PI * 2;

        const idleScale = Math.sqrt(s);
        const bodyAmp = this.bodyRock * lerp(idleScale, 1, w);
        const rootAmp = lerp(this.armAngle * idleScale, this.swimArmAngle, w);
        const tipAmp = lerp(this.armTipAngle * idleScale, this.swimArmTipAngle, w);

        Vec3.transformQuat(_normalWorld, Vec3.UNIT_Z, this.node.worldRotation);

        for (const b of this.bones) {
            const p = b.node.parent;
            if (!p) continue;
            if (b.kind === Kind.Body) {
                this.rotateAbout(p, _normalWorld, bodyAmp * Math.sin(this.phase), _qA);
            } else {
                const lag = b.chain * this.armLag + this.ringWave * b.angle;
                const deg = (b.chain === 0 ? rootAmp : tipAmp) * Math.sin(this.phase - lag);
                if (this.armBend === StarArmBend.Curl) {
                    Vec3.transformQuat(_axis, b.tangent, this.node.worldRotation);
                    this.rotateAbout(p, _axis, deg, _qA);
                } else {
                    this.rotateAbout(p, _normalWorld, deg, _qA);
                }
            }
            Quat.multiply(_qA, _qA, b.bindLocal);
            b.node.rotation = _qA;
        }
    }

    lateUpdate(): void {
        // FishMove / tween của Slot xoay node cá sau step() hoặc khi anim đang pause -> khoá lại hướng mặt sao
        this.applyFacing();
    }

    private applyFacing(): void {
        if (!this.faceCamera) return;
        Quat.fromEuler(_qA, this.faceTilt.x, this.faceTilt.y, this.faceTilt.z);
        this.node.worldRotation = _qA;
    }

    private registerBone(node: Node, kind: Kind): Bone {
        const b = new Bone();
        b.node = node;
        b.kind = kind;
        Quat.copy(b.bindLocal, node.rotation);
        this.bones.push(b);
        return b;
    }
}
