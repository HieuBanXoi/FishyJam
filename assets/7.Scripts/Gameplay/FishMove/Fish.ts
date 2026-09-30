import { _decorator, Component, Node, Quat, Vec3, SkeletalAnimation, clamp, clamp01, lerp, inverseLerp, tween, Tween, v3 } from 'cc';
import { Thing } from '../Thing';
import { CustomFishAnim } from './CustomFishAnim';
const { ccclass, property } = _decorator;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const HIST = 128; // lịch sử tốc độ góc để lấy mẫu trễ theo vị trí trên thân

/** Vây ngực, vây bụng, vây lưng, vây đuôi. */
export enum FinRole { Pectoral, Pelvic, Dorsal, Anal }

enum BoneKind { Body, Head, SideFin, CenterFin }

class Bone {
    node!: Node;
    bindLocal = new Quat();
    kind: BoneKind = BoneKind.Body;
    role: FinRole = FinRole.Pectoral;
    along = 0;              // 0 = gốc chuỗi thân (Spine1), 1 = chóp đuôi
    chain = 0;              // đốt thứ mấy trong vây (0 = gốc)
    side = 0;               // -1 / +1 vây trái / phải
    tipSign = 1;            // vây giữa: +1 chóp hướng lên (vây lưng), -1 hướng xuống (vây đuôi)
    finAxis = new Vec3();   // trục gốc -> chóp vây (root space), vây bên
}

interface FinChainData {
    role: FinRole;
    side: number;
    segments: Node[];
}

// Quy ước đặt tên bone, giống rig Fish_Rig / Fish_1 (Graphics gốc):
//   Root > Spine1..N rồi Tail1..N: chuỗi thân đầu -> đuôi; Head: con của Spine1;
//   Fin_<vị trí>_<bên>_<đốt>: T_F / T_B = vây lưng trước / sau, B_M = vây đuôi, B_L / B_R = vây bụng, M_L / M_R = vây ngực;
//   bone *_end là chóp, không có skin, bỏ qua.
//   Biến thể Fish_1: Spine_01..N (không có Tail), Fin_<vị trí>_<đốt>_<bên>, Fin_<đốt>_B = vây đuôi.
const BODY_BONE_RE = /^(Spine|Tail)_?(\d+)$/i;
const FIN_BONE_RE = /^Fin_([TBM])_([FBLRM])_(\d+)$/i;              // Fin_M_L_1 (Fish_Rig)
const FIN_BONE_INDEX_FIRST_RE = /^Fin_([TBM])_(\d+)_([FBLRM])$/i;  // Fin_M_01_L (Fish_1)
const FIN_BONE_INDEX_PREFIX_RE = /^Fin_(\d+)_([TBM])_([FBLRM])$/i; // Fin_1_M_L (Spine_1)
const FIN_BONE_CENTER_RE = /^Fin_(\d+)_([TB])$/i;                  // Fin_01_B: thiếu <bên> = vây giữa

/** Tên vây -> key "<vị trí>_<bên>" + số đốt. Nhận cả 2 thứ tự tên; thiếu <bên> coi là vây giữa (B -> B_M, T -> T_M). */
function tryParseFinName(name: string): { key: string; index: number } | null {
    let m = FIN_BONE_RE.exec(name);
    if (m) return { key: `${m[1]}_${m[2]}`.toUpperCase(), index: parseInt(m[3], 10) };
    m = FIN_BONE_INDEX_FIRST_RE.exec(name);
    if (m) return { key: `${m[1]}_${m[3]}`.toUpperCase(), index: parseInt(m[2], 10) };
    m = FIN_BONE_INDEX_PREFIX_RE.exec(name);
    if (m) return { key: `${m[2]}_${m[3]}`.toUpperCase(), index: parseInt(m[1], 10) };
    m = FIN_BONE_CENTER_RE.exec(name);
    if (m) return { key: `${m[2]}_M`.toUpperCase(), index: parseInt(m[1], 10) };
    return null;
}

/** Fin_<vị trí>_<bên>: M_L / M_R = vây ngực, B_L / B_R = vây bụng, B_M = vây đuôi, T_* = vây lưng. */
function tryGetFinRole(key: string): { role: FinRole; side: number } | null {
    const pos = key[0];
    const sd = key[2];
    const side = sd === 'L' ? -1 : sd === 'R' ? 1 : 0;
    switch (pos) {
        case 'M': return side !== 0 ? { role: FinRole.Pectoral, side } : null;
        case 'B': return { role: side !== 0 ? FinRole.Pelvic : FinRole.Anal, side };
        case 'T': return { role: FinRole.Dorsal, side };
        default: return null;
    }
}

function nodeDepth(n: Node): number {
    let d = 0;
    let cur = n.parent;
    while (cur) { d++; cur = cur.parent; }
    return d;
}

function collectDescendants(root: Node, out: Node[]): void {
    for (const c of root.children) {
        out.push(c);
        collectDescendants(c, out);
    }
}

// scratch dùng chung mỗi frame để tránh cấp phát (GC) trong vòng lặp bone
const _qA = new Quat();
const _qB = new Quat();
const _qInv = new Quat();
const _qResult = new Quat();
const _v = new Vec3();
const _vFinAxisWorld = new Vec3();

/**
 * Animator procedural cho cá: skeleton import từ FBX/glb, không dùng animation clip, mỗi frame tự xoay bone so
 * với bind pose (localRotation lúc onLoad). Bản port từ FishProceduralAnimator/FishRigProceduralAnimator (C#, Unity).
 *
 * Trục trong root space (local space của node component này): đầu +Z, lưng +Y, phải +X.
 * Chuyển động mỗi frame:
 *  - thân: sóng đầu -> đuôi theo swayProfileExponent + uốn theo đường bơi (đo tốc độ góc rẽ/ngóc-chúi của chính node);
 *    đầu lắc ngược pha nhẹ để mắt cá ổn định;
 *  - vây ngực: quét tới lui quanh trục dọc + xoắn quanh trục gốc->chóp lệch pha 90°, đốt sau trễ pha, trái/phải so le,
 *    gập ra sau khi bơi nhanh, vẫy nhiều hơn khi bơi chậm;
 *  - vây bụng: như vây ngực, biên độ nhỏ hơn và lệch pha riêng;
 *  - vây lưng / vây đuôi: nghiêng sang hai bên quanh trục thân theo sóng thân tại gốc vây, đốt sau trễ pha.
 *
 * Khác với bản Unity:
 *  - Không có nút "Find Bones" ở editor: bone được dò theo tên (regex phía trên) tự động mỗi lần build() (onLoad),
 *    quét toàn bộ con cháu của `rig` (hoặc chính node này nếu để trống).
 *  - swayProfile (AnimationCurve) được thay bằng along^swayProfileExponent (Cocos không có ô chỉnh AnimationCurve
 *    tiện dụng cho component tự viết); exponent ~1.7 xấp xỉ curve gốc (0, 0.05) - (0.5, 0.3) - (1, 1).
 *  - Không cần nới bounds (boundsPadding) như SkinnedMeshRenderer của Unity: SkinnedMeshRenderer real-time của
 *    Cocos tự tính lại bounds theo joint mỗi frame.
 *  - SkinnedMeshRenderer ở Cocos có thể chạy "baked skinning" (bake animation ra texture) nếu model có
 *    SkeletalAnimation + AnimationClip; khi đó xoay bone bằng tay sẽ không lên hình. build() tự tắt
 *    useBakedAnimation nếu tìm thấy SkeletalAnimation trong rig.
 */
@ccclass('Fish')
export class Fish extends Component {
    @property({ type: Node, tooltip: 'Gốc để dò bone (Spine/Tail/Head/Fin_*); để trống = chính node này', group: { name: 'Bone', id: '0', style: "section" } })
    rig: Node | null = null;

    @property({ tooltip: 'độ mỗi đốt khi rẽ 90°/giây', group: { name: 'Uốn thân theo đường bơi', id: '1', style: "section" } })
    turnBend = 7;
    @property({ tooltip: 'độ mỗi đốt khi ngóc / chúi 90°/giây', group: { name: 'Uốn thân theo đường bơi', id: '1', style: "section" } })
    pitchBend = 5;
    @property({ tooltip: 'giây trễ tại chóp đuôi so với đầu (uốn lan từ đầu xuống)', group: { name: 'Uốn thân theo đường bơi', id: '1', style: "section" } })
    bendDelay = 0.3;
    @property({ tooltip: 'lọc rung tốc độ góc (càng lớn càng nhạy)', group: { name: 'Uốn thân theo đường bơi', id: '1', style: "section" } })
    bendSmoothing = 10;
    @property({ group: { name: 'Uốn thân theo đường bơi', id: '1', style: "section" } })
    maxBendPerBone = 14;

    @property({ tooltip: '1 = bơi bình thường; set theo vận tốc thực từ script điều khiển bơi', group: { name: 'Chung', id: '2', style: "section" } })
    private _speed = 1;
    @property({ group: { name: 'Chung', id: '2', style: "section" } })
    randomizeTimeOffset = true;
    @property({ group: { name: 'Chung', id: '2', style: "section" } })
    timeOffset = 0;

    @property({ tooltip: 'Hz khi Speed = 1', group: { name: 'Sóng thân / đuôi', id: '3', style: "section" } })
    swayFrequency = 1.8;
    @property({ tooltip: 'độ mỗi đốt khi Speed = 1, nhân với profile; cộng dồn ra chóp đuôi', group: { name: 'Sóng thân / đuôi', id: '3', style: "section" } })
    swayAngle = 12;
    @property({ tooltip: 'theo chiều dài cá; thân ngắn ít đốt nên để dài (uốn chữ C), ~1 mới ra chữ S', group: { name: 'Sóng thân / đuôi', id: '3', style: "section" } })
    waveLength = 2;
    @property({ tooltip: 'biên độ đầu(0) -> đuôi(1) = along ^ exponent, xấp xỉ curve gốc (0,0.05)-(0.5,0.3)-(1,1)', group: { name: 'Sóng thân / đuôi', id: '3', style: "section" } })
    swayProfileExponent = 1.7;
    @property({ tooltip: 'độ: đầu lắc ngược pha với sóng thân', group: { name: 'Sóng thân / đuôi', id: '3', style: "section" } })
    headSway = 2;

    @property({ tooltip: 'Hz khi Speed = 1 (nhanh hơn đuôi)', group: { name: 'Vây ngực (Fin_M_L / Fin_M_R)', id: '4', style: "section" } })
    finFrequency = 2.2;
    @property({ tooltip: 'quét tới lui ở gốc vây', group: { name: 'Vây ngực (Fin_M_L / Fin_M_R)', id: '4', style: "section" } })
    finAngle = 14;
    @property({ tooltip: 'xoắn quanh trục gốc->chóp, lệch pha 90° so với quét', group: { name: 'Vây ngực (Fin_M_L / Fin_M_R)', id: '4', style: "section" } })
    finTwist = 18;
    @property({ tooltip: 'gợn sóng lan ra các đốt sau', group: { name: 'Vây ngực (Fin_M_L / Fin_M_R)', id: '4', style: "section" } })
    finChainAngle = 6;
    @property({ tooltip: 'trễ pha (rad) giữa các đốt', group: { name: 'Vây ngực (Fin_M_L / Fin_M_R)', id: '4', style: "section" } })
    finChainLag = 0.9;
    @property({ tooltip: 'lệch pha trái / phải (π = so le, 0 = đồng bộ)', group: { name: 'Vây ngực (Fin_M_L / Fin_M_R)', id: '4', style: "section" } })
    finPhaseOffset = Math.PI;
    @property({ tooltip: 'gập vây ra sau khi Speed > 1 (độ tại Speed = 2)', group: { name: 'Vây ngực (Fin_M_L / Fin_M_R)', id: '4', style: "section" } })
    finFold = 20;

    @property({ tooltip: 'quét ở gốc vây (đốt sau = một nửa)', group: { name: 'Vây bụng (Fin_B_L / Fin_B_R)', id: '5', style: "section" } })
    pelvicAngle = 6;
    @property({ group: { name: 'Vây bụng (Fin_B_L / Fin_B_R)', id: '5', style: "section" } })
    pelvicTwist = 8;
    @property({ tooltip: 'rad, lệch pha so với vây ngực cùng bên', group: { name: 'Vây bụng (Fin_B_L / Fin_B_R)', id: '5', style: "section" } })
    pelvicPhaseOffset = 1.2;

    @property({ tooltip: 'độ nghiêng sang bên tại gốc vây khi Speed = 1', group: { name: 'Vây lưng / vây đuôi (Fin_T_*, Fin_B_M)', id: '6', style: "section" } })
    centerFinAngle = 5;
    @property({ tooltip: 'trễ pha (rad) mỗi đốt so với sóng thân tại gốc vây', group: { name: 'Vây lưng / vây đuôi (Fin_T_*, Fin_B_M)', id: '6', style: "section" } })
    centerFinChainLag = 0.6;

    get speed(): number { return this._speed; }
    set speed(v: number) { this._speed = Math.max(0, v); }

    private moveTween: Tween<Node> | null = null;

    /**
     * Tween mượt vị trí LOCAL của cá về gốc (0,0,0) - dùng khi cá bị tách khỏi hệ quản lý vị trí (ví dụ
     * `FishMove`) và cần về tư thế trung tính, thay vì set cứng `node.position = v3()` gây giật hình.
     */
    moveToCenter(duration = 0.3, euler: Vec3 = v3(15, 50, 0)): void {
        this.moveTween?.stop();
        this.moveTween = tween(this.node)
            .to(duration, { position: new Vec3(), eulerAngles: euler.clone() }, { easing: 'quadOut' })
            .start();
    }

    private bones: Bone[] = [];
    private built = false;
    private clock = 0;

    private hasPrev = false;
    private prevRot = new Quat();
    private yawRate = 0;
    private pitchRate = 0;
    private hT = new Float32Array(HIST);
    private hYaw = new Float32Array(HIST);
    private hPitch = new Float32Array(HIST);
    private hHead = 0;

    private zStart = 0;
    private zTip = 1;
    private tailSign = -1;
    private bodyPhase = 0;
    private finPhase = 0;
    inited: boolean = false;

    init() {
        if(this.inited) return;
        this.inited = true;
        this.build();
    }
    updateCustom(dt: number) {
        if (!this.inited || this.paused) return;
        this.step(dt);
    }

    @property
    paused = false;
    @property
    self = false;

    /** Tạm dừng (giữ nguyên dáng hiện tại, không snap về bind pose) hoặc tiếp tục anim - update() sẽ bỏ qua
     * step() khi paused nên clock/phase không trôi trong lúc dừng, tiếp tục đúng chỗ đã dừng. */
    setAnim(on: boolean) {
        this.paused = !on;
    }

    start() {
        if(this.self)
        this.init();
    }

    // onEnable() {
    //     if (!this.built) this.build();
    // }

    // onDisable() {
    //     this.resetPose();
    // }

    // update(dt: number) {
    //     if (!this.inited || this.paused) return;
    //     this.step(dt);
    // }

    protected update(dt: number): void {
        if(this.self) {
            this.updateCustom(dt);
        }
    }

    // ---------- Vòng đời ----------

    /** Model có animator riêng (vd sao biển SK_Fish18 gắn StarfishAnim, cua SK_Fish17 gắn CrabAnim) thì giao hẳn cho nó, không dò bone cá thường. */
    private custom: CustomFishAnim | null = null;

    build(): void {
        this.custom = this.getComponentInChildren(CustomFishAnim);
        if (this.custom) {
            this.disableBakedSkinning();
            this.custom.build();
            this.built = true;
            return;
        }
        this.resetPose();
        this.bones.length = 0;
        this.hasPrev = false;
        this.yawRate = 0;
        this.pitchRate = 0;
        this.clock = 0;
        this.hHead = 0;
        this.hT.fill(0);
        this.hYaw.fill(0);
        this.hPitch.fill(0);
        if (this.randomizeTimeOffset) this.timeOffset = Math.random() * 100;

        this.cachedRig = null;
        this.disableBakedSkinning();
        this.resolveBones();
        this.bones.sort((a, b) => nodeDepth(a.node) - nodeDepth(b.node)); // cha trước con để RotateAbout đọc được parent đã xoay trong frame

        this.built = true;
        this.evaluatePhase(this.timeOffset);
    }

    resetPose(): void {
        if (this.custom) { this.custom.resetPose(); return; }
        for (const b of this.bones) if (b.node && b.node.isValid) b.node.rotation = b.bindLocal;
    }

    /** Tiến một bước dt giây: đo tốc độ góc của node, tích luỹ pha theo Speed rồi đặt pose. */
    step(dt: number): void {
        if (!this.built) this.build();
        if (this.custom) { this.custom.step(dt, this._speed); return; }
        if (dt <= 0) return;
        this.clock += dt;
        this.measureTurn(dt);
        this.bodyPhase += dt * this.swayFrequency * this._speed * Math.PI * 2;
        this.finPhase += dt * this.finFrequency * (0.7 + 0.3 * this._speed) * Math.PI * 2;
        this.applyPose();
    }

    /** Pose tĩnh tại thời điểm time (giây), Speed = 1, không uốn theo đường bơi. Dùng để preview. */
    evaluate(time: number): void {
        if (!this.built) this.build();
        this.yawRate = 0;
        this.pitchRate = 0;
        this.hYaw.fill(0);
        this.hPitch.fill(0);
        this.evaluatePhase(time + this.timeOffset);
        this.applyPose();
    }

    private evaluatePhase(time: number): void {
        this.bodyPhase = time * this.swayFrequency * Math.PI * 2;
        this.finPhase = time * this.finFrequency * Math.PI * 2;
    }

    // ---------- Dò bone theo quy ước tên ----------

    private cachedRig: Node | null = null;

    /**
     * Gốc để dò bone: dùng `rig` nếu đã gán tay; nếu không, tìm node tên đúng "Root" trong toàn bộ con cháu của
     * node này rồi lấy CON ĐẦU TIÊN của nó làm rig (khớp rig FBX kiểu FishAnim: ... > Root > Spine1 > ...); nếu
     * không tìm thấy "Root" thì đành lấy chính node này.
     */
    private getRig(): Node {
        if (this.rig) return this.rig;
        if (this.cachedRig) return this.cachedRig;
        const all: Node[] = [];
        collectDescendants(this.node, all);
        const rootNode = all.find(n => n.name === 'Root');
        this.cachedRig = (rootNode && rootNode.children.length > 0) ? rootNode.children[0] : this.node;
        
        return this.cachedRig;
    }

    /** SkinnedMeshRenderer chỉ lên hình đúng khi bone xoay bằng tay nếu chạy real-time skinning (không bake). */
    private disableBakedSkinning(): void {
        const skel = this.node.getComponentInChildren(SkeletalAnimation);
        if (skel) {
            skel.stop();
            skel.useBakedAnimation = false;
        }
    }

    private resolveBones(): void {
        const root = this.getRig();
        // root cũng phải được xét cùng: khi rig để trống, getRig() trả về CON ĐẦU TIÊN của "Root" (vd Spine1) -
        // bản thân nó là 1 bone thân thật sự chứ không phải node chứa, nếu chỉ collectDescendants(root) thì
        // Spine1 sẽ bị bỏ sót hoàn toàn (collectDescendants chỉ duyệt con, không tính chính root truyền vào).
        const all: Node[] = [root];
        collectDescendants(root, all);

        const spines: { index: number; node: Node }[] = [];
        const tails: { index: number; node: Node }[] = [];
        const finGroups = new Map<string, { index: number; node: Node }[]>();
        let head: Node | null = null;

        for (const n of all) {
            const name = n.name;
            if (/_end$/i.test(name)) continue; // chóp, không có skin
            const m = BODY_BONE_RE.exec(name);
            if (m) {
                const list = m[1].toLowerCase() === 'spine' ? spines : tails;
                list.push({ index: parseInt(m[2], 10), node: n });
                continue;
            }
            if (name.toLowerCase() === 'head') { head = n; continue; }
            const parsed = tryParseFinName(name);
            if (!parsed) continue;
            let group = finGroups.get(parsed.key);
            if (!group) finGroups.set(parsed.key, group = []);
            group.push({ index: parsed.index, node: n });
        }

        spines.sort((a, b) => a.index - b.index);
        tails.sort((a, b) => a.index - b.index);
        const bodyChain = [...spines, ...tails].map(s => s.node);

        if (bodyChain.length === 0) {
            console.warn(`Fish '${this.node.parent.parent.getComponent(Thing).thingType}': không tìm thấy bone thân (Spine/Tail) dưới '${root.name}', không animate.`);
            return;
        }

        const finKeys = Array.from(finGroups.keys()).sort();
        const finList: FinChainData[] = [];
        for (const key of finKeys) {
            const roleInfo = tryGetFinRole(key);
            if (!roleInfo) {
                console.warn(`Fish '${this.node.name}': không biết vây 'Fin_${key}', bỏ qua.`);
                continue;
            }
            const group = finGroups.get(key)!;
            group.sort((a, b) => a.index - b.index);
            finList.push({ role: roleInfo.role, side: roleInfo.side, segments: group.map(g => g.node) });
        }
        finList.sort((a, b) => (a.role !== b.role ? a.role - b.role : a.side - b.side));

        // vị trí trên thân theo z root space (this.node): gốc chuỗi thân = 0, chóp đuôi (bone *_end nếu có) = 1
        const last = bodyChain[bodyChain.length - 1];
        this.zStart = this.localPos(bodyChain[0]).z;
        this.zTip = (last.children.length > 0 ? this.localPos(last.children[0]) : this.localPos(last)).z;
        this.tailSign = this.zTip >= this.zStart ? 1 : -1;
        if (Math.abs(this.zTip - this.zStart) < 1e-5) this.zTip = this.zStart - 1e-5;

        for (const t of bodyChain) this.registerBone(t, BoneKind.Body, { along: this.alongOf(t) });
        if (head) this.registerBone(head, BoneKind.Head, { along: this.alongOf(head) });

        for (const fin of finList) {
            if (fin.segments.length === 0) continue;
            const rootSeg = fin.segments[0];
            const lastSeg = fin.segments[fin.segments.length - 1];
            const sideFin = fin.role === FinRole.Pectoral || fin.role === FinRole.Pelvic;

            const rootPos = this.localPos(rootSeg);
            const tipPos = lastSeg.children.length > 0 ? this.localPos(lastSeg.children[0]) : this.localPos(lastSeg);
            const side = fin.side !== 0 ? Math.sign(fin.side) : (rootPos.x >= 0 ? 1 : -1);

            const axis = new Vec3();
            Vec3.subtract(axis, tipPos, rootPos);
            if (Vec3.lengthSqr(axis) < 1e-8) {
                if (sideFin) Vec3.set(axis, side, 0, 0); else Vec3.copy(axis, Vec3.UP);
            }
            Vec3.normalize(axis, axis);
            const tipSign = axis.y >= 0 ? 1 : -1;

            for (let i = 0; i < fin.segments.length; i++) {
                const t = fin.segments[i];
                this.registerBone(t, sideFin ? BoneKind.SideFin : BoneKind.CenterFin, {
                    role: fin.role, along: this.alongOf(t), chain: i, side, tipSign, finAxis: axis.clone(),
                });
            }
        }
    }

    /** Đăng ký bone: lưu bind pose (localRotation lúc gọi) để resetPose / applyPose dùng. */
    private registerBone(node: Node, kind: BoneKind, extra: Partial<Pick<Bone, 'role' | 'along' | 'chain' | 'side' | 'tipSign' | 'finAxis'>>): void {
        const b = new Bone();
        b.node = node;
        b.kind = kind;
        Object.assign(b, extra);
        Quat.copy(b.bindLocal, node.rotation);
        this.bones.push(b);
    }

    private localPos(t: Node, out = new Vec3()): Vec3 {
        return this.node.inverseTransformPoint(out, Vec3.clone(t.worldPosition));
    }

    private alongOf(t: Node): number {
        return clamp01(inverseLerp(this.zStart, this.zTip, this.localPos(t).z));
    }

    // ---------- Đo độ uốn theo đường bơi ----------

    /** Đo tốc độ góc của node trong local space frame trước (yaw quanh Y, pitch quanh X), lọc rồi ghi lịch sử. */
    private measureTurn(dt: number): void {
        const rot = this.node.worldRotation;
        if (this.hasPrev) {
            Quat.conjugate(_qA, this.prevRot);
            Quat.multiply(_qB, _qA, rot); // d = inverse(prevRot) * rot
            const angRad = Quat.getAxisAngle(_v, _qB);
            let angDeg = angRad * RAD2DEG;
            if (angDeg > 180) angDeg -= 360;
            const y = (angDeg * _v.y) / dt;
            const p = (angDeg * _v.x) / dt;
            const k = 1 - Math.exp(-this.bendSmoothing * dt);
            this.yawRate += (y - this.yawRate) * k;
            this.pitchRate += (p - this.pitchRate) * k;
        }
        Quat.copy(this.prevRot, rot);
        this.hasPrev = true;
        this.hHead = (this.hHead + 1) % HIST;
        this.hT[this.hHead] = this.clock;
        this.hYaw[this.hHead] = this.yawRate;
        this.hPitch[this.hHead] = this.pitchRate;
    }

    /** Tốc độ góc (độ/giây, local space, đã lọc) cách đây `delay` giây, nội suy từ lịch sử. */
    private sampleTurnRates(delay: number): [yaw: number, pitch: number] {
        const target = this.clock - delay;
        let i = this.hHead;
        for (let n = 0; n < HIST - 1; n++) {
            const j = (i - 1 + HIST) % HIST;
            if (this.hT[j] <= target) {
                const span = this.hT[i] - this.hT[j];
                const f = span > 1e-5 ? clamp01((target - this.hT[j]) / span) : 1;
                return [lerp(this.hYaw[j], this.hYaw[i], f), lerp(this.hPitch[j], this.hPitch[i], f)];
            }
            i = j;
        }
        return [this.hYaw[i], this.hPitch[i]];
    }

    /** Góc uốn (độ) tại vị trí along (0 đầu, 1 đuôi) do rẽ / ngóc-chúi: lấy mẫu trễ bendDelay * along, nhân scale, kẹp maxBendPerBone. */
    private getTurnBend(along: number, scale: number): [yawDeg: number, pitchDeg: number] {
        const [yr, pr] = this.sampleTurnRates(this.bendDelay * along);
        const yawDeg = clamp((-this.turnBend * yr) / 90 * scale, -this.maxBendPerBone, this.maxBendPerBone);
        const pitchDeg = clamp((-this.pitchBend * pr) / 90 * scale, -this.maxBendPerBone, this.maxBendPerBone);
        return [yawDeg, pitchDeg];
    }

    /** Quaternion xoay `degrees` quanh trục worldAxis, biểu diễn trong parent space (dùng: node.rotation = out * bindLocal). */
    private static rotateAbout(parent: Node, worldAxis: Vec3, degrees: number, out: Quat): Quat {
        Quat.invert(_qInv, parent.worldRotation);
        Vec3.transformQuat(_v, worldAxis, _qInv);
        return Quat.fromAxisAngle(out, _v, degrees * DEG2RAD);
    }

    // ---------- Đặt pose ----------

    private applyPose(): void {
        const upWorld = this.node.up;
        const fwdWorld = this.node.forward;
        const rightWorld = this.node.right;
        const s = Math.max(this._speed, 0.05);
        const sq = Math.sqrt(s);                                 // bơi nhanh vẫy mạnh hơn
        const waveAmp = this.swayAngle * sq;
        const k = (Math.PI * 2) / Math.max(this.waveLength, 0.05);
        const finAmp = clamp(1.4 - 0.5 * s, 0.4, 1.4);            // bơi chậm vây vẫy nhiều, bơi nhanh vây gần như giữ yên
        const fold = this.finFold * clamp01(s - 1);

        for (const b of this.bones) {
            const p = b.node.parent;
            if (!p) continue;

            switch (b.kind) {
                case BoneKind.Body: {
                    const profile = Math.max(0.05, Math.pow(clamp01(b.along), this.swayProfileExponent));
                    const a = waveAmp * profile * Math.sin(this.bodyPhase - k * b.along);
                    const [by, bp] = this.getTurnBend(b.along, lerp(0.6, 1.2, b.along));
                    Fish.rotateAbout(p, upWorld, a + by, _qA);
                    Fish.rotateAbout(p, rightWorld, bp, _qB);
                    Quat.multiply(_qResult, _qA, _qB);
                    break;
                }
                case BoneKind.Head: {
                    Fish.rotateAbout(p, upWorld, -this.headSway * sq * Math.sin(this.bodyPhase - k * b.along), _qResult);
                    break;
                }
                case BoneKind.SideFin: {
                    const pectoral = b.role === FinRole.Pectoral;
                    const ph = this.finPhase + (b.side < 0 ? this.finPhaseOffset : 0) - b.chain * this.finChainLag + (pectoral ? 0 : this.pelvicPhaseOffset);
                    const rootAngle = pectoral ? this.finAngle : this.pelvicAngle;
                    const chainAngle = pectoral ? this.finChainAngle : this.pelvicAngle * 0.5;
                    const twistAngle = pectoral ? this.finTwist : this.pelvicTwist;
                    const sweep = (b.chain === 0 ? rootAngle : chainAngle) * finAmp * Math.sin(ph);
                    const twist = twistAngle * finAmp * Math.sin(ph + Math.PI * 0.5) * (b.chain === 0 ? 1 : 0.5);
                    const sweepSigned = b.side * (sweep - this.tailSign * (pectoral ? fold : fold * 0.5)); // gập về phía đuôi
                    Vec3.transformQuat(_vFinAxisWorld, b.finAxis, this.node.worldRotation);
                    Fish.rotateAbout(p, upWorld, sweepSigned, _qA);
                    Fish.rotateAbout(p, _vFinAxisWorld, twist, _qB);
                    Quat.multiply(_qResult, _qA, _qB);
                    break;
                }
                default: { // CenterFin: nghiêng sang bên quanh trục thân, chóp trễ pha so với sóng thân tại gốc vây
                    const a = this.centerFinAngle * sq * (b.chain === 0 ? 1 : 0.7)
                        * Math.sin(this.bodyPhase - k * b.along - (b.chain + 1) * this.centerFinChainLag);
                    Fish.rotateAbout(p, fwdWorld, a * b.tipSign, _qResult);
                    break;
                }
            }

            Quat.multiply(_qA, _qResult, b.bindLocal);
            b.node.rotation = _qA;
        }
    }
}
