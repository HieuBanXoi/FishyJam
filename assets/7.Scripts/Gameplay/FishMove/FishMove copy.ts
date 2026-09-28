import { _decorator, Component, Node, Vec3, Quat, Enum, clamp, clamp01, lerp, inverseLerp, repeat, randomRange } from 'cc';
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

class FishState {
    fish!: Fish;
    halfLength = 0; halfHeight = 0; halfWidth = 0; baseSize = 0.01;
    seed = 0;
    facing = 1;         // +1 nhìn +X, -1 nhìn -X khi đứng yên
    // facing lúc mới thêm vào đàn là random, không liên quan gì tới hướng cá THỰC SỰ cần bơi tới - nếu ép quay
    // theo facing đó ngay khi chưa có dữ liệu vận tốc thật, cá bị quay gấp vô cớ (rồi có thể phải quay ngược lại
    // lần 2 khi velocity thật tính ra), gây rung/uốn thân dữ dội vô lý lúc mới xuất hiện. facingReady=false thì
    // targetRot giữ nguyên rotation hiện tại (không ép quay) cho tới khi có velocity thật hoặc bơi xong 1 lần.
    facingReady = false;
    rotation = new Quat();
    pointIndex = 0;
    // Vị trí local THẬT của fish.node lúc thêm vào đàn (fish.node có thể không phải con trực tiếp của this.fish -
    // ví dụ vẫn nằm trong Thing/Bubble, lệch tâm theo poses[i] trong Bubble.init()) - cộng vào `pos` (toạ độ
    // trong hệ khối cầu, không đụng gì tới origin này) trước khi ghi ra fish.node.position ở tickSlot. Nhờ vậy
    // toàn bộ tính toán vẫn thuần local (không cần reparent/setWorldPosition/worldMatrix).
    localOrigin = new Vec3();
    pos = new Vec3();
    hoverVel = new Vec3();
    hasPos = false;

    onPath = false;
    pathStart = new Vec3();
    pathDir = 1;         // +1 / -1: chiều quét quanh tâm
    pathExtraLoops = 0;
    pathProgress = 0;

    facingLock = 0;      // còn bấy nhiêu giây chưa được đổi hướng nhìn theo vận tốc

    // Lực né nhau lúc đang bơi (xem computeAvoidance) - tính lại mỗi frame từ vị trí THẬT (pos) của mọi cá trong
    // đàn, cộng thêm vào newPos ở tickSlot() cùng lúc với chuyển động bơi/đứng yên bình thường. Khác với relax()
    // (chỉ tính 1 lần lúc dựng bộ điểm đích tĩnh), cái này chạy real-time nên né được cả lúc đang bơi qua nhau.
    avoidPush = new Vec3();
}

interface PathParams {
    r0: number; r1: number; a0: number; sweep: number; dir: number;
    z0: number; z1: number; dive: number; radiusScale: number; end: Vec3;
}

const _tmpQ = new Quat();
const _tmpV = new Vec3();
const _finalPos = new Vec3();

/**
 * Đàn cá đứng theo "slot" trong một khối cầu quanh chính node này (port từ FishSchool.cs, Unity). `fishes` tự dò
 * bằng `getComponentsInChildren(Fish)` lúc `start()` - đây là con của node này, đàn tự lo di chuyển/xoay cho từng
 * con (không cần `FishMove` nào khác trên từng con cá).
 *
 * Bố cục: theo số cá N, dựng sẵn `layoutSetCount` bộ điểm trong khối cầu (mẫu đặt tay cho 1-4 điểm, vòng tròn cho
 * nhiều hơn), mỗi bộ được "giãn" bằng vài chục vòng đẩy nhau (`relax`) để thân cá không cắt nhau trong 3D, hạn chế
 * chờm trên màn hình (2D), và luôn nằm trong hình chiếu khối cầu; phía trước phải trong mặt cầu, phía sau được
 * dùng tới `backDepthFactor` lần bán kính. Khi cả đàn đứng yên đủ `shuffleIntervalMin`-`shuffleIntervalMax` giây
 * (chỉ đếm lúc không con nào đang bơi) thì chọn bộ điểm khác, gán ngẫu nhiên điểm cho cá, mỗi con bơi theo 1 đường
 * cong 3D dạng công thức (quét quanh tâm theo cung tròn, lặn ra sau) sang điểm mới, đầu quay theo hướng bơi. Lúc
 * đứng yên: trôi nhẹ tại chỗ (giả-Perlin noise) + nhấp nhô, nhìn nghiêng theo `restFacing`.
 *
 * Khác với bản Unity gốc: bỏ hẳn phần dành cho spawner/tap-collider của game gốc (ReserveArrival/Arrive/AddFlyIn/
 * Remove, anchor pool, Capacity) vì `fishes` ở đây là danh sách cố định dò 1 lần, không thêm/bớt lúc chạy; kích
 * thước cá dùng 3 tham số cấu hình tay (`fishHalfLength/Height/Width`) thay cho đọc collider; không có Gizmos.
 */
@ccclass('FishMove')
export class FishMove extends Component {
    @property({ type: [Fish], tooltip: 'Đàn cá - tự dò getComponentsInChildren(Fish) lúc start(), không cần gán tay', group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    fishes: Fish[] = [];

    @property({ tooltip: 'Bán kính khối cầu quanh node này', group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    radius = 300;
    @property({ range: [0, 0.5], tooltip: 'Lề giữa cá và mặt cầu, tính theo tỉ lệ bán kính', group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    zoneMargin = 0.05;
    @property({ tooltip: 'Nửa chiều dài cá (trục bơi) dùng để tính giãn cách - đầu-đuôi', group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    fishHalfLength = 40;
    @property({ tooltip: 'Nửa chiều cao cá - lưng-bụng', group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    fishHalfHeight = 15;
    @property({ tooltip: 'Nửa bề dày cá - ngang thân trái-phải', group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    fishHalfWidth = 8;
    @property({ tooltip: 'Bật = tự scale cá theo bán kính bằng fishSizeRatio. Tắt = giữ nguyên scale hiện có của cá', group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    scaleToRadius = false;
    @property({ range: [0.1, 1], tooltip: 'Chỉ dùng khi scaleToRadius bật: chiều dài cá so với bán kính', group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    fishSizeRatio = 0.45;
    @property({ range: [2, 6], tooltip: 'Số bộ điểm dựng sẵn cho mỗi số cá. Mỗi lần đổi chỗ chọn một bộ khác bộ đang dùng', group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    layoutSetCount = 3;
    @property({ range: [0, 3], tooltip: 'Cá được đứng lùi ra sau tâm tới bao nhiêu lần bán kính. <= 1 = luôn nằm gọn trong mặt cầu', group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    backDepthFactor = 1;
    @property({ tooltip: 'Khoảng hở tối thiểu giữa hai thân cá trong 3D, đã gồm biên độ bơi tại chỗ', group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    separationGap = 10;
    @property({ range: [0, 0.8], tooltip: "Mức chờm trên màn hình (2D) còn chấp nhận để coi bố cục là 'vừa'. Giãn điểm luôn cố gắng đưa về 0", group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    maxOverlap = 0.35;
    @property({ range: [4, 200], tooltip: 'Số vòng lặp đẩy nhau khi giãn mỗi bộ điểm', group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    relaxIterations = 64;
    @property({ range: [0, 100], tooltip: "Lực đẩy nhẹ ra xa tâm (XY) mỗi vòng relax, bù lại xu hướng co về tâm của contain() khi bố cục chật - 0 = tắt", group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    outwardBias = 0.03;
    @property({ tooltip: "Bật né nhau REAL-TIME lúc đang bơi (không chỉ ở điểm đích tĩnh như relax()) - cá nào bơi lại gần nhau quá sẽ tự đẩy tách trong lúc di chuyển", group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    avoidanceEnabled = true;
    @property({ range: [0, 20], tooltip: "Độ mạnh lực né nhau real-time (đơn vị/giây) - 0 = tắt hẳn dù avoidanceEnabled bật", group: { name: 'Bố cục 3D', id: '0', style: "section" } })
    avoidanceStrength = 4;

    @property({ tooltip: 'Cả đàn đứng yên ít nhất bấy nhiêu giây (ngẫu nhiên tới shuffleIntervalMax) thì đổi bộ điểm', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    shuffleIntervalMin = 10;
    @property({ tooltip: 'Cả đàn đứng yên nhiều nhất bấy nhiêu giây thì đổi bộ điểm', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    shuffleIntervalMax = 20;
    @property({ tooltip: 'Đàn 1 con cũng đổi chỗ. Tắt = 1 con đứng yên tại chỗ (chỉ trôi nhẹ)', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    shuffleSingle = false;
    @property({ type: Enum(FacingMode), tooltip: 'Hướng nhìn khi đứng yên: Free = nghiêng theo phía vừa bơi tới; Right/Left = luôn nhìn +X / -X', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    restFacing = FacingMode.Free;
    @property({ tooltip: 'Tốc độ bơi sang điểm mới theo cung cong (đơn vị/giây)', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    swimSpeed = 60;
    @property({ tooltip: 'Biên độ trôi quanh điểm khi đứng yên, theo cả 3 trục', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    hoverAmplitude = 6;
    @property({ tooltip: 'Tốc độ trôi quanh điểm (chu kỳ noise mỗi giây)', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    hoverFrequency = 0.25;
    @property({ tooltip: 'Nhấp nhô lên xuống', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    bobAmplitude = 3;
    @property({ tooltip: 'Tốc độ nhấp nhô (chu kỳ/giây)', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    bobFrequency = 1.1;
    @property({ tooltip: 'Tốc độ quay thân (độ/giây) khi đổi hướng bơi hoặc quay về tư thế nhìn nghiêng', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    turnSpeed = 200;
    @property({ tooltip: 'Quãng đường tăng tốc lúc xuất phát và giảm tốc lúc về đích, để không giật ở hai đầu đường bơi', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    easeDistance = 20;
    @property({ tooltip: 'Tốc độ mà tại đó cá bắt đầu quay đầu theo hướng bơi lúc đứng yên', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    flipSpeedThreshold = 5;
    @property({ range: [0, 3], tooltip: 'Speed của Fish (animator) khi cá đứng yên (vẫy đuôi nhẹ)', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    animSpeedIdle = 0.2;
    @property({ range: [0, 5], tooltip: 'Speed của Fish cộng thêm theo tốc độ bơi thực tế', group: { name: 'Bơi tại chỗ và đổi chỗ', id: '1', style: "section" } })
    animSpeedPerMeter = 0.03;

    @property({ range: [0.3, 2], tooltip: 'Nhân thêm vào bán kính cung bơi (so với bán kính nội suy tự nhiên giữa điểm đầu/cuối) - >1 vòng ra xa tâm hơn, <1 cắt gần tâm hơn, 1 = giữ nguyên', group: { name: 'Đường bơi khi đổi chỗ', id: '2', style: "section" } })
    pathRadiusScale = 1;
    @property({ range: [0, 2], tooltip: 'Mức lặn ra phía sau ở giữa đường, tính theo bán kính', group: { name: 'Đường bơi khi đổi chỗ', id: '2', style: "section" } })
    diveDepth = 0.25;
    @property({ range: [0, 360], tooltip: 'Góc quét tối thiểu quanh tâm (độ). Điểm mới quá gần theo chiều quay thì cá bơi thêm trọn một vòng', group: { name: 'Đường bơi khi đổi chỗ', id: '2', style: "section" } })
    minSweepAngle = 60;

    private fishStates: FishState[] = [];
    private layoutSets: Vec3[][] = [];
    private currentSetIndex = -1;
    private layoutFitsValue = true;
    private layoutRadius = -1;
    // `radius` (property) lúc computeLayouts() chạy lần gần nhất - so sánh riêng với layoutRadius (có thể đã bị
    // nới rộng tự động, xem computeLayouts) để phát hiện đúng lúc NGƯỜI DÙNG đổi `radius`, tránh so sánh nhầm với
    // layoutRadius khiến computeLayouts() bị gọi lại mỗi frame vô tận khi 2 giá trị này lệch nhau vĩnh viễn.
    private lastRadiusInput = -1;
    private layoutCount = -1;
    private shuffleTimer = 0;
    private clock = 0;
    private pathLengths = new Array<number>(PATH_SAMPLES + 1).fill(0);

    get count(): number { return this.fishStates.length; }
    get currentSet(): number { return this.currentSetIndex; }
    get layoutFits(): boolean { return this.layoutFitsValue; }
    get isShuffling(): boolean {
        for (const s of this.fishStates) {
            if (!s.fish) continue;
            if (s.onPath || Vec3.distance(s.pos, this.pointOf(s)) > this.hoverAmplitude + 0.15) return true;
        }
        return false;
    }

    init() {
        this.fishes = this.node.getComponentsInChildren(Fish);
        this.fishStates = this.fishes.map((f, i) => this.makeState(f, i));
        this.computeLayouts(this.fishStates.length);
        // Snap thẳng vào đúng điểm bố cục ngay lúc khởi tạo - nếu không, s.pos bắt đầu ở (0,0,0) (xem makeState)
        // còn pointOf(s) là điểm khác 0, smoothDampVec3 ở tickSlot() sẽ trôi êm từ đây tới đó, nhìn như "vừa vào
        // là bơi đổi chỗ ngay" dù không phải shuffle() thật. computeLayouts() vừa chạy nên pointOf(s) đã hợp lệ.
        for (const s of this.fishStates) {
            Vec3.copy(s.pos, this.pointOf(s));
            // Snap thẳng vào điểm đích nên velocity mỗi frame ~ 0 luôn - nhánh tự suy facing theo |velocity.x| >
            // flipSpeedThreshold trong tickSlot() sẽ không bao giờ kích hoạt được nữa (không còn quãng đường để
            // tạo ra vận tốc), khiến cá đứng nguyên rotation mặc định (nhìn thẳng cam) cho tới tận shuffle() thật
            // đầu tiên. Gán facing ngẫu nhiên + bật facingReady ngay để cá quay về tư thế nhìn nghiêng luôn.
            s.facing = this.resolveFacing(Math.random() < 0.5 ? -1 : 1);
            s.facingReady = true;
        }
        // Lúc đầu cho đổi chỗ luôn thay vì đứng yên chờ shuffleTimer (10-20s) mới bơi lần đầu - gọi shuffle() ngay
        // sau khi snap vào vị trí ban đầu, cá sẽ bơi luôn sang 1 điểm khác (cung tròn) ngay khi vừa xuất hiện.
        this.shuffle();
        this.shuffleTimer = randomRange(this.shuffleIntervalMin, this.shuffleIntervalMax);

        // setTimeout(() => {
            // let fishes = this.node.getComponentsInChildren(Fish);
            // fishes.forEach(fish => this.addFish(fish));
            // this.shuffleTimer = randomRange(this.shuffleIntervalMin, this.shuffleIntervalMax);
            // this.computeLayouts(this.fishStates.length);
        // }, 0);
    }

    update(dt: number) {
        this.clock += dt;
        this.tick(dt);
    }

    private makeState(fish: Fish, index: number): FishState {
        const s = new FishState();
        s.fish = fish;
        s.pointIndex = index;
        s.seed = Math.random() * 1000;
        s.facing = this.resolveFacing(Math.random() < 0.5 ? -1 : 1);
        s.halfLength = this.fishHalfLength;
        s.halfHeight = this.fishHalfHeight;
        s.halfWidth = this.fishHalfWidth;
        s.baseSize = Math.max(this.fishHalfLength, this.fishHalfHeight, this.fishHalfWidth, 0.005) * 2;
        // computeLayouts()/pointOf() coi (0,0,0) là tâm khối cầu chung cho mọi cá - nhưng fish.node thường KHÔNG
        // phải con trực tiếp của this.fish (vẫn nằm trong Thing/Bubble, lệch tâm theo poses[i]). Không reparent
        // (phá tween scale/rotation của Slot/Bubble trên thing.node, và Bubble.destroy() có thể không dọn đúng
        // fish nếu đã bị kéo sang cây khác) - thay vào đó lưu lại local position THẬT hiện tại làm `localOrigin`
        // cố định, còn `pos` chỉ biểu diễn phần dịch chuyển THÊM trong hệ khối cầu (bắt đầu = 0, tức chưa dịch
        // chuyển gì, khớp đúng vị trí hiện tại - không giật lúc khởi động). tickSlot() cộng lại localOrigin trước
        // khi ghi ra fish.node.position - toàn bộ vẫn thuần local, không cần world-space/reparent.
        Vec3.copy(s.localOrigin, fish.node.position);
        Vec3.copy(s.pos, Vec3.ZERO);
        Quat.copy(s.rotation, fish.node.rotation);
        s.hasPos = true;
        return s;
    }

    /**
     * Thêm 1 cá vào đàn (fish nên là con của `this.fish` - cùng gốc toạ độ với các cá khác, khớp không gian tính
     * điểm). Giữ nguyên vị trí/hướng hiện tại của cá rồi để Tick tự trôi dần về điểm mới (không giật, giống
     * `makeState` lúc khởi động). Nếu số cá mới vượt quá bộ điểm hiện có thì dựng lại bộ điểm ngay (cần thêm chỗ);
     * khác với `removeFish` không dựng lại ngay vì bớt chỗ thì không cần gấp. Bỏ qua nếu cá đã có trong đàn.
     */
    public addFish(fish: Fish): void {
        if (this.fishStates.some(s => s.fish === fish)) return;
        this.fishes.push(fish);
        this.fishStates.push(this.makeState(fish, this.fishStates.length));
        if (this.fishStates.length > this.layoutCount) this.computeLayouts(this.fishStates.length);
    }

    /**
     * Cá rời đàn (ví dụ bị bấm ra ngoài trong `Thing`): bỏ khỏi `fishes`/đàn, không đụng gì tới Node/component của
     * cá (bên gọi tự lo). Không dựng lại bộ điểm ngay ở đây - các con còn lại giữ nguyên `pointIndex` (điểm vừa
     * trống bỏ đó) nên không bị giật chỗ; bộ điểm cho số cá mới chỉ dựng lại ở lần đổi chỗ (`shuffle`) kế tiếp,
     * đúng như bản gốc `FishSchool.cs`. Trả về index cũ của cá trong `fishes`, -1 nếu cá không thuộc đàn.
     */
    public removeFish(fish: Fish) {
        // return;
        // Dừng luôn animation xương của cá ngay khi không còn FishMove nào quản lý vị trí nó nữa - để Fish.update()
        // (xoay xương liên tục) tiếp tục chạy trong lúc không có root nào ép vị trí/rotation mỗi frame gây mất
        // mesh ngẫu nhiên (xác nhận bằng cách tắt hẳn Fish.update() thì hết bug - rất có thể do cơ chế cache joint
        // transform real-time skinning của Cocos (skeletal-animation-utils.ts, Map toàn cục theo node.uuid, xoá/
        // dựng lại mỗi lần bindSkeleton() chạy lại) không ổn định khi nhiều SkinnedMeshRenderer real-time đồng thời
        // đổi trạng thái). Nơi nào cần cá tiếp tục vẫy (landing đúng slot) sẽ tự gọi lại setAnim(true).
        fish.setAnim(false);
        const index = this.fishStates.findIndex(s => s.fish === fish);
        if (index < 0) return -1;
        this.fishStates.splice(index, 1);
        const fi = this.fishes.indexOf(fish);
        if (fi >= 0) this.fishes.splice(fi, 1);
    }

    removeAllFishes(): void {
        // return;
        let fishes = [...this.fishes];
        this.fishStates = [];
        this.fishes = [];
        fishes.forEach(fish => {
            fish && fish.node.destroy();
        })
    }

    private resolveFacing(preferred: number): number {
        switch (this.restFacing) {
            case FacingMode.Right: return 1;
            case FacingMode.Left: return -1;
            default: return preferred;
        }
    }

    // ---------- Vòng lặp chính ----------

    private tick(dt: number): void {
        if (this.fishStates.length === 0) return;
        const wanted = this.fishStates.length;
        if (this.layoutCount < 0) this.computeLayouts(wanted);
        else if (Math.abs(this.lastRadiusInput - this.radius) > 1e-3) this.computeLayouts(this.layoutCount);

        for (const s of this.fishStates) this.applyScale(s);

        if (this.fishStates.length >= 2 || (this.shuffleSingle && this.fishStates.length === 1)) {
            const shuffling = this.isShuffling;
            if (!shuffling) this.shuffleTimer -= dt;
            if (this.shuffleTimer <= 0 && !shuffling) {
                this.shuffle();
                this.shuffleTimer = randomRange(this.shuffleIntervalMin, this.shuffleIntervalMax);
            }
        }

        this.computeAvoidance();
        for (const s of this.fishStates) this.tickSlot(s, dt);
    }

    private applyScale(s: FishState): void {
        if (!this.scaleToRadius || !s.fish) return;
        const scale = Math.max(0.01, this.radius * this.fishSizeRatio) / s.baseSize;
        s.fish.node.setScale(scale, scale, scale);
    }

    /**
     * Né nhau REAL-TIME: khác với relax() (chỉ giãn 1 lần lúc dựng bộ điểm đích tĩnh), hàm này chạy mỗi frame,
     * dùng vị trí THẬT hiện tại (s.pos, đã cùng hệ khối cầu nhờ localOrigin) của mọi cặp cá để tính lực đẩy tách -
     * áp dụng cả lúc đang bơi (onPath) lẫn lúc đứng yên, nên 2 con cá bơi cắt ngang nhau giữa đường cũng tự né.
     * Tính TRƯỚC vòng lặp tickSlot() (kiểu Jacobi, dùng vị trí đầu frame) để không thiên vị theo thứ tự xử lý.
     */
    private computeAvoidance(): void {
        for (const s of this.fishStates) s.avoidPush.set(0, 0, 0);
        if (!this.avoidanceEnabled || this.avoidanceStrength <= 0) return;

        const hx = this.maxHalfLength(), hy = this.maxHalfHeight(), hz = this.maxHalfWidth();
        const sizeX = 2 * hx + this.separationGap, sizeY = 2 * hy + this.separationGap, sizeZ = 2 * hz + this.separationGap;
        const n = this.fishStates.length;
        for (let i = 0; i < n; i++) {
            const a = this.fishStates[i];
            for (let j = i + 1; j < n; j++) {
                const b = this.fishStates[j];
                const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
                const ux = dx / sizeX, uy = dy / sizeY, uz = dz / sizeZ;
                const dist = Math.sqrt(ux * ux + uy * uy + uz * uz);
                if (dist >= 1) continue; // đủ xa (theo chuẩn hoá ellipsoid), không cần né
                const dirx = dist > 1e-4 ? ux / dist : 1, diry = dist > 1e-4 ? uy / dist : 0, dirz = dist > 1e-4 ? uz / dist : 0;
                const push = 1 - dist; // 0 (vừa chạm mép) .. 1 (trùng tâm)
                const wx = dirx * sizeX * push, wy = diry * sizeY * push, wz = dirz * sizeZ * push;
                a.avoidPush.x -= wx; a.avoidPush.y -= wy; a.avoidPush.z -= wz;
                b.avoidPush.x += wx; b.avoidPush.y += wy; b.avoidPush.z += wz;
            }
        }
    }

    // ---------- Bộ điểm ----------

    private pointOf(s: FishState): Vec3 { return this.pointAt(s.pointIndex); }

    private pointAt(index: number): Vec3 {
        if (this.currentSetIndex < 0 || this.currentSetIndex >= this.layoutSets.length) return new Vec3();
        const set = this.layoutSets[this.currentSetIndex];
        if (set.length === 0) return new Vec3();
        return set[clamp(index, 0, set.length - 1)];
    }

    private innerRadius(radius: number): number { return Math.max(0.05, radius * (1 - this.zoneMargin)); }

    /**
     * Dựng lại toàn bộ bộ điểm với n điểm cho bán kính hiện tại. Giữ bộ đang dùng và pointIndex đã gán nên chỉ đổi
     * cỡ thì điểm của từng con chỉ co giãn theo, không nhảy.
     */
    private computeLayouts(n: number): void {
        n = Math.max(n, this.fishStates.length);
        // Tự nới rộng bán kính nếu `radius` cấu hình không đủ chỗ xếp n cá mà không cắt/chồm quá maxOverlap - dùng
        // lại requiredRadius() (đã viết sẵn từ trước nhưng chưa từng được gọi ở đâu) thay vì để buildSet()/relax()/
        // contain() tự "chữa cháy" bằng cách co điểm về gần tâm khi thiếu chỗ - đó chính là nguyên nhân cá thỉnh
        // thoảng tụ tập ở tâm khi radius hơi chật so với số cá/kích thước cá.
        this.lastRadiusInput = this.radius;
        this.layoutRadius = Math.max(this.radius, this.requiredRadius(this.radius));
        this.layoutCount = n;
        this.layoutSets = [];
        if (n === 0) return;

        const hx = this.maxHalfLength(), hy = this.maxHalfHeight(), hz = this.maxHalfWidth();
        for (let k = 0; k < this.layoutSetCount; k++) this.layoutSets.push(this.buildSet(n, k, this.layoutRadius, hx, hy, hz));

        if (this.currentSetIndex < 0 || this.currentSetIndex >= this.layoutSets.length) this.currentSetIndex = 0;
        for (let i = 0; i < this.fishStates.length; i++) {
            const s = this.fishStates[i];
            if (s.pointIndex < 0 || s.pointIndex >= n) s.pointIndex = i;
        }

        this.layoutFitsValue = this.setFits(this.layoutSets[this.currentSetIndex], hx, hy, hz);
    }

    /** Một bộ điểm: mẫu chuẩn hoá được scale theo bán kính và kích thước cá rồi giãn cho không cắt nhau. */
    private buildSet(n: number, setIndex: number, radius: number, hx: number, hy: number, hz: number): Vec3[] {
        const inner = this.innerRadius(radius);
        const backDepth = radius * this.backDepthFactor;
        const ax = Math.max(0, inner - hx);
        const ay = Math.max(0, inner - hy);
        const azFront = Math.max(0, inner - hz);
        const azBack = Math.max(0, backDepth - hz);

        const template = FishMove.template(n, setIndex);
        const pts: Vec3[] = new Array(n);
        for (let i = 0; i < n; i++) {
            const t = template[i];
            const z = t.z < 0 ? t.z * azFront : t.z * azBack;
            pts[i] = new Vec3(t.x * ax, t.y * ay, z);
        }
        this.relax(pts, inner, backDepth, hx, hy, hz);
        return pts;
    }

    /**
     * Mẫu chuẩn hoá: x, y trong [-1, 1]; z âm = về phía trước (trong mặt cầu), z dương = ra sau (tới
     * backDepthFactor). n = 1 không có gì để chia đều nên đứng giữa; n >= 2 xếp thành vòng tròn đều, mỗi con cách
     * nhau đúng 360/n độ quanh tâm, đồng thời trải đều theo Z để đảm bảo khoảng hở tối thiểu theo Z giữa MỌI cặp
     * (không chỉ 2 láng giềng trên vòng) - z chuẩn hoá đi từ -1 đến 1 theo n mức đều nhau, gán cho từng điểm qua 1
     * hoán vị xoay vòng theo setIndex (mỗi bộ dùng đủ n mức, chỉ đổi điểm nào ứng với mức nào).
     */
    private static template(n: number, setIndex: number): Vec3[] {
        if (n === 1) return [new Vec3(0, 0, 0)];

        // Vòng tròn đều n điểm quanh tâm, cách đều 360/n độ - mỗi bộ (setIndex) xoay lệch 1 góc để đổi chỗ trông
        // khác bộ trước.
        const pts: Vec3[] = new Array(n);
        const baseDeg = setIndex * (360 / n) / 3;
        for (let i = 0; i < n; i++) {
            const a = (baseDeg + 360 * i / n) * DEG2RAD;
            // Hoán vị xoay vòng (i + setIndex) % n vẫn là 1 hoán vị đủ {0..n-1} nên luôn dùng hết n mức Z, chỉ đổi
            // điểm nào nhận mức nào giữa các bộ - hiệu 2 mức Z bất kỳ luôn là bội số của 2/(n-1) (quy đổi ra
            // khoảng hở thật theo azFront/azBack ở buildSet()), đảm bảo KHÔNG có 2 điểm nào trùng mức Z.
            const zIndex = (i + setIndex) % n;
            const zNorm = (zIndex / (n - 1)) * 2 - 1;
            pts[i] = new Vec3(Math.cos(a) * 0.7, Math.sin(a) * 0.7, zNorm);
        }
        return pts;
    }

    /**
     * Thân cá coi là ellipsoid bán trục (hx, hy, hz). Hai ellipsoid không cắt nhau khi khoảng cách chuẩn hoá 3D
     * >= 1; trên màn hình tương tự với khoảng cách chuẩn hoá 2D theo XY. Giãn: cặp cắt nhau 3D bị đẩy tách theo
     * hướng chuẩn hoá (ưu tiên z vì phía sau còn chỗ), cặp chờm 2D bị đẩy nhẹ tách theo XY; sau mỗi vòng ép điểm
     * vào vùng cho phép. Gom lực mọi cặp rồi áp dụng trung bình (kiểu Jacobi) để điểm ở giữa 2 điểm khác dừng đúng
     * chỗ cân bằng.
     */
    private relax(pts: Vec3[], inner: number, backDepth: number, hx: number, hy: number, hz: number): void {
        const n = pts.length;
        const sizeX = 2 * hx + this.separationGap;
        const sizeY = 2 * hy + this.separationGap;
        const sizeZ = 2 * hz + this.separationGap;
        const accX = new Array(n).fill(0), accY = new Array(n).fill(0), accZ = new Array(n).fill(0);
        const cnt = new Array(n).fill(0);
        const sphereBack = this.backDepthFactor <= 1;

        for (let it = 0; it < this.relaxIterations; it++) {
            const soft = it < this.relaxIterations / 2 ? 0.4 : 0.15;
            for (let i = 0; i < n; i++) { accX[i] = 0; accY[i] = 0; accZ[i] = 0; cnt[i] = 0; }

            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y, dz = pts[j].z - pts[i].z;
                    const ux = dx / sizeX, uy = dy / sizeY, uz = dz / sizeZ;
                    const n3 = Math.sqrt(ux * ux + uy * uy + uz * uz);
                    if (n3 < 1) {
                        let dirx = n3 > 1e-4 ? ux / n3 : 0, diry = n3 > 1e-4 ? uy / n3 : 0, dirz = n3 > 1e-4 ? uz / n3 : 1;
                        dirz += 0.35 * (dirz >= 0 ? 1 : -1);
                        const dlen = Math.sqrt(dirx * dirx + diry * diry + dirz * dirz) || 1;
                        dirx /= dlen; diry /= dlen; dirz /= dlen;
                        const push = (1 - n3) * 0.5;
                        const wx = dirx * sizeX * push, wy = diry * sizeY * push, wz = dirz * sizeZ * push;
                        accX[i] -= wx; accY[i] -= wy; accZ[i] -= wz;
                        accX[j] += wx; accY[j] += wy; accZ[j] += wz;
                        cnt[i]++; cnt[j]++;
                    }

                    const n2 = Math.sqrt((dx / sizeX) * (dx / sizeX) + (dy / sizeY) * (dy / sizeY));
                    if (n2 < 1) {
                        const dir2x = n2 > 1e-4 ? (dx / sizeX) / n2 : 1, dir2y = n2 > 1e-4 ? (dy / sizeY) / n2 : 0;
                        const push = (1 - n2) * 0.5 * soft;
                        const wx = dir2x * sizeX * push, wy = dir2y * sizeY * push;
                        accX[i] -= wx; accY[i] -= wy;
                        accX[j] += wx; accY[j] += wy;
                        cnt[i]++; cnt[j]++;
                    }
                }
            }

            for (let i = 0; i < n; i++) {
                if (cnt[i] > 0) { pts[i].x += accX[i] / cnt[i]; pts[i].y += accY[i] / cnt[i]; pts[i].z += accZ[i] / cnt[i]; }
                // Đẩy nhẹ ra xa tâm (XY) - contain() bên dưới co điểm về đúng gốc (0,0) khi ellipse không vừa
                // vùng tròn, nếu bố cục chật thì nhiều điểm cùng bị co về 1 chỗ và chồng lên nhau; lực này bù lại,
                // giúp điểm có xu hướng dạt sát biên khối cầu thay vì co cụm ở tâm khi có chỗ trống để dạt ra.
                if (this.outwardBias > 0) {
                    const r = Math.hypot(pts[i].x, pts[i].y);
                    if (r > 1e-4) {
                        const push = this.outwardBias * (sizeX + sizeY) * 0.5;
                        pts[i].x += (pts[i].x / r) * push;
                        pts[i].y += (pts[i].y / r) * push;
                    }
                }
                FishMove.contain(pts[i], inner, backDepth, hx, hy, hz, sphereBack);
            }
        }
    }

    /** Ép một điểm vào vùng cho phép: ellipse thân cá nằm trong hình chiếu tròn, mặt trước trong mặt cầu, mặt sau không quá backDepth. */
    private static contain(p: Vec3, inner: number, backDepth: number, hx: number, hy: number, hz: number, sphereBack: boolean): void {
        const inner2 = inner * inner;
        // Không co về sát tâm (0,0) - dù ellipse chưa vừa hẳn vùng tròn, dừng co ngay khi bán kính còn lại chạm
        // sàn tối thiểu (theo kích thước cá) thay vì co tiếp tới gần 0. Tránh nhiều điểm cùng lúc không vừa đều bị
        // dồn về đúng 1 chỗ giữa tâm (nguyên nhân cá chồng lên nhau khi bố cục quá chật) - thà chấp nhận chồm nhẹ
        // còn hơn co về trùng nhau ở giữa.
        const minR2 = Math.max(hx, hy) * Math.max(hx, hy);
        for (let k = 0; k < 16; k++) {
            if (FishMove.ellipseInsideCircle(p.x, p.y, hx, hy, inner2)) break;
            if (p.x * p.x + p.y * p.y <= minR2) break; // chạm sàn tối thiểu, chịu chồm thay vì co tiếp
            p.x *= 0.9; p.y *= 0.9;
        }

        const rr = inner2 - p.x * p.x - p.y * p.y;
        const half = Math.sqrt(Math.max(0, rr));
        const zFront = -half + hz;
        let zBack = backDepth - hz;
        if (sphereBack) zBack = Math.min(zBack, half - hz);
        if (zBack < zFront) zBack = zFront;
        p.z = clamp(p.z, zFront, zBack);
    }

    private static ellipseInsideCircle(cx: number, cy: number, hx: number, hy: number, radius2: number): boolean {
        for (let k = 0; k < 12; k++) {
            const a = k * (Math.PI * 2 / 12);
            const px = cx + Math.cos(a) * hx;
            const py = cy + Math.sin(a) * hy;
            if (px * px + py * py > radius2) return false;
        }
        return true;
    }

    private static normalized3D(dx: number, dy: number, dz: number, hx: number, hy: number, hz: number, gap: number): number {
        const x = dx / (2 * hx + gap), y = dy / (2 * hy + gap), z = dz / (2 * hz + gap);
        return Math.sqrt(x * x + y * y + z * z);
    }

    private static normalized2D(dx: number, dy: number, hx: number, hy: number): number {
        const x = dx / (2 * hx), y = dy / (2 * hy);
        return Math.sqrt(x * x + y * y);
    }

    /** Bộ điểm có đạt: không cắt nhau trong 3D (với nửa khoảng hở) và chờm 2D không quá maxOverlap. */
    private setFits(pts: Vec3[], hx: number, hy: number, hz: number): boolean {
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y, dz = pts[j].z - pts[i].z;
                if (FishMove.normalized3D(dx, dy, dz, hx, hy, hz, this.separationGap * 0.5) < 1) return false;
                if (1 - FishMove.normalized2D(dx, dy, hx, hy) > this.maxOverlap) return false;
            }
        }
        return true;
    }

    /** Bán kính nhỏ nhất để mọi bộ điểm của đàn hiện tại đạt (không cắt 3D, chờm 2D không quá maxOverlap). */
    public requiredRadius(currentRadius: number): number {
        const n = this.fishStates.length;
        if (n === 0 || this.scaleToRadius) return currentRadius;

        const hx = this.maxHalfLength(), hy = this.maxHalfHeight(), hz = this.maxHalfWidth();
        let lo = 0.05, hi = 5000;
        for (let it = 0; it < 24; it++) {
            const mid = (lo + hi) * 0.5;
            let ok = true;
            for (let k = 0; k < this.layoutSetCount && ok; k++) ok = this.setFits(this.buildSet(n, k, mid, hx, hy, hz), hx, hy, hz);
            if (ok) hi = mid; else lo = mid;
        }
        return hi * 1.02;
    }

    private maxHalfLength(): number { let m = 0; for (const s of this.fishStates) m = Math.max(m, this.scaledHalfLength(s)); return m; }
    private maxHalfHeight(): number { let m = 0; for (const s of this.fishStates) m = Math.max(m, this.scaledHalfHeight(s)); return m; }
    private maxHalfWidth(): number { let m = 0; for (const s of this.fishStates) m = Math.max(m, this.scaledHalfWidth(s)); return m; }
    private scaledHalfLength(s: FishState): number { return s.halfLength * (s.fish ? s.fish.node.scale.x : 1); }
    private scaledHalfHeight(s: FishState): number { return s.halfHeight * (s.fish ? s.fish.node.scale.y : 1); }
    private scaledHalfWidth(s: FishState): number { return s.halfWidth * (s.fish ? s.fish.node.scale.z : 1); }

    // ---------- Đổi chỗ ----------

    /** Chọn một bộ điểm khác bộ đang dùng, gán ngẫu nhiên điểm cho cá rồi cả đàn bơi sang. */
    private shuffle(): void {
        const n = this.fishStates.length;
        if (n === 0) return;
        const wanted = n;
        const relayout = this.layoutCount !== wanted;
        if (relayout) this.computeLayouts(wanted);
        if (this.layoutSets.length === 0) return;
        if (!relayout && (this.layoutSets.length < 2 || (n < 2 && !this.shuffleSingle))) return;

        let next: number;
        if (relayout || this.layoutSets.length < 2) {
            next = Math.floor(Math.random() * this.layoutSets.length);
        } else {
            next = Math.floor(Math.random() * (this.layoutSets.length - 1));
            if (next >= this.currentSetIndex) next++;
        }
        this.currentSetIndex = next;

        const avail: number[] = [];
        for (let p = 0; p < this.layoutCount; p++) avail.push(p);
        for (let i = avail.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [avail[i], avail[j]] = [avail[j], avail[i]];
        }

        const dir = Math.random() < 0.5 ? -1 : 1; // cả đàn quét cùng chiều quanh tâm
        for (let i = 0; i < n; i++) {
            const s = this.fishStates[i];
            if (i < avail.length) s.pointIndex = avail[i];
            s.onPath = true;
            Vec3.copy(s.pathStart, s.pos);
            s.pathDir = dir;
            s.pathProgress = 0;
            s.pathExtraLoops = (this.sweepAngle(s, 0) * RAD2DEG) < this.minSweepAngle ? 1 : 0;
        }
    }

    // ---------- Bơi ----------

    /** Góc quét quanh tâm (rad, dương) từ vị trí xuất phát tới điểm đích theo chiều pathDir, cộng số vòng phụ. */
    private sweepAngle(s: FishState, extraLoops: number): number {
        const end = this.pointOf(s);
        const a0 = Math.atan2(s.pathStart.y, s.pathStart.x);
        const a1 = Math.atan2(end.y, end.x);
        const delta = repeat(s.pathDir * (a1 - a0), Math.PI * 2);
        return delta + extraLoops * Math.PI * 2;
    }

    /**
     * Đường bơi 3D dạng công thức liên tục: quét góc đều quanh tâm theo mặt phẳng XY, bán kính XY nội suy THẲNG
     * (không phình ra mép) nên khi r0 ≈ r1 (các điểm bố cục giờ cùng nằm trên 1 vòng tròn, xem template()) đường
     * đi gần như đúng 1 cung tròn quanh tâm; z nội suy và lặn ra phía sau ở giữa đường (diveDepth). Vị trí và tiếp
     * tuyến lấy trực tiếp từ công thức nên không gấp khúc; bảng chiều dài chỉ dùng để đổi quãng đường đã bơi sang
     * tham số t.
     */
    private buildPath(s: FishState): PathParams {
        const end = this.pointOf(s);
        const r0 = Math.hypot(s.pathStart.x, s.pathStart.y);
        const r1 = Math.hypot(end.x, end.y);
        return {
            r0, r1,
            a0: Math.atan2(s.pathStart.y, s.pathStart.x),
            sweep: this.sweepAngle(s, s.pathExtraLoops),
            dir: s.pathDir,
            z0: s.pathStart.z,
            z1: end.z,
            dive: this.diveDepth * this.layoutRadius,
            radiusScale: this.pathRadiusScale,
            end: end.clone(),
        };
    }

    private static evalPath(p: PathParams, t: number): Vec3 {
        if (t >= 1) return p.end.clone();
        const r = lerp(p.r0, p.r1, t) * p.radiusScale;
        const a = p.a0 + p.dir * p.sweep * t;
        const z = lerp(p.z0, p.z1, t) + p.dive * Math.sin(t * Math.PI);
        return new Vec3(Math.cos(a) * r, Math.sin(a) * r, z);
    }

    /** Tiếp tuyến (đã chuẩn hoá) của đường tại t, lấy bằng sai phân nhỏ trên công thức. */
    private static pathTangent(p: PathParams, t: number): Vec3 {
        const h = 0.004;
        const a = FishMove.evalPath(p, Math.min(1, t + h));
        const b = FishMove.evalPath(p, Math.max(0, t - h));
        const d = new Vec3(a.x - b.x, a.y - b.y, a.z - b.z);
        if (d.lengthSqr() > 1e-10) { Vec3.normalize(d, d); return d; }
        return new Vec3();
    }

    /** Dựng bảng chiều dài tích luỹ theo t đều, trả về tổng chiều dài. */
    private buildLengthTable(p: PathParams): number {
        let total = 0;
        let prev = FishMove.evalPath(p, 0);
        this.pathLengths[0] = 0;
        for (let i = 1; i <= PATH_SAMPLES; i++) {
            const cur = FishMove.evalPath(p, i / PATH_SAMPLES);
            total += Vec3.distance(prev, cur);
            this.pathLengths[i] = total;
            prev = cur;
        }
        return total;
    }

    /** Đổi quãng đường đã bơi sang tham số t (nội suy trong bảng chiều dài). */
    private tFromLength(length: number): number {
        for (let i = 1; i <= PATH_SAMPLES; i++) {
            if (length > this.pathLengths[i]) continue;
            const seg = this.pathLengths[i] - this.pathLengths[i - 1];
            const f = seg > 1e-6 ? (length - this.pathLengths[i - 1]) / seg : 1;
            return (i - 1 + f) / PATH_SAMPLES;
        }
        return 1;
    }

    /**
     * Hướng mục tiêu khi bơi: nhìn theo dir, lưng hướng lên trời khi bơi ngang; khi hướng bơi gần thẳng đứng thì
     * pha trộn dần sang giữ nguyên "lưng" hiện tại (up của thân cá) thay vì world-up đã suy biến, trong khoảng
     * |dir.y| 0.7 đến 0.95 nên không lật đột ngột khi bơi lên xuống. Dùng nlerp (lerp + chuẩn hoá) thay cho
     * Vector3.Slerp gốc giữa 2 vector đơn vị - xấp xỉ đủ tốt cho góc không quá lớn.
     */
    private static headingTowards(current: Quat, dir: Vec3): Quat {
        const worldUp = projectOnPlane(new Vec3(), Vec3.UP, dir);
        let ownUp = projectOnPlane(new Vec3(), Vec3.transformQuat(new Vec3(), Vec3.UP, current), dir);
        if (ownUp.lengthSqr() < 1e-6) ownUp = projectOnPlane(new Vec3(), Vec3.transformQuat(new Vec3(), Vec3.RIGHT, current), dir);
        if (worldUp.lengthSqr() < 1e-6) Vec3.copy(worldUp, ownUp);
        if (ownUp.lengthSqr() < 1e-6) { Quat.fromViewUp(_tmpQ, dir, Vec3.UP); return _tmpQ.clone(); }

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

    private tickSlot(s: FishState, dt: number): void {
        const fish = s.fish;
        if (!fish || !fish.node) return;

        let newPos: Vec3;
        let pathTangent = new Vec3();
        // console.log(s.onPath);
        // s.onPath = true;
        if (s.onPath) {
            const path = this.buildPath(s);
            const total = this.buildLengthTable(path);

            // Tăng tốc ở đầu, giảm tốc về đích, không thấp hơn 25% để không lết.
            const ease = Math.max(0.05, this.easeDistance);
            let ramp = Math.min((s.pathProgress + 0.05) / ease, (total - s.pathProgress + 0.05) / ease);
            ramp = clamp(ramp, 0.25, 1);
            s.pathProgress += this.swimSpeed * ramp * dt;

            if (s.pathProgress >= total) {
                newPos = path.end.clone();
                pathTangent = FishMove.pathTangent(path, 1);
                s.onPath = false;
                if (Math.abs(pathTangent.x) > 0.2) { s.facing = this.resolveFacing(pathTangent.x >= 0 ? 1 : -1); s.facingReady = true; }
                Vec3.multiplyScalar(s.hoverVel, pathTangent, this.swimSpeed * 0.25);
            } else {
                const t = this.tFromLength(s.pathProgress);
                newPos = FishMove.evalPath(path, t);
                pathTangent = FishMove.pathTangent(path, t);
            }
        } else {
            const t = this.clock * this.hoverFrequency + s.seed;
            const drift = new Vec3(
                (noise1(t, s.seed) - 0.5) * 2 * this.hoverAmplitude,
                (noise1(s.seed, t * 0.8) - 0.5) * 2 * this.hoverAmplitude,
                (noise1(t * 0.6, s.seed + 37) - 0.5) * 2 * this.hoverAmplitude * 0.5,
            );
            const target = Vec3.add(new Vec3(), this.pointOf(s), drift);

            if (!s.hasPos) {
                Vec3.copy(s.pos, target);
                s.hoverVel.set(0, 0, 0);
                s.hasPos = true;
            }

            newPos = new Vec3();
            smoothDampVec3(s.pos, target, s.hoverVel, 0.35, this.swimSpeed, dt, newPos);
        }

        // Né nhau real-time (xem computeAvoidance) - cộng thêm vào newPos dù đang bơi (onPath) hay đứng yên, để
        // 2 con cá bơi cắt ngang nhau giữa đường cũng tự tách ra thay vì chỉ né đúng lúc đứng yên ở điểm đích.
        if (this.avoidanceEnabled && this.avoidanceStrength > 0) {
            newPos.x += s.avoidPush.x * this.avoidanceStrength * dt;
            newPos.y += s.avoidPush.y * this.avoidanceStrength * dt;
            newPos.z += s.avoidPush.z * this.avoidanceStrength * dt;
        }

        Vec3.set(_tmpV, dt > 0 ? (newPos.x - s.pos.x) / dt : 0, dt > 0 ? (newPos.y - s.pos.y) / dt : 0, dt > 0 ? (newPos.z - s.pos.z) / dt : 0);
        const velocity = _tmpV;
        Vec3.copy(s.pos, newPos);

        // Đang bơi: quay đầu theo tiếp tuyến đường bơi trong 3D. Đứng yên: về tư thế nhìn nghiêng trái/phải.
        const speed = velocity.length();
        let targetRot: Quat;
        if (s.onPath && (pathTangent.x !== 0 || pathTangent.y !== 0 || pathTangent.z !== 0)) {
            targetRot = FishMove.headingTowards(s.rotation, pathTangent);
        } else {
            if (s.facingLock > 0) s.facingLock -= dt;
            else if (Math.abs(velocity.x) > this.flipSpeedThreshold) { s.facing = this.resolveFacing(velocity.x >= 0 ? 1 : -1); s.facingReady = true; }
            // Chưa có velocity thật lần nào (mới thêm vào đàn, đứng yên) thì đừng ép quay theo facing random lúc
            // makeState() - giữ nguyên rotation hiện tại, tránh quay gấp vô cớ rồi phải quay ngược lại lần 2 khi
            // velocity thật tính ra (xem giải thích ở FishState.facingReady).
            if (s.facingReady) Quat.fromEuler(_tmpQ, 0, s.facing * 90, 0);
            else Quat.copy(_tmpQ, s.rotation);
            targetRot = _tmpQ;
        }

        rotateTowardsQuat(s.rotation, s.rotation, targetRot, this.turnSpeed * dt);

        const bob = Math.sin((this.clock * this.bobFrequency + s.seed) * Math.PI * 2) * this.bobAmplitude;
        // Cộng lại localOrigin (offset local thật từ cha thật của fish.node, xem makeState) - pos ở đây vẫn thuần
        // trong hệ khối cầu (0,0,0 = tâm), cộng vào mới ra đúng local position cần ghi.
        Vec3.set(_finalPos, s.localOrigin.x + s.pos.x, s.localOrigin.y + s.pos.y + bob, s.localOrigin.z + s.pos.z);
        fish.node.setPosition(_finalPos);
        fish.node.setRotation(s.rotation);

        fish.speed = this.animSpeedIdle + speed * this.animSpeedPerMeter;
        fish.updateCustom(dt);
    }
}
