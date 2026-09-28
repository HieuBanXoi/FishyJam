import { _decorator, Component, Node, Vec3, Quat, Enum, clamp, clamp01, lerp, inverseLerp, repeat, randomRange, v3 } from 'cc';
import { Fish } from './Fish';
const { ccclass, property } = _decorator;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const PATH_SAMPLES = 64;

enum FacingMode { Free, Right, Left }

/** Hình chiếu `v` lên mặt phẳng vuông góc `normal` (Unity Vector3.ProjectOnPlane). */
function projectOnPlane(out: Vec3, v: Vec3, normal: Vec3): Vec3 {
    const d = Vec3.dot(v, normal) / Math.max(Vec3.dot(normal, normal), 1e-12);
    return Vec3.set(out, v.x - normal.x * d, v.y - normal.y * d, v.z - normal.z * d);
}

/** Xoay `from` về `to` tối đa `maxDegrees` độ (Unity Quaternion.RotateTowards), ghi vào `out` (được phép trùng `from`). */
function rotateTowardsQuat(out: Quat, from: Quat, to: Quat, maxDegrees: number): Quat {
    const dot = clamp(Quat.dot(from, to), -1, 1);
    const angleDeg = 2 * Math.acos(Math.abs(dot)) * RAD2DEG;
    if (angleDeg <= maxDegrees || angleDeg < 1e-4) return Quat.copy(out, to);
    return Quat.slerp(out, from, to, maxDegrees / angleDeg);
}

/**
 * Cổng từ Unity Vector3.SmoothDamp (không cổng phần chống vọt lố micro khi target đứng yên - không đáng kể với
 * chuyển động trôi tại chỗ chậm). `velocity` bị ghi đè (tương đương `ref Vector3 velocity`).
 */
function smoothDampVec3(current: Vec3, target: Vec3, velocity: Vec3, smoothTime: number, maxSpeed: number, dt: number, out: Vec3): Vec3 {
    smoothTime = Math.max(0.0001, smoothTime);
    const omega = 2 / smoothTime;
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    let dx = current.x - target.x, dy = current.y - target.y, dz = current.z - target.z;
    const maxChange = maxSpeed * smoothTime;
    const sqDist = dx * dx + dy * dy + dz * dz;
    const maxChangeSq = maxChange * maxChange;
    if (sqDist > maxChangeSq) {
        const scale = maxChange / Math.sqrt(sqDist);
        dx *= scale; dy *= scale; dz *= scale;
    }
    const targetX = current.x - dx, targetY = current.y - dy, targetZ = current.z - dz;
    const tempX = (velocity.x + omega * dx) * dt;
    const tempY = (velocity.y + omega * dy) * dt;
    const tempZ = (velocity.z + omega * dz) * dt;
    velocity.x = (velocity.x - omega * tempX) * exp;
    velocity.y = (velocity.y - omega * tempY) * exp;
    velocity.z = (velocity.z - omega * tempZ) * exp;
    out.x = targetX + (dx + tempX) * exp;
    out.y = targetY + (dy + tempY) * exp;
    out.z = targetZ + (dz + tempZ) * exp;
    return out;
}

/** Thay Mathf.PerlinNoise (Cocos không có sẵn): tổng vài sóng sin tần số lẻ, trả về ~[0,1], đủ mượt & không lặp trong thời gian ngắn. */
function noise1(x: number, seed: number): number {
    return 0.5 + 0.25 * Math.sin(x * 2 + seed * 3.1) + 0.15 * Math.sin(x * 4.37 + seed * 7.7) + 0.1 * Math.sin(x * 8.13 + seed * 1.3);
}

// scratch dùng chung mỗi frame để tránh cấp phát (GC) trong vòng lặp cá
const _tmpRot = new Quat();

/** Trạng thái bơi quanh vòng tròn của 1 con cá - toạ độ cực (rad) quanh tâm this.node, bán kính cố định = radius. */
class FishState {
    fish: Fish = null!;
    angle = 0;
    startAngle = 0;
    targetAngle = 0;
    linear = false;
    startPos = new Vec3();
    targetPos = new Vec3();
    bendDir = new Vec3();
    rotation = new Quat();
    forward = new Vec3(0, 0, -1);
    progress = 0;
    duration = 1;
    totalDistance = 0;
    prevPos = new Vec3();
    swimming = false;
    seed = Math.random() * 1000;
}

@ccclass('FishMove')
export class FishMove extends Component {

    radius: number = 2900;
    fishes: Fish[] = [];
    minShuffleTime: number = 10;
    maxShuffleTime: number = 15;
    shuffleTime: number = 0;
    fisrtShuffleTime: number = 5;

    shufflingFishes: Fish[] = [];
    freeFishes: Fish[] = [];

    idleAmplitude: number = 100;
    idleFrequency: number = 0.3;
    bobAmplitude: number = 50;
    bobFrequency: number = 1;
    tradeBendRatio: number = 0.3;
    tradeBendZRatio: number = 0.3;
    diveDepth: number = 1;
    easeDistance: number = 400;
    animSpeedIdle: number = 0.5;
    animSpeed: number = 1;
    animSpeedPerMeter: number = 0.0003;
    clock: number = 0;

    _swingSpeed: number = 1;
    get swingSpeed() { return this._swingSpeed * this.radius; }
    turnSpeed: number = 150;
    turnEase: number = 20;
    idleSpeed: number = 10;

    size: number = 1;

    states: FishState[] = [];

    @property
    rotatable: boolean = true;

    init() {
        this.fishes = this.getComponentsInChildren(Fish);
        this.size = this.fishes.length;
        this.freeFishes = [...this.fishes];
        this.shufflingFishes = [];
        const n = this.fishes.length;
        this.states = this.fishes.map((fish, i): FishState => {
            const s = new FishState();
            s.fish = fish;
            s.angle = (360 * i / n) * DEG2RAD;

            let pos = v3(Math.cos(s.angle) * this.radius, 
            Math.sin(s.angle) * this.radius, 0);
            
            let direct = pos.x > 0 ? 1 : -1;
            if(n == 1) {
                direct = this.node.position.x > 0 ? 1 : -1;
                pos = v3();
            }

            fish.node.position = pos;
            fish.node.eulerAngles = v3(0, 45 * direct, 0);
            Quat.copy(s.rotation, fish.node.rotation);
            Vec3.transformQuat(s.forward, Vec3.FORWARD, s.rotation);

            return s;
        });

        this.shuffleTime = this.minShuffleTime + Math.random() * (this.maxShuffleTime - this.minShuffleTime);
        this.schedule(this.onSchedule.bind(this), this.shuffleTime);

        setTimeout(() => {
            this.shuffle();
        }, (1 + this.fisrtShuffleTime * Math.random()) * 1000);
    }

    onSchedule() {
        this.shuffle();
    }

    shuffle() {
        // this.swimAroundCircle();
        // this.tradeAllPos();
        // this.trade2Pos();
        let funcs = [
            this.swimAroundCircle.bind(this),
            this.tradeAllPos.bind(this),
            this.trade2Pos.bind(this),
            this.circleInPlace.bind(this),
        ]

        funcs[Math.floor(Math.random() * funcs.length)]();
    }

    onFishMove(s: FishState) {
        s.fish.swayFrequency = 2;
        s.fish.finFrequency = 1;
    }

    onFishStop(s: FishState) {
        s.fish.swayFrequency = 0.2;
        s.fish.finFrequency = 2;
    }

    // tất cả cá quay 1 hướng quanh hình tròn đổi chỗ cho nhau
    tradeAllPos() {
        const n = this.states.length;
        if (n < 2) return;
        if (this.shufflingFishes.length > 0) return;
        this.shufflingFishes = [...this.fishes];
        this.freeFishes = [];

        const dir = Math.random() < 0.5 ? -1 : 1;
        const sweepDeg = 360 / n;
        const arcLength = sweepDeg * DEG2RAD * this.radius;
        const duration = Math.max(0.05, arcLength / this.swingSpeed);
        for (const s of this.states) {
            s.startAngle = s.angle;
            s.targetAngle = s.angle + dir * sweepDeg * DEG2RAD;
            s.progress = 0;
            s.duration = duration;
            s.totalDistance = arcLength;
            s.swimming = true;
            this.onFishMove(s);
        }
    }

    // Cá quay tròn tại chỗ
    circleInPlace() {

    }

    // Chọn ngẫu nhiên 2 cá free đi thẳng để đổi chỗ
    trade2Pos() {
        if (this.freeFishes.length < 2) return;

        const pool = [...this.freeFishes];
        const fish1 = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        const fish2 = pool[Math.floor(Math.random() * pool.length)];
        const s1 = this.states.find(s => s.fish === fish1);
        const s2 = this.states.find(s => s.fish === fish2);
        if (!s1 || !s2) return;

        this.freeFishes = this.freeFishes.filter(f => f !== fish1 && f !== fish2);
        this.shufflingFishes.push(fish1, fish2);

        const pos1 = new Vec3(Math.cos(s1.angle) * this.radius, Math.sin(s1.angle) * this.radius, 0);
        const pos2 = new Vec3(Math.cos(s2.angle) * this.radius, Math.sin(s2.angle) * this.radius, 0);
        const dist = Vec3.distance(pos1, pos2);
        const duration = Math.max(0.05, dist / this.swingSpeed);

        const dirVec = Vec3.subtract(new Vec3(), pos2, pos1);
        Vec3.normalize(dirVec, dirVec);
        const perp = new Vec3(-dirVec.y, dirVec.x, 0);
        const bend = dist * this.tradeBendRatio;
        const bendZ = dist * this.tradeBendZRatio;

        s1.linear = true;
        Vec3.copy(s1.startPos, pos1);
        Vec3.copy(s1.targetPos, pos2);
        Vec3.multiplyScalar(s1.bendDir, perp, bend);
        s1.bendDir.z = bendZ;
        s1.targetAngle = s2.angle;
        s1.progress = 0;
        s1.duration = duration;
        s1.totalDistance = dist;
        s1.swimming = true;
        this.onFishMove(s1);

        s2.linear = true;
        Vec3.copy(s2.startPos, pos2);
        Vec3.copy(s2.targetPos, pos1);
        Vec3.multiplyScalar(s2.bendDir, perp, -bend);
        s2.bendDir.z = -bendZ;
        s2.targetAngle = s1.angle;
        s2.progress = 0;
        s2.duration = duration;
        s2.totalDistance = dist;
        s2.swimming = true;
        this.onFishMove(s2);
    }


    // tất cả cá quay 1 hướng quanh hình tròn 1 góc ngẫu nhiên
    swimAroundCircle() {
        if(this.fishes.length < 2) return;
        if(this.shufflingFishes.length > 0) return;
        this.shufflingFishes = [...this.fishes];
        this.freeFishes = [];
        
        const dir = Math.random() < 0.5 ? -1 : 1;
        const sweepDeg = 30 + Math.random() * 150;
        const arcLength = sweepDeg * DEG2RAD * this.radius;
        const duration = Math.max(0.05, arcLength / this.swingSpeed);
        for (const s of this.states) {
            s.startAngle = s.angle;
            s.targetAngle = s.angle + dir * sweepDeg * DEG2RAD;
            s.progress = 0;
            s.duration = duration;
            s.totalDistance = arcLength;
            s.swimming = true;
            this.onFishMove(s);
        }
    }
    // ngó nghiêng tại chỗ
    idleInPlace(dt: number): void {
        for (const s of this.states) {
            if (s.swimming || !s.fish || !s.fish.node) continue;
            let r = this.size > 1 ? this.radius : 0;
            const homeX = Math.cos(s.angle) * r;
            const homeY = Math.sin(s.angle) * r;
            const t = this.clock * this.idleFrequency + s.seed;
            const driftX = (noise1(t, s.seed) - 0.5) * 2 * this.idleAmplitude;
            const driftY = (noise1(s.seed, t * 0.8) - 0.5) * 2 * this.idleAmplitude;
            Vec3.copy(s.prevPos, s.fish.node.position);
            s.fish.node.position = v3(homeX + driftX, homeY + driftY, 0);

            if(this.rotatable) {
                let direct = s.forward.x < 0 ? 1 : -1;
                if(this.size == 1) direct = this.node.position.x > 0 ? 1 : -1;
                Quat.fromEuler(_tmpRot, 0, 45 * direct, 0);
                rotateTowardsQuat(s.rotation, s.rotation, _tmpRot, clamp01(this.idleSpeed * dt));
                s.fish.node.setRotation(s.rotation);

            }
        }
    }

    // Trôi dạt lên xuống tại chỗ, độc lập
    bobOffset(s: FishState): number {
        return Math.sin((this.clock * this.bobFrequency + s.seed) * Math.PI * 2) * this.bobAmplitude;
    }

    bobAll(dt: number) {
        for (const s of this.states) {
            let pos = s.fish.node.getPosition();
            pos.y += this.bobOffset(s);
            s.fish.node.setPosition(pos);
            const velocity = Vec3.subtract(new Vec3(), pos, s.prevPos).length() / Math.max(dt, 1e-4);
            s.fish.speed = this.animSpeed + velocity * this.animSpeedPerMeter;
            if(this.size == 1 || !s.swimming) {
                s.fish.speed = this.animSpeedIdle;
            }
        }
    }

    private evalPos(s: FishState, e: number): Vec3 {
        if (s.linear) {
            const bendFactor = Math.sin(e * Math.PI);
            const x = lerp(s.startPos.x, s.targetPos.x, e) + s.bendDir.x * bendFactor;
            const y = lerp(s.startPos.y, s.targetPos.y, e) + s.bendDir.y * bendFactor;
            const z = s.bendDir.z * bendFactor;
            return new Vec3(x, y, z);
        }
        const angle = lerp(s.startAngle, s.targetAngle, e);
        const z = this.diveDepth * this.radius * Math.sin(e * Math.PI);
        return new Vec3(Math.cos(angle) * this.radius, Math.sin(angle) * this.radius, z);
    }

    private static headingTowards(current: Quat, dir: Vec3): Quat {
        const worldUp = projectOnPlane(new Vec3(), Vec3.UP, dir);
        let ownUp = projectOnPlane(new Vec3(), Vec3.transformQuat(new Vec3(), Vec3.UP, current), dir);
        if (ownUp.lengthSqr() < 1e-6) ownUp = projectOnPlane(new Vec3(), Vec3.transformQuat(new Vec3(), Vec3.RIGHT, current), dir);
        if (worldUp.lengthSqr() < 1e-6) Vec3.copy(worldUp, ownUp);
        if (ownUp.lengthSqr() < 1e-6) { Quat.fromViewUp(_tmpRot, dir, Vec3.UP); return _tmpRot.clone(); }

        const vertical = clamp01(inverseLerp(0.7, 0.95, Math.abs(dir.y)));
        Vec3.normalize(worldUp, worldUp);
        Vec3.normalize(ownUp, ownUp);
        const up = new Vec3();
        Vec3.lerp(up, worldUp, ownUp, vertical);
        if (up.lengthSqr() < 1e-6) Vec3.copy(up, ownUp);
        Vec3.normalize(up, up);
        const q = new Quat();
        Quat.fromViewUp(q, dir, up);
        return q;
    }

    /** Cập nhật vị trí các cá đang bơi quanh vòng tròn (gọi mỗi frame từ update()). */
    tickStates(dt: number): void {
        for (const s of this.states) {
            if (!s.swimming || !s.fish || !s.fish.node) continue;

            const traveled = s.progress * s.totalDistance;
            const remaining = s.totalDistance - traveled;
            const ease = Math.max(0.05, this.easeDistance);
            let ramp = Math.min((traveled + 0.05) / ease, (remaining + 0.05) / ease);
            ramp = clamp(ramp, 0.25, 1);
            s.progress = s.totalDistance > 0 ? clamp01(s.progress + (this.swingSpeed * ramp * dt) / s.totalDistance) : 1;
            const e = s.progress;

            if (!s.linear) s.angle = lerp(s.startAngle, s.targetAngle, e);
            Vec3.copy(s.prevPos, s.fish.node.position);
            const pos = this.evalPos(s, e);
            s.fish.node.position = pos;

            const h = 0.01;
            const a = this.evalPos(s, Math.min(1, e + h));
            const b = this.evalPos(s, Math.max(0, e - h));
            const tangent = Vec3.subtract(new Vec3(), a, b);
            if (tangent.lengthSqr() > 1e-8) {
                Vec3.normalize(tangent, tangent);
                const targetRot = FishMove.headingTowards(s.rotation, tangent);
                rotateTowardsQuat(s.rotation, s.rotation, targetRot, this.turnSpeed * dt);
                // const direct = tangent.x >= 0 ? 1 : -1;
                // Quat.fromEuler(_tmpRot, 0, 45 * direct, 0);
                // rotateTowardsQuat(s.rotation, s.rotation, _tmpRot, this.turnSpeed * dt);
                Vec3.normalize(tangent, tangent);
                Quat.fromEuler(_tmpRot, 0, 45 * tangent.x, 0);
                Quat.slerp(s.rotation, s.rotation, _tmpRot, clamp01(dt * this.turnEase * s.progress));
                s.fish.node.setRotation(s.rotation);
            }

            if (s.progress >= 1) {
                s.swimming = false;
                if (s.linear) {
                    s.angle = s.targetAngle;
                    s.linear = false;
                }
                Vec3.transformQuat(s.forward, Vec3.FORWARD, s.rotation);
                this.onFishStop(s);
                this.shufflingFishes = this.shufflingFishes.filter(f => f !== s.fish);
                this.freeFishes.push(s.fish);
            }
        }
    }






    
    addFish(fish: Fish) {
        if(this.fishes.includes(fish)) return;
        this.fishes.push(fish);
        this.freeFishes.push(fish);
        const s = new FishState();
        s.fish = fish;
        const pos = fish.node.position;
        s.angle = Math.atan2(pos.y, pos.x);
        Quat.copy(s.rotation, fish.node.rotation);
        Vec3.transformQuat(s.forward, Vec3.FORWARD, s.rotation);
        this.states.push(s);
        this.onFishStop(s);
    }

    removeFish(fish: Fish) {
        this.fishes = this.fishes.filter(f => f !== fish);
        this.freeFishes = this.freeFishes.filter(f => f !== fish);
        this.shufflingFishes = this.shufflingFishes.filter(f => f !== fish);
        this.states = this.states.filter(s => s.fish !== fish);
    }

    removeAllFishes() {
        this.fishes = [];
        this.freeFishes = [];
        this.shufflingFishes = [];
        this.states = [];
    }

    protected update(dt: number): void {
        this.clock += dt;
        this.tickStates(dt);
        this.idleInPlace(dt);
        this.bobAll(dt);
        this.fishes.forEach(fish => fish && fish.updateCustom(dt));
    }
}
