import { _decorator, Animation, Color, color, Component, Enum, EventTouch, instantiate, Layers, Material, MeshRenderer, Node, Size, SkinnedMeshRenderer, sp, Sprite, SpriteFrame, Tween, tween, UIRenderer, UITransform, v3, Vec3 } from 'cc';
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

    /** Chạm xuống cá: Room.dragCollect bật thì chỉ sáng viền (nhấc tay mới chọn), tắt thì chọn ngay như cũ. */
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

    // Viền cá. Shader đẩy viền theo pháp tuyến (lineWidth * 0.001) SAU skinning, tức trong không gian node gốc của model
    // -> lineWidth = px / (0.001 * world scale node gốc) để mọi loại cá (glb / FBX) có viền dày đúng px. Chỉ đổi trên
    // material instance riêng của con này (Mats dùng chung cả loại). Tắt viền thì trả lineWidth / baseColor về giá trị
    // material dùng chung (giữ instance: Cocos 3.8 setSharedMaterial cùng material là no-op).
    // - hover: room.highlightWidth / highlightColor (vàng)
    // - khi không hover: viền "nghỉ" - cá trong bubble đen (room.outlineWidth / outlineColor), icon trên bể vàng.
    private highlighted: boolean = false;
    private restOutlined: boolean = false;
    private restWidth: number = 0;
    private restColor: Color = null;

    onHightlight() {
        if (this.highlighted || !room) return;
        this.highlighted = true;
        this.setOutline(room.highlightWidth, room.highlightColor);
    }

    offHightlight() {
        if (!this.highlighted) return;
        this.highlighted = false;
        if (this.restOutlined) this.setOutline(this.restWidth, this.restColor);
        else this.resetOutline();
    }

    /** Viền khi không hover: mặc định room.outlineWidth / outlineColor (cá trong bubble); truyền px / col cho viền riêng. */
    applyRestOutline(px: number = room ? room.outlineWidth : 0, col: Color = room ? room.outlineColor : null) {
        if (!room) return;
        this.restWidth = px;
        this.restColor = col;
        this.restOutlined = px > 0 && !!col;
        if (this.highlighted) return;
        if (this.restOutlined) this.setOutline(px, col);
        else this.resetOutline();
    }

    private setOutline(px: number, col: Color) {
        this.getComponentsInChildren(MeshRenderer).forEach(mr => {
            const lw = this.outlineWidth(mr, px);
            if (lw <= 0) return;
            mr.sharedMaterials.forEach((m, i) => {
                if (!m) return;
                const inst = mr.getMaterialInstance(i);
                inst.setProperty('lineWidth', lw);
                inst.setProperty('baseColor', col);
            });
        });
    }

    private resetOutline() {
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

    private outlineWidth(mr: MeshRenderer, px: number): number {
        const tf = (mr.model && mr.model.transform) || (mr as SkinnedMeshRenderer).skinningRoot || mr.node;
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


