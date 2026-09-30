import { _decorator, Animation, CCInteger, CCObjectFlags, Component, Enum, EventKeyboard, EventTouch, Input, input, instantiate, JsonAsset, KeyCode, MeshRenderer, misc, Node, PhysicsSystem, PhysicsSystem2D, Sprite, Tween, tween, UITransform, v2, v3, Vec2, Vec3 } from 'cc';
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

/** Normal: cá không có bể nào cần thì rơi xuống ô chờ (box) ở dưới. NoBox: không dùng ô chờ - chỉ cá bay được vào bể
 * đang cần mới click được, click con khác chỉ rung nhẹ báo sai. */
export enum GameMode {
    Normal = 0,
    NoBox = 1,
}


/**
 * Dữ liệu bong bóng: mỗi phần tử [x, y, types] - x/y là vị trí đặt bong bóng, types là mảng chỉ số loại cá bên
 * trong (chỉ số ứng với room.fish.children[index], xem Bubble.init()). Thay cho FishData cũ (chỉ có danh sách
 * loại cá dùng xáo trộn rồi chia đều cho các bong bóng đã đặt sẵn trong scene) - giờ vị trí cũng nằm trong data,
 * bong bóng được spawn từ PoolType.Bubble tại đúng vị trí đó (cần cấu hình sẵn 1 mục Bubble trong
 * PoolControl.poolAmounts) thay vì tìm bong bóng có sẵn trong thingNode.
 */
export const BubbleData: 
[number, number, number[]][] = 
[[-650.905,1266.884,[8,8,11]],[-686.529,1757.058,[18,18]],[-412.101,1565.051,[18]],[-705.221,843.121,[9]],[-403.264,989.995,[9]],[-463.104,595.327,[19,19]],[-675.765,260.582,[16,16]],[-672.624,-1514.491,[18,18]],[-379.517,-1812.69,[8,11,11]],[714.954,-1759.451,[8]],[-677.66,-2103.295,[2,2]],[-243.008,-2158.783,[7]],[416.167,-633.743,[17]],[514.252,-1074.415,[9,9]],[434.305,-1550.69,[18,8]],[304.881,-1912.161,[11]],[625.449,-2106.803,[2,7,7]],[-487.04,-129.415,[3,2,2]],[-716.902,-455.542,[17]],[-469.153,-687.71,[7,7]],[-668.211,-1046.375,[9,9]],[-409.557,-1279.294,[9]],[658.962,330.184,[19,19,16]],[470.292,-54.09,[3,3]],[672.872,-398.977,[2,17]],[713.673,-759.886,[7]],[741.371,-1336.73,[9]],[415.73,1821.652,[18]],[662.017,1542.625,[18,18,8]],[462.416,1189.879,[11,11]],[719.706,952.695,[9]],[476.584,697.828,[19,19]],[-670.486,-3393.299,[11,11]],[-318.025,-3400.459,[8]],[486.967,-2464.58,[2]],[252.3,-2735.337,[16,17]],[579.441,-2956.74,[17,17]],[503.114,-3314.668,[11]],[160.453,-3489.431,[8,8]],[268.925,-3137.181,[16]],[-99.866,-3126.703,[3,16,16]],[273.643,-2239.315,[17]],[-506.249,-2998.418,[3,3]],[-158.466,-2707.299,[2,16]],[-462.073,-2447.75,[17,17]],[738.453,-2636.741,[2]],[-727.688,-2728.619,[16]]] 






export const Items = 
 [[18,18,18],[18,18,18],[8,8,8],[11,11,11],[9,9,9],[19,19,19],[19,19,19],[16,16,16],[3,3,3],[2,2,2],[17,17,17],[7,7,7],[9,9,9],[9,9,9],[18,18,18],[8,8,8],[11,11,11],[2,2,2],[7,7,7],[17,17,17],[2,2,2],[16,16,16],[17,17,17],[3,3,3],[16,16,16],[11,11,11],[8,8,8]] 




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

    @property({ type: Enum(GameMode), tooltip: 'Normal: cá không vào bể được thì rơi xuống ô chờ ở dưới (có thua khi đầy ô chờ).\nNoBox: ẩn ô chờ, chỉ click được cá đang có bể cần, click con khác chỉ rung nhẹ.' })
    get gameMode() { return this._gameMode; }
    set gameMode(v: GameMode) {
        this._gameMode = v;
        this.applyGameMode();
    }
    @property
    private _gameMode: GameMode = GameMode.Normal;
    get useBox() { return this._gameMode == GameMode.Normal; }

    /** Nhóm node ô chờ để bật / tắt theo mode, để trống thì dùng node cha của boxNode (Boxes). */
    @property({ type: Node, tooltip: 'Node chứa toàn bộ ô chờ để ẩn ở mode NoBox. Để trống = cha của boxNode' })
    boxRoot: Node = null;

    applyGameMode() {
        if (!this.boxNode) return;
        const root = this.boxRoot || this.boxNode.parent || this.boxNode;
        root.active = this.useBox;
        // Mode Normal cần thấy ô chờ: bật lại cả các node cha đã bị tắt (giữa Room và boxNode).
        if (this.useBox) {
            for (let n = this.boxNode; n && n != this.node; n = n.parent) n.active = true;
        }
    }

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

    /** Tâm làn bubble (|x| trong thingNode) khi spawn thêm - khớp BubbleData: trái ~-540, phải ~+540. */
    @property({ tooltip: 'Tâm làn trái/phải (|x| local trong Things) cho bubble spawn thêm' })
    spawnLaneX: number = 540;
    @property({ tooltip: 'Lệch ngẫu nhiên ± quanh tâm làn khi spawn thêm' })
    spawnLaneJitter: number = 120;
    private spawnLane: number = 0;

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

            // Giữa là cột slot -> bubble spawn thêm chia đều vào 2 làn trái / phải như BubbleData ban đầu: mỗi bubble vào
            // làn đang ít bubble hơn (hoà thì xen kẽ), xếp dọc dưới màn hình theo từng làn rồi nổi lên.
            let laneCount = [0, 0];
            this.bubbles.forEach(b => b && b.isValid && b.node.isValid && b.things.length > 0 && laneCount[b.node.position.x < 0 ? 0 : 1]++);
            let laneQueued = [0, 0];
            let cursor = 0;
            const data: any[] = typeAmount.map((size) => {
                let types = fishes.slice(cursor, cursor + size);
                cursor += size;
                let lane = laneCount[0] == laneCount[1] ? this.spawnLane : (laneCount[0] < laneCount[1] ? 0 : 1);
                this.spawnLane = 1 - lane;
                laneCount[lane]++;
                let x = (lane == 0 ? -1 : 1) * (this.spawnLaneX + (Math.random() * 2 - 1) * this.spawnLaneJitter);
                let y = -3500 - laneQueued[lane]++ * 500;
                return [x, y, types];
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
            const msg = `Tut #${k} ${t.node.name} type=${t.thingType}` + (ok ? "" : this.useBox ? " -> không bể nào cần lúc đầu, tap sẽ rơi xuống ô chờ" : " -> không bể nào cần lúc đầu, mode NoBox sẽ không click được");
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

    @property({ min: 0.05, step: 0.05, group: { name: 'Fish Size', id: 'fishSize' },
        tooltip: 'Hệ số nhân scale node con đầu tiên (node model, vd RootNode / SK_Fish23) của mỗi con cá khi gen bubble. Chỉ nhân trên bản clone, model gốc trong Room/Fish giữ nguyên. 1 = giữ nguyên' })
    bubbleFishScale: number = 1;
    @property({ min: 0.05, step: 0.05, group: { name: 'Fish Size', id: 'fishSize' },
        tooltip: 'Hệ số size cá trong bể (icon cá trên bể + cá bay vào bể). Độc lập với bubbleFishScale. 1 = giữ nguyên' })
    slotFishScale: number = 1;
    @property({ min: 0.05, step: 0.05, group: { name: 'Fish Size', id: 'fishSize' },
        tooltip: 'Hệ số size cá nằm ở ô chờ (box). Độc lập với bubbleFishScale. 1 = giữ nguyên' })
    boxFishScale: number = 1;
    @property({ group: { name: 'Fish Size', id: 'fishSize' }, tooltip: 'Bấm để áp bubbleFishScale / slotFishScale và dựng lại bubble + icon trên bể trong Editor (giữ nguyên vị trí + loại cá đang hiện). boxFishScale thấy được khi chơi (preview)' })
    set applyBubbleFishScale(v: boolean) {
        const data = this.thingNode.getComponentsInChildren(Bubble).map(b => b.toData());
        this.initBubbles(data.length ? data : undefined);
        this.things = this.thingNode.getComponentsInChildren(Thing);
        this.slots.forEach(s => s.avatar && s.avatar.isValid && s.avatar.setScale(v3(1, 1, 1).multiplyScalar(this.slotFishScale)));
    }
    get applyBubbleFishScale() { return false; }

    /** Nhân scale node con đầu (node model) của bản clone cá trong bubble với bubbleFishScale - gọi từ Bubble.init. */
    scaleBubbleFish(src: Node) {
        const model = src.children[0];
        if (!model || this.bubbleFishScale === 1 || !(this.bubbleFishScale > 0)) return;
        model.setScale(model.scale.clone().multiplyScalar(this.bubbleFishScale));
    }

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
                // Box đang tắt (inactive) thì Animation chưa onLoad -> getState trả null; trước đây ném lỗi giữa
                // tween callback của Slot.setThing làm kẹt hàng chờ cá (chơi 1 lúc là đứng game).
                let anim = emptyBox[0]?.getComponent(Animation);
                let state = anim && anim.node.activeInHierarchy ? anim.getState("Box") : null;
                if(state && !state.isPlaying) {
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

    hThing: Thing = null;
    onTouchMove2(event: EventTouch) {
        let pos = event.getUILocation();
        let neareast = this.getNearestThing(pos, 1.5);  
        if(this.things.includes(this.hThing)) this.hThing?.offHightlight();  
        if(neareast) {
            this.hThing = neareast;
            neareast.onHightlight();   
        } else {
            this.hThing = null;
        }  
        
    }
    onTouchEnd2(event: EventTouch) {
        // let pos = event.getUILocation();
        // let neareast = this.getNearestThing(pos);   
        // if(neareast) {
        //     neareast.onHightlight();   
        // }    
        if(this.things.includes(this.hThing)) {
            if(this.hThing) {
                this.hThing.offHightlight();
                this.hThing.onTouchStart(event);
                this.hThing = null;
            }
        }
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
            tt.node.eulerAngles = v3(0, 0, 0);
            tt.node.scale = v3(1, 1, 1).multiplyScalar(this.slotFishScale);
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

            // Cá trong bể giả (Tank) đổi đúng loại mới, ẩn hết - mỗi con bay vào sẽ bật 1 con lên bơi.
            slot.setupTank(key);
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
        // Giữ nguyên vị trí bể đặt trong scene (không xếp lại theo slotDis nữa); chỉ sắp theo x để thứ tự vẫn trái -> phải
        // như trước: Items[0] vào bể trái nhất.
        this.slots = Room.sortByLayout(this.slotNode.getComponentsInChildren(Slot)).slice(0, this.slotAmount);
        this.slots.forEach((slot, i) => {
            slot.initSlot();
            slot.node.name = "slot" + i;
        });
    }

    /** Sắp bể / ô chờ theo vị trí đang đặt trong scene: trái -> phải, cùng cột thì trên -> dưới (bố cục dọc). */
    static sortByLayout<T extends Component>(list: T[]): T[] {
        return list.sort((a, b) => {
            const pa = a.node.worldPosition, pb = b.node.worldPosition;
            if (Math.abs(pa.x - pb.x) > 1) return pa.x - pb.x;
            return pb.y - pa.y;
        });
    }

    initBoxes() {
        // Giữ nguyên vị trí ô chờ đặt trong scene (không xếp lại theo boxDis nữa); sắp theo x để ô chờ vẫn được lấp từ trái
        // sang phải như trước.
        this.boxes = Room.sortByLayout(this.boxNode.getComponentsInChildren(Slot)).slice(0, this.boxAmount);
        this.boxes.forEach((box, i) => {
            box.init();
            box.index = i;
            box.node.name = "box" + i;
        });
        this.applyGameMode();
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
        } else if(this.useBox) {
            this.swapBox(thing);
            // this.checkFail(wpos);
        } else {
            // Mode NoBox: không có bể nào đang cần loại này -> không click được, chỉ rung nhẹ báo sai.
            thing.shake();
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
        thing.stopShake();
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
        // Bể đầy: thu về scale 0 tại chỗ, đổi sang bể mới rồi phóng ra lại đúng scale gốc của bể (không bay lên nữa).
        const baseScale = (slot.baseScale || slot.node.scale).clone();
        slot.bounceTween?.stop();
        slot.count = 0;
        tween(slot.node)
        .delay(0.2)
        .to(0.25, {scale: v3(0, 0, 0)}, {easing: 'backIn'})
        .call(() => {
            slot.label.node.active = false;
            slot.label.string = "0/" + slot.maxAmount;
            slot.fishMove.removeAllFishes();
            slot.things.forEach(t => {
                this.things = this.things.filter(th => th != t);
                t.onDespawn();
            });
            slot.things = [];
            // Fish.build đo bone bằng inverseTransformPoint - slot đang scale 0 thì ma trận suy biến -> NaN (cá trong
            // bể mới tàng hình / méo hình). Trả scale gốc tạm thời lúc dựng cá rồi đưa về 0 (cùng frame, không nháy).
            slot.node.setScale(baseScale);
            let addNew = this.setSlotThingFromArray(slot);
            slot.node.setScale(0, 0, 0);
            if(addNew) {
                slot.label.node.active = true;
                tween(slot.node)
                .to(0.3, {scale: baseScale}, {easing: 'backOut'})
                .call(() => {
                    if(addNew) {
                        this.slots.push(slot);
                        Room.sortByLayout(this.slots);

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


