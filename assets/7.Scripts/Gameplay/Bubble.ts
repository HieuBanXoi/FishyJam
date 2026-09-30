import { _decorator, CircleCollider2D, Component, ERigidBody2DType, instantiate, Node, NodeSpace, ParticleSystem, RigidBody, RigidBody2D, tween, v2, v3, Vec3 } from 'cc';
import { Thing } from './Thing';
import { room } from './Room';
import { WaveSprite } from '../Misc/WaveSprite';
import { FishMove } from './FishMove/FishMove';
import { PoolMember, PoolType } from '../Pool/PoolMember';
import { pm } from '../Pool/PoolManager';
import { Fish } from './FishMove/Fish';
import Ulis, { cEasing } from '../Misc/Ulis';
import { truncate } from '../Manager/UI';
const { ccclass, property } = _decorator;

const HIT_COUNT = 8; // must match HIT_COUNT in WaveSprite.ts / builtin-sprite.effect

@ccclass('Bubble')
export class Bubble extends PoolMember {

    things: Thing[] = [];
    waveSprite: WaveSprite = null;

    // No more Physics2D - Room.update() checks every bubble pair's distance against (a.radius +
    // b.radius) each frame and calls onContact/onEndContact directly, so this is just a plain number.

    // Keyed directly by the other bubble's node (stable for as long as the collision lasts) - value
    // packs the last known world contact point (x, y) and the hit slot index it owns (z) into one
    // Vec3. onCollision itself is only ever called from update() below; onContact/onEndContact just
    // keep this map in sync.
    contactHits: Map<Node, Vec3> = new Map();
    nextHitIndex = 0;
    collider: CircleCollider2D = null;
    fishMove: FishMove = null;
    body: RigidBody2D = null;

    init(data: number[]) {
        let p = this.node.getChildByName("Fish");
        p.destroyAllChildren();
        p.removeAllChildren();
        this.things = [];

        const minScale = 1, maxScale = 2.2, maxLen = 20;
        const t = Math.min((data.length - 1) / (maxLen - 1), 1);
        let scale = minScale + (maxScale - minScale) * cEasing('circOut')(t);
        scale *= 0.78;
        // Cá trong bubble được phóng theo room.bubbleFishScale (xem Room.scaleBubbleFish) -> bubble, khoảng cách bơi và
        // vùng chạm của cá phóng cùng hệ số để cá không tràn ra / chồng lên nhau.
        const fishScale = room && room.bubbleFishScale > 0 ? room.bubbleFishScale : 1;
        this.node.scale = v3(1, 1, 1).multiplyScalar(scale * fishScale);

        this.fishMove = this.getComponent(FishMove);
        if (this.fishMove) {
            // Bubble lấy từ pool nên dùng lại component: lưu giá trị gốc 1 lần rồi nhân, tránh nhân dồn qua các lần init.
            const fm = this.fishMove as any;
            if (!fm.__base) fm.__base = { radius: fm.radius, idleAmplitude: fm.idleAmplitude, bobAmplitude: fm.bobAmplitude, easeDistance: fm.easeDistance };
            fm.radius = fm.__base.radius * fishScale;
            fm.idleAmplitude = fm.__base.idleAmplitude * fishScale;
            fm.bobAmplitude = fm.__base.bobAmplitude * fishScale;
            fm.easeDistance = fm.__base.easeDistance * fishScale;
        }
        // const poseRadius = this.fishMove.radius;
        // const poseStartAngle = Math.random() * Math.PI * 2;
        // let poses = data.map((_, i) => {
        //     const a = poseStartAngle + (Math.PI * 2 / data.length) * i;
        //     return v3(Math.cos(a) * poseRadius, Math.sin(a) * poseRadius, 0);
        // });
        let length = data.length;
        let type = [1, 2, 6, 8, 10, 16, 17];
        data.forEach((d, i) => {

            // d = type[d];

            let thing = pm.spawnType<Thing>(PoolType.Thing);
            thing.node.parent = p;
            thing.node.position = v3();
            thing.node.eulerAngles = v3(0, 0, 0);
            // Bù toàn bộ scale của bubble (kể cả fishScale) để Thing giữ world scale 1 - cá to ra chỉ nhờ model đã nhân
            // trong Room.scaleBubbleFish, không bị nhân 2 lần.
            thing.node.scale = v3(1, 1, 1).multiplyScalar(1/(scale * fishScale));
            thing.thingType = d;
            let fish = room.getSrc(d);
            room.scaleBubbleFish(fish);
            let f = thing.getComponentInChildren(Fish);
            fish.parent = f.node;
            fish.position = v3(0, 0, 0);
            fish.eulerAngles = v3(0, 0, 0);
            fish.scale = v3(1, 1, 1);
            fish.active = true;
            f.init();
            thing.init();
            // Vùng chạm (node Touch) to theo cá; lưu scale gốc lần đầu để không nhân dồn khi dùng lại.
            if (thing.touch) {
                const touch = thing.touch as any;
                if (!touch.__baseScale) touch.__baseScale = touch.scale.clone();
                touch.setScale(touch.__baseScale.clone().multiplyScalar(fishScale));
            }
            thing.modelScale = fishScale;
            thing.bubble = this;
            thing.applyRestOutline();
            this.things.push(thing);
        })
        if(this.fishMove) {
            this.fishMove.init();
        }
        this.waveSprite = this.node.getComponentInChildren(WaveSprite);
        this.collider = this.getComponent(CircleCollider2D);
        this.body = this.getComponent(RigidBody2D);

        if(this.collider.sensor) {
            this.body.type = ERigidBody2DType.Dynamic;     
            this.collider.sensor = false;
            this.collider.apply();  
        }

        // this.body.linearVelocity = v2(0, length * 10);
    }

    /** Đảo ngược init(): trả về đúng 1 phần tử của Room.BubbleData ([x, y, types]) theo vị trí + loại cá hiện tại. */
    toData(): [number, number, number[]] {
        let things = this.getComponentsInChildren(Thing);
        return [truncate(this.node.position.x, 3), truncate(this.node.position.y, 3), things.map(t => t.thingType)];
    }

    // Called by Room.update() while `other` is within collision range.
    onContact(other: Bubble, wpos: Vec3) {
        const otherNode = other.node;

        const existing = this.contactHits.get(otherNode);
        const index = existing ? existing.z : this.nextHitIndex;
        if(!existing) {
            this.nextHitIndex = (this.nextHitIndex + 1) % HIT_COUNT;
        }
        this.contactHits.set(otherNode, v3(wpos.x, wpos.y, index));
    }

    // Called by Room.update() once `other` moves back out of collision range.
    onEndContact(other: Bubble) {
        const otherNode = other.node;
        const entry = this.contactHits.get(otherNode);
        if(entry) {
            this.waveSprite.clearHit(entry.z);
            this.contactHits.delete(otherNode);
        }
    }

    onThingOut(thing: Thing) {
        room.things = room.things.filter(t => t != thing);
        this.things = this.things.filter(t => t != thing);
        thing.bubble = null;
        this.fishMove.removeFish(thing.fish);
        this.touch();
        // console.log(this.things.length);
        
        if(this.things.length == 0) {
            room.onEmptyBubble(this);



            setTimeout(() => {
                // this.node.active = false; 
                
                // this.node.position = v3(0, 100000, -100000); 

                this.things = [];
                this.contactHits = new Map();
                this.nextHitIndex = 0;

                this.body.type = ERigidBody2DType.Static;     
                this.collider.sensor = true;
                this.collider.apply();    

                let s = this.node.getScale().multiplyScalar(1.2);
                tween(this.node)
                .to(0.1, {scale: s})
                .call(() => {
                    let pop = pm.spawn(PoolType.Pop);
                    pop.node.setParent(room.vfxNode);
                    pop.node.worldPosition = this.node.getWorldPosition();
                    pop.node.worldScale = this.node.getWorldScale();
                    let vfx = pop.getComponentInChildren(ParticleSystem)
                    vfx.clear();
                    vfx.play();
                    setTimeout(() => {
                        vfx.clear();
                        setTimeout(() => {
                            pm.despawn(pop);                          
                        }, 100);              
                    }, 1000); 
                    pm.despawn(this);                    
                })
                .start();



                // this.node.destroy(); 
            }, 100);

        }
    }

    touch() {
        let size = this.waveSprite.uit.contentSize;
        let aRadius = this.collider.radius * this.node.getWorldScale().x;
        let wpos = this.waveSprite.node.getWorldPosition().add(v3(0, aRadius, 0));
        this.waveSprite.onTouch(wpos, NodeSpace.WORLD);
    }

    update(deltaTime: number) {
        // The only place onCollision is called: pushes each still-active hit's last known contact
        // point (kept fresh by onContact, called every frame from Room.checkBubbleCollisions()) to
        // the shader.
        this.contactHits.forEach((entry) => {
            this.waveSprite.onCollision(v3(entry.x, entry.y, 0), NodeSpace.WORLD, entry.z);
        });
    }
}


