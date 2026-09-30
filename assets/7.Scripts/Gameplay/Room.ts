import { _decorator, Animation, CCInteger, CCObjectFlags, Color, Component, EventKeyboard, EventTouch, Input, input, instantiate, JsonAsset, KeyCode, MeshRenderer, misc, Node, PhysicsSystem, PhysicsSystem2D, Quat, Sprite, Tween, tween, UITransform, v2, v3, Vec2, Vec3 } from 'cc';
import { Thing } from './Thing';
import { Slot } from './Slot';
import { ipm } from '../Manager/InputManager';
import { ui } from '../Manager/UI';
import Ulis, { cEasing } from '../Misc/Ulis';
import { sm, SoundType } from '../Manager/SoundManager';
import { EDITOR, EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { Bubble } from './Bubble';
import { Fish } from './FishMove/Fish';
import { pm } from '../Pool/PoolManager';
import { PoolType } from '../Pool/PoolMember';
import { WaveSprite } from '../Misc/WaveSprite';
import { Mats } from '../Misc/Mats';
import { AppLovinAnalytics } from '../Tool/AppLovinAnalytics';
import { Clock } from '../Manager/Clock';
import { splitSum } from '../MatchAsset/Ulis';
const { ccclass, property, executeInEditMode } = _decorator;


export var room: Room = null;


/**
 * Dữ liệu bong bóng: mỗi phần tử [x, y, types] - x/y là vị trí đặt bong bóng, types là mảng chỉ số loại cá bên
 * trong (chỉ số ứng với room.fish.children[index], xem Bubble.init()). Thay cho FishData cũ (chỉ có danh sách
 * loại cá dùng xáo trộn rồi chia đều cho các bong bóng đã đặt sẵn trong scene) - giờ vị trí cũng nằm trong data,
 * bong bóng được spawn từ PoolType.Bubble tại đúng vị trí đó (cần cấu hình sẵn 1 mục Bubble trong
 * PoolControl.poolAmounts) thay vì tìm bong bóng có sẵn trong thingNode.
 */
export const BubbleData: 
[number, number, number[]][] = 
 [[132.428,1268.46,[9,19]],[-621.029,874.37,[17,17,18]],[620.997,1242.781,[19,19,17]],[-331.329,1268.474,[9,9]],[311.746,840.762,[18,18]],[710.886,827.523,[7]],[710.774,492.52,[3]],[-147.621,672.359,[7,7,3]],[245.951,381.656,[7,7]],[-226.381,189.451,[16,16]],[620.976,67.396,[16,8,8]],[-646.47,385.848,[3,7]],[125.572,0.849,[8]],[-646.417,-77.964,[11,11]],[-181.644,-297.852,[19,19,19]],[-620.956,-566.574,[11,11,11]],[342.884,-253.975,[11]],[101.306,-697.127,[18,18]],[-602.293,-1099.642,[2,2,2,8]],[-56.128,-1180.229,[9,3,3,3]],[602.341,-613.586,[2,2,2,18]],[495.364,-1155.148,[8,8,9,9]]] 



export const Items = [
  [9, 9, 9],
  [19, 19, 19],
  [17, 17, 17],
  [18, 18, 18],
  [7, 7, 7],
  [3, 3, 3],
  [7, 7, 7],
  [16, 16, 16],
  [8, 8, 8],
  [11, 11, 11],
  [19, 19, 19],
  [11, 11, 11],
  [2, 2, 2],
  [18, 18, 18],
  [2, 2, 2],
  [8, 8, 8],
  [9, 9, 9],
  [3, 3, 3],
];

@ccclass('Room')
@executeInEditMode(true)
export class Room extends Component {

    onLoad() {
        room = this;
    }

    start() {
        this.init();
    }


    @property(Node)
    slotNode: Node = null
    @property(Node)
    thingNode: Node = null
    @property(Node)
    boxNode: Node = null
    @property(Node)
    vfxNode: Node = null
    @property(Node)
    thingAbove: Node = null
    @property(Node)
    hideNode: Node = null
    @property(Node)
    clockNode: Node = null
    clock: Clock = null
    slotAmount: number = 4
    boxAmount: number = 5
    slotDis: number = 262
    boxDis: number = 200

    @property(Sprite)
    progressBar: Sprite = null
    progress: number = 0
    totalBox: number = 0

    // @property([Thing])
    things: Thing[] = []
    slots: Slot[] = []
    boxes: Slot[] = []
    zoomed: boolean = false

    map: Map<number, number> = new Map()
    @property([Node])
    taps: Node[] = []

    startPos: Vec3 = null
    s1: Vec2 = null!;
    s2: Vec2 = null!;
    location: Vec2 = null!;
    maxScale: number = 0.8;
    maxMoveX: number = 400;
    maxMoveY: number = 200;
    hintTween: Tween<any> = null;
    fisrtTapCount: number = 3;

    @property({ group: { name: 'Hand Tut' }, tooltip: 'Giây chờ trước khi tay hiện lần đầu' })
    tutStartDelay: number = 0;
    @property({ group: { name: 'Hand Tut' }, tooltip: 'Giây đứng yên trước khi tay gợi ý lại' })
    hintDelay: number = 5;
    @property({ group: { name: 'Hand Tut' }, tooltip: 'Số con được chỉ khi tutTargets để trống (tự lấy theo loại Items[0])' })
    tutCount: number = 3;
    @property({ type: [Vec2], group: { name: 'Hand Tut' },
        tooltip: 'Các con cá tay sẽ chỉ, theo thứ tự: x = số thứ tự bubble (Bubble_x), y = số thứ tự cá trong bubble (Fish_x_y). Để trống = tự chọn' })
    tutTargets: Vec2[] = [];
    @property({ group: { name: 'Hand Tut' }, tooltip: 'Tick để in ra console các con cá tutorial đang chọn' })
    set checkTut(v: boolean) { this.logTutTargets(); }
    get checkTut() { return false; }

    items: number[][] = [];

    tappable: boolean = false

    lose: boolean = false

    @property
    maxPick: number = 15;
    @property
    maxBox: number = 99;
    fish: Node = null
    total: number = 0

    srcPool: Node[][] = []
    @property
    gravityY: number = 10;
    @property
    gravityY2: number = 100;
    
    mat: Mats = null
    initMats() {
        this.mat = this.node.getChildByName("Material").getComponentInChildren(Mats);
        this.mat.init();
    }

    initClock() {
        this.clock = this.clockNode?.getComponent(Clock);
        this.clock?.init();
        if(this.clock) this.clock.onTimeUp = this.onLose.bind(this);
    }

    onChangeMats() {
        this.things.forEach(t => {
            t.setMeshMat();
        })
    }

    init() {

        input.on(Input.EventType.KEY_DOWN, (e: EventKeyboard) => {
            let k = e.keyCode;
            if(k == KeyCode.SPACE) {
                this.printBubble = !this.printBubble;
            }
        });

        this.initClock();
        this.initMats();
        this.items = [...Items];
        this.totalBox = this.items.length;
        console.log("Total box", this.items.length);
        this.fish = this.node.getChildByName("Fish");

        // this.fish.children.forEach((c, i) => {
        //     c.name = "SK_Fish" + i;
        // })

        this.initBoxes();
        this.initSlots();
        this.initBubbles();
        this.initThings();
        this.zoom();
        // this.onFirst();
        this.schedule(this.onSchedule.bind(this), 0.5);

        // PhysicsSystem2D.instance.gravity = new Vec2(0, this.gravityY);
        

        // this.thingNode.getChildByName("Button")?.on(Node.EventType.TOUCH_START, this.onButton, this);
    }

    spawnUnlimited() {

        // return;
        if(this.things.length < 18 * 3) {
            let dt = [
                [4, 0],
                [3, 1],
                [2, 2],
                [1, 2],
            ]

            let totalBox = 0;

            let maxType = this.fishTypes.length < 4 ? this.fishTypes.length : 4;

            let types = Ulis.shuffleArray(this.fishTypes).slice(0, maxType);

            let typeAmount = [];


            dt.forEach(([type, amount]) => {
                typeAmount.push(...Array(amount).fill(type));
                totalBox += amount;
            })

            typeAmount = Ulis.shuffleArray(typeAmount);

            let fishes = [];
            
            for (let i = 0; i < totalBox; i++) {
                let type = types[i % types.length];
                let f = Array(3).fill(type);
                this.items.push(f);
                fishes.push(...f);
            }
            fishes = Ulis.shuffleArray(fishes);

            let cursor = 0;
            const data: any[] = typeAmount.map((size, i) => {
                let types = fishes.slice(cursor, cursor + size);
                cursor += size;
                return [0, -5000 - i * 500, types];
            });

            // console.log(typeAmount, fishes, data);
            

            data.forEach(([x, y, types]) => {
                let bubble = pm.spawnType<Bubble>(PoolType.Bubble);
                bubble.node.parent = this.thingNode;
                bubble.node.position = v3(x, y, 0);
                bubble.node._objFlags = CCObjectFlags.DontSave;
                bubble.init(types);
                this.bubbles.push(bubble);

                this.things.push(...bubble.things);
            })
        }
    }

    bubbles: Bubble[] = [];
    initBubbles(data: [number, number, number[]][] = BubbleData) {
        this.thingNode.destroyAllChildren();
        this.thingNode.removeAllChildren();
        this.bubbles = data.map(([x, y, types], i) => {
            let bubble = pm.spawnType<Bubble>(PoolType.Bubble);
            bubble.node.parent = this.thingNode;
            bubble.node.position = v3(x, y, 0);
            bubble.node._objFlags = CCObjectFlags.DontSave;
            bubble.init(types);
            // Đặt tên theo chỉ số trong BubbleData để tra ngược ra tutTargets (x = i, y = j) trong Hierarchy.
            bubble.node.name = "Bubble_" + i;
            bubble.things.forEach((t, j) => t.node.name = `Fish_${i}_${j}`);
            return bubble;
        });
    }

    /** Các con cá tay tutorial sẽ chỉ: lấy theo tutTargets nếu có, không thì tutCount con đầu tiên của loại Items[0]. */
    getTutTargets(): Thing[] {
        if (this.tutTargets.length > 0) {
            return this.tutTargets
                .map(v => this.bubbles[v.x]?.things[v.y])
                .filter(t => t);
        }
        let t0 = Items[0][0];
        return this.things.filter(t => t.thingType == t0).slice(0, this.tutCount);
    }

    logTutTargets() {
        const slotTypes = Items.slice(0, this.slotAmount).map(it => it[0]);
        if (this.tutTargets.length == 0) {
            console.log("tutTargets trống -> tự chỉ", this.tutCount, "con loại", Items[0][0]);
            return;
        }
        this.tutTargets.forEach((v, k) => {
            const t = this.bubbles[v.x]?.things[v.y];
            if (!t) {
                console.warn(`Tut #${k} (${v.x}, ${v.y}): KHÔNG TỒN TẠI`);
                return;
            }
            const ok = slotTypes.includes(t.thingType);
            const msg = `Tut #${k} ${t.node.name} type=${t.thingType}` + (ok ? "" : " -> không bể nào cần lúc đầu, tap sẽ rơi xuống ô chờ");
            ok ? console.log(msg) : console.warn(msg);
        });
    }

    /** Sinh ngẫu nhiên 1 mảng đúng định dạng BubbleData ([x, y, types] mỗi phần tử) theo params: box là vùng
     * [minX, maxX, minY, maxY] để random vị trí, bubleAmount là số lượng bubble cần tạo cho mỗi cỡ (cỡ = số cá
     * bên trong), typeAmount là danh sách loại cá được phép chọn. */
    randomBubles(params: { box: [number, number, number, number]; bubleAmount: Record<number, number>; fishTypes: number[] } = {
        box: [-500, 500, -1000, 1000],
        // Số lượng mỗi loại bubble chứa đc 1, 2, 3 và 4 cá.
        // Các loại cá hiện tại là 0, 1, 2
        bubleAmount: {
            1: 2,
            2: 3,
            3: 3,
            4: 2,
        },
        fishTypes: [0, 1, 2]
    }): [number, number, number[]][] {
        // Danh sách cỡ bubble cần tạo, ví dụ bubleAmount={1:2,2:3} -> [1,1,2,2,2].
        let sizes: number[] = [];
        for (const size in params.bubleAmount) {
            for (let i = 0; i < params.bubleAmount[size]; i++) sizes.push(Number(size));
        }

        const [minX, maxX, minY, maxY] = params.box;
        const data = sizes.map((size): [number, number, number[]] => {
            const types = Array.from({ length: size }, () => params.fishTypes[Ulis.iRand(0, params.fishTypes.length - 1)]);
            return [Ulis.iRand(minX, maxX), Ulis.iRand(minY, maxY), types];
        });
        console.log(JSON.stringify(data));
        return data;
    }

    /** Tương tự randomBubles() nhưng lấy vị trí + số cá (size) từ các bubble ĐANG CÓ SẴN trong scene (giữ nguyên,
     * không random), chỉ tính lại types theo fishTypes. Tổng số cá cần gán chia thành từng nhóm 3 con (khớp sức
     * chứa tối đa 1 slot) - mỗi nhóm 3 con nhận 1 loại, xoay vòng theo fishTypes; phần dư không đủ 1 nhóm 3 thì bỏ
     * (ví dụ totalFish=20, fishTypes=[0,1,2,3] -> 20 = 3*6 + 2: 6 nhóm nhận loại 0,1,2,3,0,1, 2 con dư không được
     * gán loại).
     *
     * Thứ tự các nhóm (đã xáo) chính là Items - thứ tự bể nhận loại - nên in ra cả BubbleData lẫn Items khớp nhau.
     * difficulty quyết định cá được xếp theo đúng thứ tự người chơi cần đến đâu:
     *  - 0: bubble trên cao (y lớn) chứa cá theo đúng thứ tự Items (3 con nhóm 1, 3 con nhóm 2...) -> cá phía trên
     *    luôn thuộc bể đang mở, bấm bừa phía trên lúc nào cũng ăn được cá;
     *  - 1: gần như xáo ngẫu nhiên hoàn toàn (như bản cũ);
     *  - ở giữa: mỗi con cá bị xê dịch ngẫu nhiên tối đa difficulty × tổng số cá vị trí so với thứ tự lý tưởng. */
    randomFromAvailableBubbles(fishTypes: number[] = [0, 1, 2], difficulty: number = this.difficulty,
        firstItems: number[] = this.firstItems): [number, number, number[]][] {
        const bubbles = this.thingNode.getComponentsInChildren(Bubble);
        const sizes = bubbles.map(b => b.getComponentsInChildren(Thing).length);
        const totalFish = sizes.reduce((sum, n) => sum + n, 0);

        const GROUP_SIZE = 3;
        const groupCount = Math.floor(totalFish / GROUP_SIZE);
        let pool: number[] = [];
        for (let g = 0; g < groupCount; g++) pool.push(fishTypes[g % fishTypes.length]);

        // Các nhóm đầu cố định theo firstItems, lấy ra khỏi pool; phần còn lại xáo ngẫu nhiên xếp sau.
        const head: number[] = [];
        for (const t of firstItems.slice(0, groupCount)) {
            if (!this.node.getChildByName("Fish")?.children[t]?.children.length) {
                console.warn(`genBubleFromAvai: firstItems loại ${t} chưa có model trong Room/Fish/SK_Fish${t}, cá sẽ không hiện.`);
            }
            let idx = pool.indexOf(t);
            if (idx < 0) {
                // Loại này đã hết nhóm trong pool (không có trong fishTypes hoặc ghi nhiều lần hơn số nhóm được chia) -
                // đổi 1 nhóm của loại đang nhiều nhóm nhất thành loại này để tổng số cá vẫn khớp số chỗ trong bubble.
                const count = new Map<number, number>();
                pool.forEach(p => count.set(p, (count.get(p) || 0) + 1));
                const most = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
                if (!most) break;
                idx = pool.indexOf(most[0]);
                console.warn(`genBubleFromAvai: firstItems loại ${t} không còn nhóm trong fishTypes, lấy 1 nhóm của loại ${most[0]} đổi thành ${t}.`);
            }
            pool.splice(idx, 1);
            head.push(t);
        }
        const groups = [...head, ...Ulis.shuffleArray(pool)];

        // Thứ tự lý tưởng: đúng thứ tự Items, 3 con của từng nhóm liền nhau. Bể được thay lần lượt từng cái theo Items
        // nên nhóm k + slotAmount chỉ mở khi đã đủ cá cho nhóm k - xếp liền theo nhóm đảm bảo cá phía trên luôn thuộc
        // bể đang mở (mô phỏng bấm bừa 3 bubble trên cùng: trượt ~1%, không thua; xáo tự do theo đợt 4 nhóm thì trượt
        // ~9%, thua ~6%).
        const ideal: number[] = [];
        groups.forEach(t => { for (let i = 0; i < GROUP_SIZE; i++) ideal.push(t); });

        // Độ khó: cộng nhiễu vào vị trí mỗi con rồi sắp lại.
        const spread = Math.max(0, difficulty) * ideal.length;
        const typeStream = ideal
            .map((t, i) => ({ t, k: i + Math.random() * spread }))
            .sort((a, b) => a.k - b.k)
            .map(e => e.t);

        // Bubble trên cao (y lớn) nhận cá trước; bubble nào rơi đúng lúc typeStream cạn (do phần dư bị bỏ) nhận ít
        // type hơn size gốc. Giữ nguyên thứ tự bubble trong BubbleData để chỉ số tutTargets không đổi.
        const order = bubbles.map((_, i) => i).sort((a, b) => bubbles[b].node.position.y - bubbles[a].node.position.y);
        const typesOf: number[][] = [];
        let cursor = 0;
        for (const i of order) {
            typesOf[i] = typeStream.slice(cursor, cursor + sizes[i]);
            cursor += sizes[i];
        }

        const round = (v: number) => Math.round(v * 1000) / 1000;
        const data = bubbles.map((b, i): [number, number, number[]] => [round(b.node.position.x), round(b.node.position.y), typesOf[i]]);
        const items = groups.map(t => Array(GROUP_SIZE).fill(t));
        this.lastGenItems = items;
        console.log(`genBubleFromAvai (difficulty ${difficulty}) - dán vào Room.ts:`);
        console.log("BubbleData = " + JSON.stringify(data));
        console.log("Items = " + JSON.stringify(items));
        return data;
    }


    @property
    set printBubble(v: boolean) { this.printBubbleData(); }
    get printBubble() { return false; }

    @property
    set genBuble(v: boolean) { this.randomBubles(); }
    get genBuble() { return false; }

    @property([Number])
    fishTypes: number[] = [0, 1, 2];
    @property({ slide: true, range: [0, 1], step: 0.05,
        tooltip: 'Độ khó khi genBubleFromAvai: 0 = bubble phía trên luôn chứa đúng cá các bể đang cần (bấm bừa vẫn ăn), 1 = xáo ngẫu nhiên hoàn toàn' })
    difficulty: number = 0;
    @property({ type: [CCInteger],
        tooltip: 'Thứ tự loại cá cố định cho các nhóm Items đầu khi genBubleFromAvai (mỗi phần tử = 1 nhóm 3 con, 4 phần tử đầu là 4 bể lúc bắt đầu). Để trống = xáo ngẫu nhiên toàn bộ' })
    firstItems: number[] = [];
    /** Items của lần genBubleFromAvai gần nhất (khớp với BubbleData vừa in ra). */
    lastGenItems: number[][] = [];
    @property({ tooltip: 'Gen lại loại cá cho các bubble đang có theo fishTypes + difficulty, hiện luôn trong Editor và in BubbleData + Items ra console để dán vào code' })
    set genBubleFromAvai(v: boolean) {
        const data = this.randomFromAvailableBubbles(this.fishTypes, this.difficulty, this.firstItems);
        this.initBubbles(data);
    }
    get genBubleFromAvai() { return false; }

    /**
     * Đảo ngược initBubbles(): in ra console đúng định dạng BubbleData ([x, y, types] cho từng bubble) theo vị
     * trí + loại cá hiện tại của this.bubbles - dùng sau khi tự kéo thả/chỉnh vị trí bubble trong Editor, copy kết
     * quả dán ngược vào BubbleData.
     */
    printBubbleData(): void {
        let bubbles  = this.thingNode.getComponentsInChildren(Bubble);
        console.log(JSON.stringify(bubbles.map(b => b.toData())));
    }

    onEmptyBubble(bubble: Bubble) {
        // Bubble sắp rời khỏi this.bubbles nên checkBubbleCollisions() sẽ không còn xét cặp nào có nó nữa -
        // tự kết thúc mọi contact nó đang giữ (đối xứng, giống checkBubbleCollisions) để bên kia dọn contactHits/wave đúng cách.
        for (const [node] of bubble.contactHits) {
            const other = this.bubbles.find(b => b.node === node);
            if (other) {
                bubble.onEndContact(other);
                other.onEndContact(bubble);
            }
        }
        this.bubbles = this.bubbles.filter(b => b != bubble);
    }

    // Manual replacement for Physics2D contact events: every frame, check each pair of bubbles' world
    // distance against the sum of their radii, and call onContact/onEndContact directly instead of
    // waiting on Box2D. Only bubble-vs-bubble is checked here - other objects (Things, walls) don't
    // take part in this at all.
    checkBubbleCollisions() {
        for (let i = 0; i < this.bubbles.length; i++) {
            for (let j = i + 1; j < this.bubbles.length; j++) {
                const a = this.bubbles[i];
                const b = this.bubbles[j];
                const posA = a.node.getWorldPosition();
                const posB = b.node.getWorldPosition();
                const dist = Vec3.distance(posA, posB);
                let aRadius = a.collider.radius * a.node.getWorldScale().x;
                let bRadius = b.collider.radius * b.node.getWorldScale().x;
                const minDist = aRadius + bRadius;
                const wasColliding = a.contactHits.has(b.node);

                if (dist < minDist) {
                    const dir = dist > 0.0001 ? posB.clone().subtract(posA).normalize() : v3(1, 0, 0);
                    const wposOnA = posA.clone().add(dir.clone().multiplyScalar(aRadius));
                    const wposOnB = posB.clone().add(dir.clone().multiplyScalar(-bRadius));
                    a.onContact(b, wposOnA);
                    b.onContact(a, wposOnB);
                } else if (wasColliding) {                  
                    if(dist > minDist + 2) 
                    {
                        a.onEndContact(b);
                        b.onEndContact(a);
                    }
                }
            }
        }
    }

    first: boolean = true;
    onFirst() {
        if(!this.first) return;
        this.first = false;
        AppLovinAnalytics.challengeStarted();
        this.clock?.count();
    }

    onButton(event: EventTouch, ...arg) {
        let node = event.target as Node;
        let sp = node.getComponent(Sprite);
        let c = sp.color.clone();
        let a = c.a + 0.0;
        tween(sp)
        .to(0.1, {}, {easing: 'smooth', 
            onUpdate(target, ratio) {
                c.a = a * (1 - ratio);
                sp.color = c;
            },
        })
        .start();
        
        this.thingNode.getChildByName("Button").off(Node.EventType.TOUCH_START, this.onButton, this);

        this.onTouchStart(event);
        
    }

    onSchedule() {
        // if(this.checkLose()) return;

        let boxes = this.boxes.filter(b => b.thing && !b.moving && !b.thing.waiting);
        let things = boxes.map(b => b.thing);
        things.forEach(t => {
            let thingyType = t.thingType;
            let slot = this.slots.find(s => s.thingType == thingyType);
            if(slot && slot.added + slot.queue.length < slot.amount) {
                this.queueSlot(t);
            }
        });
        room.checkLose();
        
        if(this.tappable) {
            let emptyBox = this.boxes.filter(b => b.thingType == -1);
            if(emptyBox.length > 1) {
                this.warning.active = false;            
            }
        }

        this.spawnUnlimited();
    }

    @property(Node)
    warning: Node = null
    moved() {

        let moving = this.boxes.find(b => b.moving);
        let movingSlot = this.slots.find(s => s.moving);
        if(moving || movingSlot) return;

        let emptyBox = this.boxes.filter(b => b.thingType == -1);
        if(this.tappable) {
            // console.log(emptyBox.length);
            
            if(emptyBox.length == 1) {
                let anim = emptyBox[0]?.getComponent(Animation);
                if(anim && !anim.getState("Box").isPlaying) {
                    anim.play();
                    sm.playSound(SoundType.Alert);
                } 
            } else if(emptyBox.length > 1) {
                this.warning.active = false;            
            }

            if(this.faked) {
                if(emptyBox.length > 0) {
                    this.reseted = true;
                }
            }
        }
        
    }

    @property(Node)
    loseFake: Node = null
    faked: boolean = false
    reseted: boolean = false
    checkLose() {

        let moving = this.boxes.find(b => b.moving);
        let movingSlot = this.slots.find(s => s.moving);
        let mivingThing = this.things.find(t => t.moving);
        if(moving || movingSlot || mivingThing) return;

        let emptyBox = this.boxes.find(b => b.thingType == -1);
        if(!emptyBox && !this.lose) {                
            this.hintTween?.stop();
            ui.offHand();
            this.unschedule(this.onSchedule.bind(this));
            this.onLose();
        }

        return !emptyBox;
    }

    onLose() {
        this.things.forEach((t) => {
            t.offTouch()
        });
        ui.onLose();
        this.lose = true;
        console.log("lose");
    }

    @property(Node)
    next: Node = null
    onRevive() {
        room.node.active = false;
        this.loseFake.active = false;
        if(this.next) {
            this.next.active = true;
        }
    }

    tap(thing: Node) {
        if(!this.tappable) return;
        if(thing) {
            let tt = thing.getComponent(Thing)
            let s = this.slots.find(s => s.thingType == tt.thingType);
        }
        this.taps = this.taps.filter(t => {
            return t != thing && (!thing || t != thing.getComponent(Thing).touch);
        });
        let t = this.taps.shift();
        // console.log(t);
        
        if(t) {
            let th = t.getComponent(Thing);
            ui?.handTap(th.touch);
        } else {
            ui?.offHand();
            this.hint();
        }
    }


    hint() {
        this.hintTween?.stop();
        this.hintTween = tween({})
        .delay(this.hintDelay)
        .call(() => {
            if(!ui.hand.active) {
                if(this.taps.length == 0 && this.things.length > 0) {
                    let thingFindout: Thing = null;
                    let sl = [...this.slots];
                    sl.sort((a, b) => a.amount - a.added - b.amount + b.added);
                    if(sl.length == 0) return;
                    let type = sl[0].thingType;
                    let t = this.things.filter(t => t.thingType == type)
                    t.sort((a, b) => - a.node.worldPosition.y + b.node.worldPosition.y);
                    // .reverse();
                    thingFindout = t[0];
                    if(thingFindout) {
                        console.log(thingFindout.node.worldPosition, ui.width, ui.height);
                        
                        this.taps = [thingFindout.node];
                        this.tap(null);
                    } else {
                        this.hint();
                    }
                } else {
                    this.hint();
                }
            }
        })
        .start();
    }

    zoom() {

        this.hideNode.active = false;
        this.node.scale = v3(1, 1, 1)
        .multiplyScalar(0.8);
        ui?.offHand();
        let pos = this.thingNode.getPosition();
        const t = this;
        tween(this.node)
        .delay(0.25)
        .to(0.5, {scale: v3(1, 1, 1)}, {
            onUpdate(target, ratio) {
                // t.thingNode.position = Vec3.lerp(v3(), pos, pos.clone().add(v3(-80)), ratio);
            },
        })
        .call(() => {
            ui.resize();
            this.tappable = true;
            this.binding();
            this.zoomed = true;
            this.hideNode.active = true;
            console.log("Done");
            
            this.tap(null);
        })
        // .start();
        
        this.node.scale = v3(1, 1, 1)
        this.binding();
        this.hideNode.active = true;
        // setTimeout(() => {     
            this.tappable = true;
            this.zoomed = true;
            this.scheduleOnce(() => this.tap(null), this.tutStartDelay);
            // PhysicsSystem2D.instance.gravity = new Vec2(0, this.gravityY2);
        // }, 3000);
    }

    setSlotThing(slot: Slot, shuffle: boolean = false): boolean {
        let keys = [];
        
        let keyMap: number[][] = [];
        for( let [key, value] of this.map) {
            keyMap.push([key, value]);
        }

        if(shuffle) {
            // keyMap = Ulis.shuffleArray(keyMap);
            // console.log(keyMap);
            
            keyMap.sort((a, b) => b[1] - a[1]);
            
        }
            

        // for( let [key, value] of this.map) {
        for( let i = 0; i < keyMap.length; i++) {
            let key = keyMap[i][0];
            let value = keyMap[i][1];
            console.log(key, value);
            
            if(value > 0) {    
                let thing = this.things.find(t => t.thingType == key);
                if(!thing) {
                    thing = this.boxes.map(b => b.thing).find(t => t && t.thingType == key);
                }
                if(!thing) return false;
                slot.thingType = key;
                slot.setThingFrame(thing);    
                slot.added = 0;
                slot.setLabel(value);
                keys.push(key);
                break;
            }
        }
        keys.forEach(k => {
            this.map.set(k, this.map.get(k) - 3);
        })
        return keys.length > 0;
    }

    onTouch(event: EventTouch) {
        let pos = event.getUILocation();
        let pos3 = v3(pos.x, pos.y, 0);
        for(let i = 0; i < this.bubbles.length; i++) {
            let b = this.bubbles[i];
            let wpos = b.node.getWorldPosition();
            wpos.z = 0;
            let scale = b.node.worldScale.x;
            let radius = b.collider.radius * scale;
            if(Vec3.distance(pos3, wpos) < radius) {
                b.getComponentInChildren(WaveSprite).onTouchStart(event);
                break;
            }
        }
    }


    getNearestThing(pos: Vec2, multiplier: number = 1) {
        let pos3 = v3(pos.x, pos.y, 0);
        let dis = null;
        let neareast: Thing = null;
        for(let i = 0; i < this.things.length; i++) {
            let thing = this.things[i];
            let wpos = thing.touch.getWorldPosition();
            wpos.z = 0;
            let d = Vec3.distance(pos3, wpos);
            if(dis === null) {
                dis = d;
                neareast = thing;
            } else {
                if(d < dis) {
                    dis = d;
                    neareast = thing;
                }
            }
        }

        if(!neareast) return null;
        let width = neareast.touch.getWorldScale().x *
        neareast.touch.getComponent(UITransform).width;

        if(dis < width / 2 * multiplier) {
            return neareast;
        } 

        return null;       
    }

    onTouchStart2(event: EventTouch) {
        let pos = event.getUILocation();
        let neareast = this.getNearestThing(pos); 
        if(this.things.includes(this.hThing)) this.hThing?.offHightlight();  
        if(neareast) {
            // neareast.onTouchStart(event);   
        }       
    }

    // ---------- Chọn cá: nhấn / di tay -> viền vàng con cá dưới tay (hover), nhấc tay -> chọn con đó (như click) ----------

    @property({ group: { name: 'Highlight' }, tooltip: 'Bật: nhấn / di tay thì con cá dưới tay sáng viền, nhấc tay mới chọn.\nTắt: chạm là chọn ngay như cũ' })
    dragCollect: boolean = true;
    @property({ group: { name: 'Highlight' }, tooltip: 'Màu viền con cá đang hover' })
    highlightColor: Color = new Color(255, 214, 0, 255);
    @property({ group: { name: 'Highlight' }, min: 0, step: 0.5, tooltip: 'Độ dày viền khi hover (pixel màn hình thiết kế), như nhau cho mọi loại cá' })
    highlightWidth: number = 10;
    @property({ group: { name: 'Highlight' }, min: 0.5, step: 0.05, tooltip: 'Bán kính bắt cá dưới tay, nhân với vùng chạm (Touch) của cá' })
    hoverRadius: number = 1.2;
    @property({ group: { name: 'Highlight' }, tooltip: 'Màu viền mỏng mặc định của cá trong bubble (khi không hover)' })
    outlineColor: Color = new Color(0, 0, 0, 255);
    @property({ group: { name: 'Highlight' }, min: 0, step: 0.5, tooltip: 'Độ dày viền mặc định của cá trong bubble. 0 = không có viền' })
    outlineWidth: number = 3;
    @property({ group: { name: 'Highlight' }, tooltip: 'Màu viền icon cá trên bể (Avatar)' })
    avatarOutlineColor: Color = new Color(255, 214, 0, 255);
    @property({ group: { name: 'Highlight' }, min: 0, step: 0.5, tooltip: 'Độ dày viền icon cá trên bể. 0 = không có viền' })
    avatarOutlineWidth: number = 3;
    @property({ group: { name: 'Avatar' }, tooltip: 'Góc xoay icon cá trên bể khi spawn (so với node Avatar)' })
    avatarEuler: Vec3 = new Vec3(15, 50, 0);
    @property({ type: [CCInteger], group: { name: 'Avatar' }, tooltip: 'Loại cá giữ nguyên góc cũ của Avatar (không xoay theo avatarEuler)' })
    avatarKeepRotationTypes: number[] = [16, 17, 18];

    hThing: Thing = null;

    /** Con cá trong bubble (chưa bay) gần điểm chạm nhất, trong bán kính vùng Touch * hoverRadius. */
    findThingAt(pos: Vec2): Thing {
        const pos3 = v3(pos.x, pos.y, 0);
        let best: Thing = null, bestD = Infinity;
        for (const t of this.things) {
            if (!t.bubble || t.moving || t.waiting || !t.touch || !t.touch.activeInHierarchy) continue;
            const w = t.touch.getWorldPosition();
            w.z = 0;
            const d = Vec3.distance(pos3, w);
            const ut = t.touch.getComponent(UITransform);
            const r = ut ? t.touch.getWorldScale().x * ut.width / 2 * this.hoverRadius : 0;
            if (d < r && d < bestD) {
                best = t;
                bestD = d;
            }
        }
        return best;
    }

    setHover(t: Thing) {
        if (t == this.hThing) return;
        if (this.hThing && this.hThing.isValid) this.hThing.offHightlight();
        this.hThing = t;
        if (t) t.onHightlight();
    }

    /** Nhấn xuống / di tay: viền con cá dưới tay. Gọi từ node cá, khung / bubble / nền và input toàn cục (trùng không sao). */
    onPointerMove(event: EventTouch) {
        if (!this.dragCollect || !event) return;
        if (!this.zoomed || this.lose) {
            this.setHover(null);
            return;
        }
        this.setHover(this.findThingAt(event.getUILocation()));
    }

    /** Nhấc tay: chọn con cá dưới điểm nhấc tay (vào bể / ô chờ như click). */
    onPointerUp(event: EventTouch) {
        if (!this.dragCollect || !event) return;
        const t = this.hThing ? this.findThingAt(event.getUILocation()) : null;
        this.setHover(null);
        if (!t || !t.isValid || !this.things.includes(t) || !t.bubble || t.moving) return;
        if (!this.zoomed || this.lose) return;
        t.onTouchStart(event);
    }

    onTouchMove2(event: EventTouch) {
        this.onPointerMove(event);
    }
    onTouchEnd2(event: EventTouch) {
        this.onPointerUp(event);
    }

    getSrc(index: number) {
        if(!this.srcPool[index]) this.srcPool[index] = [];
        let src  = this.srcPool[index].pop();
        if(!src) {
            let fish = room.fish.children[index];
            src = instantiate(fish);            
        }
        src["index"] = index;
        return src;
    }
    
    despawnSrc(src: Node) {
        // let index = src["index"];
        // src.setParent(this.fish);
        // this.srcPool[index].push(src);
        src.destroy();
    }

    setSlotThingFromArray(slot: Slot) {
        let array = this.items.shift();
        let thing: Thing = null;
        while (array) {
            thing = this.things.find(t => t.thingType == array[0]);
            if (!thing) thing = this.boxes.map(b => b.thing).find(t => t && t.thingType == array[0]);
            if (thing) break;
            array = this.items.shift();
        }

        if(array) {
            let key = array[0];
            slot.thingType = key;
            slot.setThingFrame(thing);    
            slot.added = 0;  
            slot.setLabel(array.length);
            let p = slot.node.getChildByName("Avatar").children[0];
            // if(!EDITOR_NOT_IN_PREVIEW) {
            //     let c = [...p.children];
            //     c.forEach(c => c.setParent(this.node, true));
            // }
            p.destroyAllChildren();
            p.removeAllChildren();
            
            let tt = pm.spawnType<Thing>(PoolType.Thing);
            tt.node.parent = p;
            slot.avatar = tt.node;
            tt.node.position = v3(0, 0, 0);
            // Góc icon: avatarEuler so với node Avatar (bù góc sẵn có của Avatar-001); loại trong avatarKeepRotationTypes
            // giữ nguyên góc cũ (theo Avatar-001).
            if (this.avatarKeepRotationTypes.includes(key)) {
                tt.node.eulerAngles = v3(0, 0, 0);
            } else {
                const want = Quat.fromEuler(new Quat(), this.avatarEuler.x, this.avatarEuler.y, this.avatarEuler.z);
                const inv = Quat.invert(new Quat(), p.rotation);
                tt.node.rotation = Quat.multiply(new Quat(), inv, want);
            }
            tt.node.scale = v3(1, 1, 1);
            tt.thingType = key;
            tt.node._objFlags = CCObjectFlags.DontSave;
            
            let fish = this.getSrc(key);
            let f = tt.getComponentInChildren(Fish)
            fish.parent = f.node;
            fish.position = v3(0, 0, 0);
            fish.eulerAngles = v3(0, 0, 0);
            fish.scale = v3(1, 1, 1);
            fish.active = true;
            fish._objFlags = CCObjectFlags.DontSave;
            f.init();
            f.setAnim(false);

            tt.init(false);
            // Viền mỏng (mặc định vàng) cho icon cá trên bể.
            tt.applyRestOutline(this.avatarOutlineWidth, this.avatarOutlineColor);

        }
        // console.log("items length", this.items.length);
        
        return array != undefined;
    }

    initThings() {
        this.things = this.thingNode.getComponentsInChildren(Thing);
        this.total = this.things.length
        // console.log(this.thingNode.children.length);
        
        // this.items = this.things.map(t => new Array(t.thingType));
        this.things.sort((t1, t2) => t1.thingType - t2.thingType);
        this.things.forEach((thing) => {
            // thing.init();
            let type = thing.thingType;
            if(this.map.has(type)) {
                this.map.set(type, this.map.get(type) + 1);
            } else {
                this.map.set(type, 1);
            }
        })

        let items: number[][] = [];
        for( let [key, value] of this.map) {
            let array = new Array(3).fill(key);
            let amount = value / 3;
            for(let i = 0; i < amount; i++) {
                items.push(array);
            }
            // items.push(new Array(value).fill(key));
        }
        this.slots.forEach((slot) => {
            this.setSlotThingFromArray(slot);
        })
        items = Ulis.shuffleArray(items);
        if(EDITOR) {
            console.log(this.map);
            console.log(items);
        }

        try {
            if(!EDITOR_NOT_IN_PREVIEW) {
                this.taps = this.getTutTargets().map(t => t.node);
                // số lần tap có tay dẫn = số con được chọn
                this.fisrtTapCount = this.taps.length;
            }
            // .reverse();
            
        } catch (error) {
            
        }

        
        // let sprites = this.thingNode.getComponentsInChildren(Sprite);
        // sprites.forEach((sprite) => {
        //     let sc = sprite.node.scale.clone();
        //     sprite.node.scale = v3(1, 1, 1);
        //     let ui = sprite.getComponent(UITransform);
        //     let size = ui.contentSize.clone();
        //     size.width *= sc.x;
        //     size.height *= sc.y;
        //     ui.contentSize = size;

        // })
    }

    initSlots() {
        this.slots = this.slotNode.getComponentsInChildren(Slot);
        // this.slots.forEach((slot) => {
        //     slot.node.destroy();
        // })
        // this.slots = [];
        for(let i = 0; i < this.slotAmount; i++) {
            let slot = this.slots[i] ;
            slot.node.parent = this.slotNode;
            slot.node.position = v3(this.slotDis*(-this.slotAmount/2 + 0.5 + i));
            slot.initSlot();
            slot.node.name = "slot" + i;
        }
    }

    initBoxes() {
        this.boxes = this.boxNode.getComponentsInChildren(Slot);
        // this.boxes.forEach((slot) => {
        //     slot.node.destroy();
        // })
        // this.boxes = [];
        for(let i = 0; i < this.boxAmount; i++) {
            let box = this.boxes[i]
            box.node.parent = this.boxNode;
            box.node.position = v3(this.boxDis*(-this.boxAmount/2 + 0.5 + i));
            box.init();
            box.index = i;
            box.node.name = "box" + i;
        }

    }

    getBox(index: number) {
        return this.boxes.find(b => b.index == index);
    }

    onPickThing(thing: Thing) {
        this.things = this.things.filter(t => t != thing);
        this.taps = this.taps.filter(t => t != thing.node);
    }

    onTapThing(thing: Thing) {
        thing.offTouch();
        this.onFirst();
        this.onPickThing(thing);
        if(this.fisrtTapCount > 0) {
            this.tap(thing.node);
            this.fisrtTapCount--;
            if(this.fisrtTapCount == 0) {
                ui.offHand();
                if(this.tappable)
                this.taps = [];
                this.hint();
            }
        } else {
            ui.offHand();
            if(this.tappable)
            this.taps = [];
            this.hint();
        }
    }

    clicked: number = 0;
    onThing() {
        this.clicked++;
        // console.log(this.clicked, this.total);
        

        // let r = this.clicked/this.total;
        // r = Math.floor(r*100)
        // ui.onProgress(r);
        
        if(this.clicked >= this.maxPick) {            
            this.onBind();
        }
    }

    boxed: number = 0;
    pTween: Tween<any> = null;
    onBox() {
        this.boxed++;

        let r = this.boxed/this.totalBox;       
        console.log(this.boxed);
        
        ui.onProgress((Math.floor(r*100)));
        let time = r - this.progress;
        const t = this;
        this.pTween?.stop();
        this.pTween = tween(this.progressBar)
        .to(time, { fillRange: r }, { easing: "linear", 
            onUpdate(target, ratio) {
                t.progress = r;
            }
        })
        .start();
        if(this.boxed >= this.maxBox) {
            this.onBind();
        }
    }

    onBind() {
        console.log("bind");
        
        this.things.forEach((t) => t.offTouch());
        ui.bindingToStore();
    }


    checkBox(thing: Thing, wpos: Vec3) {
        if(!this.zoomed) return;
        let thingyType = thing.thingType;
        let slot = this.slots.find(s => s.thingType == thingyType);
        if(slot && slot.added + slot.queue.length < slot.maxAmount) {
            this.onThing();
            this.checkSlot(thing);
        } else {
            this.swapBox(thing);
            // this.checkFail(wpos);
        }
    }

    checkFail(pos: Vec3) {
        // this.onThing();
        // sm.playSound(SoundType.Wrong);
        // let x = pm.spawn(PoolType.X);
        // x.node.parent = this.vfxNode;
        // x.node.worldPosition = pos;
        // let s = x.node.children[0];
        // s.scale = v3(0.5, 0.5, 0.5);
        // tween(s)
        // .to(0.2, {scale: v3(1, 1, 1)}, {easing: 'smooth'})
        // .delay(0.5)
        // .call(() => {
        //     pm.despawn(x);
        // })
        // .start();
    }

    checkSlot(thing: Thing) {
        let thingyType = thing.thingType;
        let slot = this.slots.find(s => s.thingType == thingyType);
        if(!slot || slot.added + slot.queue.length >= slot.maxAmount) return;
        this.onTapThing(thing);
        slot.setThing(thing);
    }

    queueSlot(thing: Thing) {
        let thingyType = thing.thingType;
        let slot = this.slots.find(s => s.thingType == thingyType);
        if(!slot) return;
        if(!slot.enqueue(thing)) return;
        this.onTapThing(thing);
    }

    swapBox(thing: Thing) {
        let thingyType = thing.thingType;
        let index = this.boxes.findIndex(b => b.thingType < 0)
        if(index > -1) {
            this.onThing();
            let box = this.boxes[index];
            this.onTapThing(thing);
            // box.setThing(thing);
            // let thingyBoxes = this.boxes.filter(b => b.thingType == thingyType);
            // let length = thingyBoxes.length;
            // if( length > 0) {
            //     let si = thingyBoxes[length - 1].index;
            //     let lastBox = this.getBox(this.boxAmount - 1);
            //     if(si <  this.boxAmount - 1 && lastBox.thingType < 0) {
            //         for(let i = this.boxAmount - 1; i > si; i--) {
            //             let nexBox = this.getBox(i);
            //             if(nexBox.thingType < 0) {
            //                 continue;
            //             } else {
            //                 nexBox.swapIndex(this.getBox(i+1));
            //             }
            //         }
            //         this.getBox(si + 1).setThing(thing);
            //     } else {
            //         box.setThing(thing);
            //     }
            // } else {
            //     box.setThing(thing);
            // }
            // console.log(thing);
            
            box.setThing(thing);

        }
    }

    onFull(slot: Slot) {
        sm.playSound(SoundType.Done); 
        this.slots = this.slots.filter(s => s != slot);
        this.onBox();
        let original = slot.node.position.clone();
        let pos = slot.node.position.clone();
        pos.y = 750;
        slot.count = 0;
        tween(slot.node)
        .delay(0.2)
        .to(0.5, {position: pos}, {easing: cEasing("backIn", 1.3)})
        .call(() => {
            slot.label.node.active = false;
            slot.label.string = "0/" + slot.maxAmount;
            slot.fishMove.removeAllFishes();
            slot.things.forEach(t => {
                this.things = this.things.filter(th => th != t);
                t.onDespawn();
            });
            slot.things = [];
            let addNew = this.setSlotThingFromArray(slot);   
            if(addNew) {
                slot.label.node.active = true;
                tween(slot.node)
                .to(0.2, {position: original}, {easing: 'smooth'})
                .call(() => {
                    if(addNew) {
                        this.slots.push(slot);
                        this.slots.sort((a, b) => a.node.position.x - b.node.position.x);

                        let thingType = slot.thingType;

                        // let sameBoxes = this.boxes.filter(b => !b.moving && b.thing && b.thing.thingType == thingType)
                        // let things = sameBoxes.map(b => b.thing)   
                        // things = things.filter((t, i) => i < slot.amount - slot.added);   
                        // things.forEach((t, i) => {
                        //     slot.setThing(t);
                        // });
                        
                        this.onSchedule();

                        // let bMove = this.boxes.filter(b => b.moving)
                        // if(bMove.length > 0) {
                        //     bMove.forEach(b => {
                        //         b.onMoved = () => {
                        //             this.rearrangeBoxes(bMove);
                        //             b.onMoved = () => {}
                        //         }
                        //     })  
                        // }  else {
                        //     this.rearrangeBoxes(bMove);
                        // }
                            
                    }  
                    // this.checkLose();              
                })
                .start();  
            } else {
                console.log(this.items);
                
                return;
            }          
        })
        .start();
    }

    rearrangeBoxes(boxes: Slot[] = []) {
        if(this.boxes.length == 0) {
            return;
        }
        if(this.lose) return;
        let moving = this.boxes.filter(b => b.moving);
        if(moving.length > 0) {
            return;
        } else {
            boxes.forEach(b => {
                b.onMoved = () => {}
            })

            let emptyBox = null;
            for(let i = 0; i < this.boxAmount; i++) {
                let box = this.getBox(i);
                if(box.thingType < 0) {
                    let nextBox = this.getBox(i+1);
                    if(nextBox && nextBox.thingType >= 0) {
                        emptyBox = box;
                        break;
                    }
                }
            }
            if(!emptyBox) return;

            // console.log("arrange");
            

            let things = this.boxes.map(b => b.thing).filter(t => t);
            things.forEach(t => {
                t.box.onDespawnThing();
            });
            things.forEach(t => {
                this.queueSlot(t);
            });
            things = things.filter(t => !t.box && !t.waiting);

            
            things.forEach((t, i) => {
                let box = this.getBox(i);
                box.setThing(t);
            });
        }
    }


    click: boolean = false;
    onTouchStart(event: EventTouch) {
        if(!event) return;
        this.onPointerMove(event);
        this.location = event.getUILocation();
        if(this.s1 == null) {
            this.s1 = this.location.clone();
        } else if(this.s2 == null) {
            this.s2 = this.location.clone();
        }
        if(this.s1 && this.s2) {
            return;
        }

        this.click = true;
        this.startPos = v3(this.location.x, this.location.y, 0);
    }

    zoomBy(delta: number) {
        // if(!this.zoomed) 
            return;
        let scale = this.thingNode.scale.x;
        scale += delta;
        scale = misc.clampf(scale, 0.4, this.maxScale);
        this.thingNode.scale = v3(scale, scale, scale);
        ui.keepTap();
    }

    onTouchMove(event: EventTouch) {

        // return;
        if(!event) return;
        this.onPointerMove(event);

        let touches = event.getTouches();
        if(touches.length >= 2) {
            this.click = false;
        } else {
            // let pos = touches[0].getUILocation();
            // let dis = Vec2.distance(pos, this.location);
            // console.log(dis);
            
            // if(dis > 100) {
            //     this.click = false;
            // }
        }
                this.click = false;

        if(this.s1 && this.s2 && touches.length >= 2) {
            let e1 = touches[0].getUILocation();
            let e2 = touches[1].getUILocation();
            let sDis = this.s2.clone().subtract(this.s1).length();
            let eDis = e2.clone().subtract(e1).length();
            let scale = eDis - sDis;
            this.s1 = e1.clone();
            this.s2 = e2.clone();
            // console.log(scale);
            this.zoomBy(scale/3000);
            return;
        }


        if(!this.startPos) return;
        // return;
        let delta = event.getUIDelta();
        let dpos = this.thingNode.getPosition();
        this.thingNode.worldPosition = this.thingNode.getWorldPosition().add3f(delta.x, delta.y, 0);
        let tp = this.thingNode.position.clone();
        let maxX = this.thingNode.scale.x * this.maxMoveX;
        let maxY = this.thingNode.scale.y * (this.maxMoveY);
        tp.x = misc.clampf(tp.x, -maxX, maxX);
        tp.y = misc.clampf(tp.y, -maxY - 400, maxY - 200);
        // tp.y = dpos.y;
        ui.keepTap();
        this.thingNode.position = tp;
    }

    onTouchEnd(event: EventTouch) {
        if(!event) return;
        this.onPointerUp(event);
        this.startPos = null;
        let out = event.getUILocation();
        if(this.s1 && this.s2) {
            if(this.s1.equals(out)) {
                this.s1 = this.s2.clone();
            }
            this.startPos = v3(this.s1.x, this.s1.y, 0);
            this.s2 = null;
        } else if (this.s1) {
            this.s1 = null;
        }
        if(this.click) {
            let pos = event.getLocation();
            let wpos = ui.uiCam.screenToWorld(v3(pos.x, pos.y, 0));
        }
    }

    binding() {
        if(!ipm) return;
        ipm.bindingStart = this.onTouchStart.bind(this);
        ipm.bindingMove = this.onTouchMove.bind(this);
        ipm.bindingEnd = this.onTouchEnd.bind(this);
    }

    update(deltaTime: number) {
        this.checkBubbleCollisions();
    }
}


