import { _decorator, Animation, clamp, clamp01, Component, Label, Layers, lerp, Material, math, Node, Size, sp, Sprite, Tween, tween, v3, Vec3 } from 'cc';
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
        this.initStars();
    }

    // ---------- Sao tiến độ: Stars > Star.. (sao rỗng) + StarDone.. (sao sáng, tắt sẵn) ----------
    // Mỗi con cá đáp vào bể bật 1 StarDone theo vị trí trái -> giữa -> phải; bể nhận loại mới (setLabel) thì tắt hết.
    // Sao giữa bật ra tại chỗ; sao 2 bên xuất hiện ở sao giữa, vừa phóng to vừa bay ra phía mình, quá đích
    // STAR_OVERSHOOT rồi bật về đúng chỗ.
    static readonly STAR_FLY_TIME = 0.22;
    static readonly STAR_SNAP_TIME = 0.08;
    static readonly STAR_OVERSHOOT = 0.2;

    starDones: Node[] = [];
    private starBaseScales: Vec3[] = [];
    private starBasePos: Vec3[] = [];
    private starLit: number = 0;

    initStars() {
        // Node chứa sao tên "Star" / "Stars"... - lấy node con đầu tiên bắt đầu bằng "Star" có chứa StarDone.
        const root = this.node.children.find(c => c.name.startsWith("Star") && c.children.some(k => k.name.startsWith("StarDone")));
        this.starDones = root ? root.children.filter(c => c.name.startsWith("StarDone")) : [];
        this.starDones.sort((a, b) => a.position.x - b.position.x);
        this.starBaseScales = this.starDones.map(s => s.scale.clone());
        this.starBasePos = this.starDones.map(s => s.position.clone());
        this.resetStars();
    }

    resetStars() {
        this.starLit = 0;
        this.starDones.forEach((s, i) => {
            Tween.stopAllByTarget(s);
            s.setScale(this.starBaseScales[i]);
            s.setPosition(this.starBasePos[i]);
            s.active = false;
        });
    }

    /** Vị trí sao giữa (sao có x gần 0 nhất) - điểm xuất phát của 2 sao bên. */
    private starCenter(): Vec3 {
        let best = this.starBasePos[0];
        this.starBasePos.forEach(p => { if (Math.abs(p.x) < Math.abs(best.x)) best = p; });
        return best;
    }

    /** Bật sao kế tiếp (gọi khi 1 con cá đáp vào bể). */
    lightNextStar() {
        this.lightStar(this.starLit);
        this.starLit++;
    }

    lightStar(index: number) {
        const s = this.starDones[index];
        if (!s || s.active) return;
        const base = this.starBaseScales[index];
        const pos = this.starBasePos[index];
        const center = this.starCenter();
        s.active = true;
        Tween.stopAllByTarget(s);
        if (!pos || !center || pos === center) {
            s.setScale(0, 0, 0);
            tween(s).to(0.3, { scale: base.clone() }, { easing: 'backOut' }).start();
            return;
        }
        const over = pos.clone().add(pos.clone().subtract(center).multiplyScalar(Slot.STAR_OVERSHOOT));
        s.setPosition(center);
        s.setScale(0, 0, 0);
        tween(s)
            .to(Slot.STAR_FLY_TIME, { position: over, scale: base.clone().multiplyScalar(1.1) }, { easing: 'quadOut' })
            .to(Slot.STAR_SNAP_TIME, { position: pos.clone(), scale: base.clone() }, { easing: 'quadIn' })
            .start();
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
        // Bể nhận loại mới -> tắt hết sao.
        this.resetStars();
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
        if(this.isSlot) {
            this.added += 1;
            // let wscale = this.avatar.getWorldScale();
            //  = thing.node.getWorldScale();
            s = v3(1, 1, 1).multiplyScalar(0.035);
        } 
        else {            
            s = v3(1, 1, 1).multiplyScalar(0.02);
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
                sm.playSound(SoundType.LandRight);
                callback && callback();
                this.decreaseLabel();
                this.lightNextStar();
                if(before == this.added - 1 && this.added == this.amount) {
                    room.onFull(this);
                }

                this.getComponent(Animation)?.play();

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


