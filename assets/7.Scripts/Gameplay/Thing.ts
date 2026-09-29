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
        this.touch.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.touch.off(Node.EventType.TOUCH_MOVE, this.none, this);
        this.touch.off(Node.EventType.TOUCH_END, this.none, this);
        this.touch.off(Node.EventType.TOUCH_CANCEL, this.none, this);
        this.offHightlight();
    }

    onTouch() {
        this.touch.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.touch.on(Node.EventType.TOUCH_MOVE, this.none, this);
        this.touch.on(Node.EventType.TOUCH_END, this.none, this);
        this.touch.on(Node.EventType.TOUCH_CANCEL, this.none, this);
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

    onHightlight() {
        this.getComponentsInChildren(MeshRenderer).forEach(mesh => {
            mesh.materials.forEach(m => m?.setProperty("lineWidth", 600000));
        });
    }

    offHightlight() {
        this.getComponentsInChildren(MeshRenderer).forEach(mesh => {
            mesh.materials.forEach(m => m?.setProperty("lineWidth", 0));
        });
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


