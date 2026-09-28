import { _decorator, Component, director, EventHandler, EventTouch, Material, Node, NodeSpace, Sprite, UITransform, v3, Vec3, Vec4 } from 'cc';
import { ui } from '../Manager/UI';
import { ipm } from '../Manager/InputManager';
import { room } from '../Gameplay/Room';
const { ccclass, property } = _decorator;

const RIPPLE_POINT_COUNT = 8; // must match POINT_COUNT in WaveSprite.effect
const TOUCH_COUNT = 8; // must match TOUCH_COUNT in Bubble.effect
const HIT_COUNT = 8; // must match HIT_COUNT in Bubble.effect

@ccclass('WaveSprite')
export class WaveSprite extends Component {

    // 0 = don't tile, sample the texture once across the whole sprite.
    // For a seamless result the sprite frame's texture must have its Wrap Mode (S and T) set to
    // Mirrored Repeat in its import settings, must be power-of-two sized, and must not be packed
    // into a sprite atlas / the dynamic atlas (wrapping would bleed into neighboring packed sprites).


    uit: UITransform =  null;
    sprite: Sprite = null;
    material: Material = null;
    ripplePoints: Vec4[] = [];
    ripplePointIndex = 0;
    touchPointIndex = 0;
    // Direction FROM the poke position TOWARD the sprite center for each slot (xy), plus trigger time
    // (z), used by touchOffset's traveling dent/bulge wave around the bubble.
    touchs: Vec4[] = [];

    hitIndex = 0;
    // Independent slot pool for flatSpotOffset's static press: x = collision angle around the center
    // (same convention as the shader's atan(c.y, c.x)); y = "ever used" flag (0 unset, 1 set) - once
    // set it's never cleared back to 0, so a leftover default slot can never look active on its own;
    // z = the time this activation started (eases the press in over flatEaseTime); w = the time
    // clearHit() was called, or -1 while still live (eases the press back out over flatEaseTime instead
    // of snapping off).
    hits: Vec4[] = [];
    @property
    bindTouch: boolean = true;
    @property
    bindMove: boolean = false;

    start() {
        this.init();
    }

    init() {
        this.uit = this.node.getComponent(UITransform);
        this.sprite = this.node.getComponent(Sprite);
        this.material = this.sprite.getMaterialInstance(0);
        if(this.bindTouch)  {
            this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);            
        }
        if(this.bindMove)  {
            this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);    
            this.node.on(Node.EventType.TOUCH_END 
            || Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);     
        
        }
        for (let i = 0; i < RIPPLE_POINT_COUNT; i++) {
            this.ripplePoints.push(new Vec4(0, 0, -1000, 1));
        }
        for (let i = 0; i < TOUCH_COUNT; i++) {
            this.touchs.push(new Vec4(0, 0, -1000, 0));
        }
        for (let i = 0; i < HIT_COUNT; i++) {
            this.hits.push(new Vec4(0, 0, 0, -1));
        }
        // Push the inactive defaults to the GPU right away, otherwise the uniform sits at its
        // compiled-in (0,0,0,0) default until the first touch, which reads as a phantom ripple at start.
        this.material.setProperty('point', this.ripplePoints);
        this.material.setProperty('touchs', this.touchs);
        this.material.setProperty('hits', this.hits);
    }

    // Local-space position of the sprite's own center (accounting for anchor), shared by onTouch/onCollision.
    getCenterLocal(): Vec3 {
        const { width, height } = this.uit.contentSize;
        const { x: anchorX, y: anchorY } = this.uit.anchorPoint;
        return v3((0.5 - anchorX) * width, (0.5 - anchorY) * height, 0);
    }

    @property([EventHandler])
    onTouchHandlers: EventHandler[] = [];
    onTouchStart(event: EventTouch) {
        this.onTouchHandlers[0] && this.onTouchHandlers[0].emit([event]);
        ipm.fisrtTap();
        let pos2 = event.getUILocation();
        let pos3 = v3(pos2.x, pos2.y, 0);
        this.node.inverseTransformPoint(pos3, pos3);
        this.onTouch(pos3);
        const { width, height } = this.uit.contentSize;
        const { x: anchorX, y: anchorY } = this.uit.anchorPoint;
        const uvX = (pos3.x + width * anchorX) / width;
        const uvY = 1 - (pos3.y + height * anchorY) / height;
        this.ripplePoints[this.ripplePointIndex].set(uvX, uvY, director.root.cumulativeTime, width / height);
        this.ripplePointIndex = (this.ripplePointIndex + 1) % RIPPLE_POINT_COUNT;
        this.material.setProperty('point', this.ripplePoints);
        
        // console.log("touch");
        
        // room.onTouchStart2(event);
    }

    
    onTouchMove(event: EventTouch) {
        room.onTouchMove2(event);
    }
    onTouchEnd(event: EventTouch) {
        room.onTouchEnd2(event);
    }


    // Triggers touchOffset's traveling dent/bulge wave around the bubble's edge.
    onTouch(pos: Vec3, space: NodeSpace = NodeSpace.LOCAL) {
        let lpos = space == NodeSpace.LOCAL ? pos : this.node.inverseTransformPoint(v3(), pos);
        const centerLocal = this.getCenterLocal();
        const dir = centerLocal.clone().subtract(lpos).normalize();
        this.touchs[this.touchPointIndex].set(dir.x, -dir.y, director.root.cumulativeTime, 0);
        this.touchPointIndex = (this.touchPointIndex + 1) % TOUCH_COUNT;
        this.material.setProperty('touchs', this.touchs);
    }
    
    // Writes to the given hit slot (see Bubble.ts: called every frame for each still-live contact,
    // always with the same index it was first assigned, so the flat spot can be repositioned smoothly
    // while active and finally cleared via clearHit(index) once the contact ends).
    onCollision(pos: Vec3, space: NodeSpace = NodeSpace.LOCAL, index: number) {
        let lpos = space == NodeSpace.LOCAL ? pos : this.node.inverseTransformPoint(v3(), pos);
        const centerLocal = this.getCenterLocal();
        // Negate y: the shader's uv0.y runs opposite to local Y, so this must match atan(c.y, c.x) there.
        const fromCenter = lpos.clone().subtract(centerLocal);
        const angle = Math.atan2(-fromCenter.y, fromCenter.x);
        const hit = this.hits[index];
        // Stamp a fresh start time whenever this slot is (re)activating - either it was never used
        // before (y < 0.5) or it was previously cleared and is now fading out (w >= 0) and a new
        // contact has claimed the same slot. Otherwise (a plain refresh of an already-live hit, called
        // every frame while the contact continues) keep the original start time so flatEaseTime's
        // ease-in isn't perpetually restarted.
        const isReactivating = hit.y < 0.5 || hit.w >= 0.0;
        const startTime = isReactivating ? director.root.cumulativeTime : hit.z;
        hit.set(angle, 1, startTime, -1);
        this.material.setProperty('hits', this.hits);
    }

    // Marks a specific hit slot as ending (e.g. once the contact that created it ends) so the shader
    // eases it back out over flatEaseTime, instead of leaving it pressed in forever or snapping off
    // instantly.
    clearHit(index: number) {
        const hit = this.hits[index];
        hit.w = director.root.cumulativeTime;
        this.material.setProperty('hits', this.hits);
    }

    update(deltaTime: number) {

    }
}


