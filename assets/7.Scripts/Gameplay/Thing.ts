import { _decorator, Animation, color, Component, Enum, EventTouch, instantiate, Layers, Material, MeshRenderer, Node, Size, SkinnedMeshRenderer, sp, Sprite, SpriteFrame, Tween, tween, UIRenderer, UITransform, v3, Vec3 } from 'cc';
import { PoolMember } from '../Pool/PoolMember';
import { room } from './Room';
import Ulis from '../Misc/Ulis';
import { ui } from '../Manager/UI';
import { sm, SoundType } from '../Manager/SoundManager';
import { ipm } from '../Manager/InputManager';
import { Slot } from './Slot';
import { NodeOrder } from '../MatchAsset/NodeOrder';
import { Bubble } from './Bubble';
import { Fish } from './FishMove/Fish';
import { pm } from '../Pool/PoolManager';
const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('Thing')
// @executeInEditMode(true)
export class Thing extends PoolMember {
    

    @property
    thingType: number = -1;
    box: Slot = null;
    slot: Slot = null;
    @property
    sfx: boolean = false;
    bubble: Bubble = null;
    @property({
        type: Enum(SoundType),
        visible() {
            return this.sfx;
        },
    })
    audio: SoundType = SoundType.Done;

    touch: Node = null;
    fish: Fish = null;
    inited: boolean = false;
    moving: boolean = false;
    waiting: boolean = false;
    /** Hệ số đã nhân vào model của con cá lúc gen bubble (Room.bubbleFishScale), Slot chia lại khi vào bể / ô chờ. */
    modelScale: number = 1;
    init(toucable: boolean = true) {
        this.setMeshMat();
        if(this.inited) return;
        this.moving = false;
        this.inited = true;
        this.fish = this.getComponentInChildren(Fish);
        this.touch = this.node.getChildByName("Touch");
        toucable && this.onTouch();

    }

    setMeshMat() {
        // let mat = room.mat.getClone(this.thingType);
        let mat = room.mat.mats[this.thingType];
        if(!mat) return;
        // Model có thể tách thành nhiều MeshRenderer (vd SK_Fish18: 3 SkinnedMeshRenderer) và mỗi mesh có thể có
        // nhiều submesh (vd cá Fishdom: vây / thân / mắt / răng) - gán material của Mats cho mọi slot đang để
        // trống, slot nào đã gán sẵn material thì giữ nguyên.
        this.getComponentsInChildren(MeshRenderer).forEach(mesh => {
            let count = mesh.mesh ? mesh.mesh.struct.primitives.length : 1;
            for(let i = 0; i < count; i++) {
                if(!mesh.sharedMaterials[i]) mesh.setSharedMaterial(mat, i);
            }
        });
    }


    offTouch() {
        if(!this.node) return;
        this.touch.off(Node.EventType.TOUCH_START, this.onPress, this);
        this.touch.off(Node.EventType.TOUCH_MOVE, this.onDrag, this);
        this.touch.off(Node.EventType.TOUCH_END, this.onRelease, this);
        this.touch.off(Node.EventType.TOUCH_CANCEL, this.onRelease, this);
        this.offHightlight();
    }

    onTouch() {
        this.touch.on(Node.EventType.TOUCH_START, this.onPress, this);
        this.touch.on(Node.EventType.TOUCH_MOVE, this.onDrag, this);
        this.touch.on(Node.EventType.TOUCH_END, this.onRelease, this);
        this.touch.on(Node.EventType.TOUCH_CANCEL, this.onRelease, this);
    }

    /** Chạm xuống cá: Room.dragCollect bật thì chỉ outline (nhấc tay mới chọn), tắt thì chọn ngay như cũ. */
    onPress(event: EventTouch) {
        if (room.dragCollect) {
            ipm.fisrtTap();
            room.onPointerMove(event);
        } else {
            this.onTouchStart(event);
        }
    }

    onDrag(event: EventTouch) {
        room.onPointerMove(event);
    }

    onRelease(event: EventTouch) {
        room.onPointerUp(event);
    }

    onTouchMove(event: EventTouch) {
    }

    none() {}

    onDespawn() {
        let src = this.fish.node.children[0];
        room.despawnSrc(src);
        // pm.despawn(this);
        this.node.destroy();
    }

    onTouchStart(event: EventTouch) {
        let pos = event.getUILocation();
        let wpos = v3(pos.x, pos.y, 0);       
        room.checkBox(this, wpos);     
        ipm.fisrtTap();   
    }

    /** Mode NoBox: click cá chưa có bể cần -> lắc ngang nhẹ tại chỗ + âm báo sai. Click liên tục không cộng dồn lệch. */
    private shakeTween: Tween<Node> = null;
    private shakeBase: Vec3 = null;
    shake() {
        this.stopShake();
        sm.playSound(SoundType.LandWrong);
        const base = this.shakeBase = this.node.position.clone();
        const d = 14;
        this.shakeTween = tween(this.node)
            .to(0.05, { position: v3(base.x - d, base.y, base.z) })
            .to(0.08, { position: v3(base.x + d, base.y, base.z) })
            .to(0.07, { position: v3(base.x - d * 0.5, base.y, base.z) })
            .to(0.05, { position: base.clone() })
            .call(() => { this.shakeTween = null; this.shakeBase = null; })
            .start();
    }

    stopShake() {
        if (!this.shakeTween) return;
        this.shakeTween.stop();
        this.shakeTween = null;
        if (this.shakeBase) this.node.position = this.shakeBase;
        this.shakeBase = null;
    }

    // Outline con cá đang được chỉ. Shader đẩy viền theo pháp tuyến trong đơn vị local của mesh (lineWidth * 0.001) nên
    // cùng 1 lineWidth thì cá glb gần như không thấy còn cá FBX (model scale hàng nghìn) phình thành mảng vàng khổng lồ,
    // và material Mats dùng chung cho cả loại cá. Vì vậy: chỉ đổi trên material instance riêng của con này, lineWidth tính
    // theo world scale của node gốc model để viền dày đúng room.highlightWidth pixel, màu room.highlightColor. Tắt outline
    // thì trả lineWidth / baseColor về đúng giá trị material dùng chung (giữ lại instance: Cocos 3.8 setSharedMaterial
    // cùng material là no-op, không bỏ được instance).
    private highlighted: boolean = false;

    onHightlight() {
        if (this.highlighted || !room) return;
        this.highlighted = true;
        this.getComponentsInChildren(MeshRenderer).forEach(mr => {
            const lw = this.outlineWidth(mr, room.highlightWidth);
            if (lw <= 0) return;
            mr.sharedMaterials.forEach((m, i) => {
                if (!m) return;
                const inst = mr.getMaterialInstance(i);
                inst.setProperty('lineWidth', lw);
                inst.setProperty('baseColor', room.highlightColor);
            });
        });
    }

    offHightlight() {
        if (!this.highlighted) return;
        this.highlighted = false;
        this.getComponentsInChildren(MeshRenderer).forEach(mr => {
            if (!mr.isValid) return;
            mr.sharedMaterials.forEach((m, i) => {
                if (!m) return;
                const inst = mr.getRenderMaterial(i);
                if (!inst || inst === m) return;
                inst.setProperty('lineWidth', m.getProperty('lineWidth') ?? 0);
                const bc = m.getProperty('baseColor');
                if (bc) inst.setProperty('baseColor', bc);
            });
        });
    }

    /** lineWidth để viền dày `px` đơn vị world. Shader đẩy viền sau skinning, tức trong không gian node gốc của model
     * (model.transform: skinningRoot với mesh skinned, chính node với mesh thường) -> chia cho world scale của node đó. */
    private outlineWidth(mr: MeshRenderer, px: number): number {
        const tf = (mr.model && mr.model.transform) || mr.node;
        const s = Math.abs(tf.worldScale.x);
        if (!(s > 0)) return 0;
        return px / (0.001 * s);
    }

    
    setUpLayer() {
        let l = Layers.nameToLayer("Particle");
        Ulis.allNode(this.node, (node) => node.layer = Math.pow(2, l));
    }

    setDownLayer() {
        let l = Layers.nameToLayer("UI_2D");
        Ulis.allNode(this.node, (node) => node.layer = Math.pow(2, l));
    }

    update(deltaTime: number) {
        if (this.touch && this.fish && this.fish.node) {
            let local = this.touch.parent.inverseTransformPoint(v3(), this.fish.node.worldPosition);
            this.touch.setPosition(local.x, local.y, this.touch.position.z);
        }
    }
}


