import { _decorator, Animation, CCObject, clamp, clamp01, Collider2D, Component, Label, Layers, lerp, Material, math, Node, RigidBody2D, Size, sp, Sprite, Tween, tween, v3, Vec3 } from 'cc';
import { PoolMember, PoolType } from '../Pool/PoolMember';
import { Thing } from './Thing';
import { FishMove } from './FishMove/FishMove';
import Ulis, { cEasing } from '../Misc/Ulis';
import { room } from './Room';
import { ui } from '../Manager/UI';
import { sm, SoundType } from '../Manager/SoundManager';
import { World } from '../Manager/World';
import { Cloud } from '../Misc/Cloud';
const { ccclass, property } = _decorator;

@ccclass('Slot')
export class Slot extends PoolMember {
    start() {

    }

    @property
    thingType: number = -1
    @property(Thing)
    thing: Thing = null
    // @property(FishMove)
    fishMove: FishMove = null
    label: Label = null
    moveTween: Tween<any> = null
    amount: number = 0
    maxAmount: number = 0
    private movingCount: number = 0
    get moving(): boolean { return this.movingCount > 0; }
    anim: Animation = null;
    things: Thing[] = [];
    added: number = 0;
    queue: Thing[] = [];

    @property
    isSlot: boolean = true

    init() {
        if (!this.fishMove) this.fishMove = this.getComponent(FishMove);
    }

    initSlot() {
        let sps = this.node.getComponentsInChildren(Sprite);
        this.anim = this.node.getComponent(Animation);
        if (!this.fishMove) this.fishMove = this.getComponent(FishMove);
        if (!this.baseScale) this.baseScale = this.node.scale.clone();
        this.initTank();
    }

    // ---------- Bể giả: Tank > TankBubble (Bubble giả) > Fish > TankFish0..N ----------
    // Mỗi con cá bay vào bể sẽ bật 1 TankFish lên bơi trong bể (đúng loại của bể). Bubble giả chỉ để hiển thị: không
    // tham gia vật lý, không nằm trong room.bubbles / room.things nên không ảnh hưởng gen bubble / Items.

    /** Scale gốc của bể trong scene - hiệu ứng nảy / thu về 0 rồi phóng ra đều quay về đúng giá trị này. */
    baseScale: Vec3 = null;
    tankBubble: Node = null;
    tankThings: Thing[] = [];
    revealed: number = 0;
    bounceTween: Tween<Node> = null;

    initTank() {
        const tank = this.node.getChildByName("Tank");
        const bubble = tank ? tank.getComponentInChildren("Bubble") : null;
        this.tankBubble = bubble ? bubble.node : null;
        this.tankThings = this.tankBubble ? this.tankBubble.getComponentsInChildren(Thing) : [];
        if (!this.tankBubble) return;
        const body = this.tankBubble.getComponent(RigidBody2D);
        if (body) body.enabled = false;
        const collider = this.tankBubble.getComponent(Collider2D);
        if (collider) collider.enabled = false;
    }

    /** Bể nhận loại cá mới: thay model mọi TankFish bằng đúng loại, ẩn hết, xếp chỗ bơi trong bể giả. */
    setupTank(type: number) {
        this.revealed = 0;
        if (!this.tankBubble) return;
        this.tankThings.forEach(t => {
            const f: any = t.getComponentInChildren("Fish");
            if (!f) return;
            [...f.node.children].forEach((c: Node) => { c.removeFromParent(); c.destroy(); });
            const src: Node = room.getSrc(type);
            src.parent = f.node;
            src.position = v3(0, 0, 0);
            src.eulerAngles = v3(0, 0, 0);
            src.scale = v3(1, 1, 1);
            src.active = true;
            src._objFlags |= CCObject.Flags.DontSave;
            // Model mới -> dò lại bone cho animator (Fish.init chỉ build 1 lần).
            f.inited = true;
            f.build();
            f.setAnim(true);
            t.thingType = type;
            t.init(false);
            t.node.active = false;
        });
        const fm = this.tankBubble.getComponent(FishMove);
        if (fm) {
            fm.unscheduleAllCallbacks();
            fm.init();
        }
    }

    /** 1 con cá vừa bay vào bể: bật TankFish kế tiếp lên bơi. */
    revealTankFish() {
        const t = this.tankThings[this.revealed];
        this.revealed++;
        if (t) t.node.active = true;
    }

    /** Hiệu ứng cá đáp vào bể: nảy tương đối theo scale gốc (clip SlotHightLight cũ đặt scale tuyệt đối 0.845) + particle. */
    playLandFx() {
        const base = this.baseScale || this.node.scale.clone();
        this.bounceTween?.stop();
        this.bounceTween = tween(this.node)
            .to(0.25, { scale: base.clone().multiplyScalar(1.12) }, { easing: 'smooth' })
            .to(0.25, { scale: base.clone() }, { easing: 'smooth' })
            .start();
        const p = this.node.getChildByName("Particle2D-002");
        if (p) {
            p.active = true;
            this.scheduleOnce(() => { if (p.isValid) p.active = false; }, 0.48);
        }
    }

    index: number = 0

    swapIndex(slot: Slot) {
        slot.setThing(this.thing, true);
        this.onDespawnThing();
    }

    enqueue(thing: Thing): boolean {
        if (this.added + this.queue.length >= this.maxAmount) return false;
        thing.waiting = true;
        this.queue.push(thing);
        this.startQueueTicker();
        return true;
    }

    queueStagger: number = 0.2;
    private queueTicking: boolean = false;
    private tickQueue = () => {
        if (this.queue.length === 0) {
            this.unschedule(this.tickQueue);
            this.queueTicking = false;
            return;
        }
        const next = this.queue.shift();
        next.waiting = false;
        this.setThing(next);
    }
    private startQueueTicker() {
        if (this.queueTicking) return;
        this.queueTicking = true;
        this.schedule(this.tickQueue, this.queueStagger);
    }
    processQueue() {
        this.startQueueTicker();
    }

    setLabel(amount: number) {
        this.label = this.node.getComponentInChildren(Label);
        this.amount = amount;        
        this.maxAmount = amount;
        // this.label.node.active = false;
        this.label.string =  "0/" + amount;
    }

    count: number = 0
    decreaseLabel() {
        this.things
        // this.amount -= 1;
        this.count++;
        if(this.count > this.maxAmount) this.count = this.maxAmount;
        
        // this.label.string = "x" + this.amount;
        this.label.string =  this.things.length + "/" + this.maxAmount;
    }

    setThingFrame(thing: Thing) {
        this.thingType = thing.thingType;
        this.thing = thing;
    }

    spawnVFX(type: PoolType,target: Node) {
        let star = World.ins.poolManager.spawnType<Cloud>(type);
        star.node.parent = room.vfxNode;
        star.node.position = v3(0, 0, 0);
        star.init();
        star.target = target;
        return star;
    }

    avatar: Node = null
    movingThing: Thing = null
    setThing(thing: Thing, linear: boolean = false, callback: Function = null) {

        if(room.lose) return;

        sm.playSound(SoundType.Pick);
        let bubble = null;
        let star = null;
        this.movingCount++;
        let isBox = false;
        if(thing.box) {
            isBox = true;
            thing.box.onDespawnThing();
        }
        thing.box = this;
        this.thingType = thing.thingType;
        this.thing = thing;       
        if(!linear) {
            thing.sfx && sm.playSound(thing.audio);
            thing.bubble && thing.bubble.onThingOut(thing);
            let target = thing.touch.children[0]
            bubble = this.spawnVFX(PoolType.BubbleVFX, target);
            star = this.spawnVFX(PoolType.StarVFX, target);
        }
        const before = this.added; 

        let p = this.node.getChildByName("Fish") || this.node;
        Ulis.addToParent(thing.node, p);

        let s = thing.node.getScale();
        // Size cá trong bể / ô chờ chỉ theo room.slotFishScale / room.boxFishScale: chia lại hệ số model đã nhân lúc gen
        // bubble (Thing.modelScale = room.bubbleFishScale) để cá to trong bubble không kéo theo to trong bể / ô chờ.
        const modelScale = thing.modelScale > 0 ? thing.modelScale : 1;
        if(this.isSlot) {
            this.added += 1;
            // let wscale = this.avatar.getWorldScale();
            //  = thing.node.getWorldScale();
            s = v3(1, 1, 1).multiplyScalar(0.035 * room.slotFishScale / modelScale);
        }
        else {
            s = v3(1, 1, 1).multiplyScalar(0.02 * room.boxFishScale / modelScale);
        }
        thing.fish && thing.fish.moveToCenter();

        let pos = p.getWorldPosition();
        let npos = thing.node.getWorldPosition();
        let dir = npos.clone().subtract(pos);
        let time = dir.length() / 1700 ;
        time = clamp(time, 0.2, 0.6);
        let height = linear ? 0 : (this.isSlot ? -100 * time : -50 * time);
        // console.log(time);
        

        if(star) {
            let t = time - 0.1 > 0 ? time - 0.1 : 0.8 * time;
            tween({})
            .delay(t)
            .call(() => {
                star.target = null;
                bubble.target = null;                
            })
            .start();
        }
        thing.moving = true;
        this.movingThing = thing;
        const src = thing.node.getPosition();
        if(!linear && isBox) {
            time = time * 0.7;
            time = clamp(time, 0.2, 0.6);
        }

        const evalXY = (t: number): [number, number] => [
            lerp(src.x, 0, t),
            lerp(src.y, 0, clamp01(cEasing("cubicIn")(t))),
        ];
        const ARC_SAMPLES = 50;
        const arcLen = [0];
        let prevX = src.x, prevY = src.y;
        for (let i = 1; i <= ARC_SAMPLES; i++) {
            const [px, py] = evalXY(i / ARC_SAMPLES);
            arcLen.push(arcLen[i - 1] + Math.hypot(px - prevX, py - prevY));
            prevX = px; prevY = py;
        }
        const totalLen = arcLen[ARC_SAMPLES];
        const tFromArcRatio = (r: number): number => {
            const dist = r * totalLen;
            let i = 0;
            while (i < ARC_SAMPLES && arcLen[i + 1] < dist) i++;
            const segStart = arcLen[i], segEnd = arcLen[i + 1] ?? segStart;
            const segT = segEnd > segStart ? (dist - segStart) / (segEnd - segStart) : 0;
            return clamp01((i + segT) / ARC_SAMPLES);
        };

        let tmp = v3();
        if(this.isSlot) tmp.z = 200;
        
                if(!this.things.includes(thing)) this.things.push(thing);
        tween(thing.node)
        // .delay(this.things.length * 1)
        .to(time, {eulerAngles: v3(), scale: s}, {easing: 'smooth',
            onUpdate(target, ratio) {
                const [x, y] = evalXY(tFromArcRatio(ratio));
                tmp.x = x;
                tmp.y = y;
                thing.node.position = tmp;
            },
        })
        .call(() => {
            this.movingCount--;

            thing.moving = false;
            if(this.isSlot) {
                thing.fish?.setAnim(false);
                thing.node.active = false;
                this.revealTankFish();
                sm.playSound(SoundType.LandRight);
                callback && callback();
                this.decreaseLabel();
                if(before == this.added - 1 && this.added == this.amount) {
                    room.onFull(this);
                } else {
                    this.playLandFx();
                }

            } else {
                // console.log(thing.fish, this.fishMove);
                
                if(thing.fish && this.fishMove) {
                    this.fishMove.addFish(thing.fish);
                    thing.fish?.setAnim(true);
                }
                sm.playSound(SoundType.LandWrong);
                this.onMoved();
                room.moved();
                // room.rearrangeBoxes(room.boxes);
            }
            this.movingThing = null;
            this.processQueue();
        })
        .start();
    }

    onMoved() {
    }

    onDespawnThing() {
        if(this.thing) {
            if(this.thing.fish && this.fishMove) this.fishMove.removeFish(this.thing.fish);
            this.thing.box = null;
        }
        this.thingType = -1;
        this.thing = null;
    }

    update(deltaTime: number) {
        
    }
}


