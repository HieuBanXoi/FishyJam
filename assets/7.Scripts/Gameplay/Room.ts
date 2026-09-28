import { _decorator, Animation, CCObjectFlags, Component, EventKeyboard, EventTouch, Input, input, instantiate, JsonAsset, KeyCode, MeshRenderer, misc, Node, PhysicsSystem, PhysicsSystem2D, Sprite, Tween, tween, UITransform, v2, v3, Vec2, Vec3 } from 'cc';
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
 [[132.428,1268.46,[16,6]],[-621.029,874.37,[1,16,16]],[620.997,1242.781,[16,10,6]],[-331.329,1268.474,[17,1]],[311.746,840.762,[1,10]],[710.886,827.523,[16]],[710.774,492.52,[6]],[-147.621,672.359,[1,10,17]],[245.951,381.656,[10,6]],[-226.381,189.451,[6,17]],[620.976,67.396,[8,10,8]],[-646.47,385.848,[16,1]],[125.572,0.849,[10]],[-646.417,-77.964,[8,10]],[-181.644,-297.852,[17,17,16]],[-620.956,-566.574,[16,17,1]],[342.884,-253.975,[10]],[101.306,-697.127,[6,6]],[-602.293,-1099.642,[17,8,8,16]],[-56.128,-1180.229,[8,8,10,6]],[602.341,-613.586,[8,6,1,17]],[495.364,-1155.148,[1,1,17,8]]]

export const Items = [
  [16, 16, 16],
  [6, 6, 6],
  [1, 1, 1],
  [17, 17, 17],
  [8, 8, 8],
  [10, 10, 10],
  [16, 16, 16],
  [17, 17, 17],
  [16, 16, 16],
  [17, 17, 17],
  [8, 8, 8],
  [1, 1, 1],
  [6, 6, 6],
  [8, 8, 8],
  [1, 1, 1],
  [10, 10, 10],
  [6, 6, 6],
  [10, 10, 10],
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
    initBubbles() {
        this.thingNode.destroyAllChildren();
        this.thingNode.removeAllChildren();
        this.bubbles = BubbleData.map(([x, y, types]) => {
            let bubble = pm.spawnType<Bubble>(PoolType.Bubble);
            bubble.node.parent = this.thingNode;
            bubble.node.position = v3(x, y, 0);
            bubble.node._objFlags = CCObjectFlags.DontSave;
            bubble.init(types);
            return bubble;
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
     * chứa tối đa 1 slot) - mỗi nhóm 3 con liên tiếp nhận 1 loại, xoay vòng theo fishTypes; phần dư không đủ 1
     * nhóm 3 thì bỏ (ví dụ totalFish=20, fishTypes=[0,1,2,3] -> 20 = 3*6 + 2: 6 nhóm liên tục nhận loại
     * 0,1,2,3,0,1, 2 con dư cuối không được gán loại). */
    randomFromAvailableBubbles(fishTypes: number[] = [0, 1, 2]): [number, number, number[]][] {
        const bubbles = this.thingNode.getComponentsInChildren(Bubble);
        const sizes = bubbles.map(b => b.getComponentsInChildren(Thing).length);
        const totalFish = sizes.reduce((sum, n) => sum + n, 0);

        const GROUP_SIZE = 3;
        const groupCount = Math.floor(totalFish / GROUP_SIZE);
        var typeStream: number[] = [];
        for (let g = 0; g < groupCount; g++) {
            const type = fishTypes[g % fishTypes.length];
            for (let i = 0; i < GROUP_SIZE; i++) typeStream.push(type);
        }

        typeStream = Ulis.shuffleArray(typeStream);

        // Đổ typeStream tuần tự vào từng bubble theo đúng size hiện tại - bubble nào rơi đúng lúc typeStream cạn
        // (do phần dư bị bỏ) sẽ nhận ít type hơn size gốc.
        let cursor = 0;
        const data = bubbles.map((b, i): [number, number, number[]] => {
            const size = sizes[i];
            const types = typeStream.slice(cursor, cursor + size);
            cursor += size;
            return [b.node.position.x, b.node.position.y, types];
        });
        console.log(JSON.stringify(data));
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
    @property
    set genBubleFromAvai(v: boolean) { this.randomFromAvailableBubbles(this.fishTypes); }
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
        .delay(5)
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
            this.tap(null);
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
                this.taps = [];
                let t0 = Items[0][0];
                console.log(t0);                
                let things = this.things.filter(t => t.thingType == t0);
                this.taps = things.map(t => t.node).splice(0, 3);
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


