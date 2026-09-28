import { _decorator, Animation, Camera, Color, Component, Director, Enum, EventTouch, Label, misc, Node, ParticleSystem2D, PhysicsSystem, size, Size, Sprite, toDegree, Tween, tween, UITransform, v2, v3, Vec2, Vec3, view, Widget } from 'cc';
import { World } from './World';
import { PointerController } from './PointerController';
import { SoundType } from './SoundManager';
import { ipm } from './InputManager';
import { AppLovinAnalytics } from '../Tool/AppLovinAnalytics';
import { room } from '../Gameplay/Room';
const { ccclass, property } = _decorator;

export enum BindUIType {
    Left,
    Right,
    Top,
    Bottom
}

@ccclass("BindingUI")
export class BindingUI {
    @property([Node])
    binds: Node[] = [];

    @property({type: Enum(BindUIType)})
    type: BindUIType = BindUIType.Left;
}

export var ui: UI = null;

@ccclass('UI')
export class UI extends Component {

    @property(Camera)
    uiCam: Camera = null;
    @property(Camera)
    pCam: Camera = null;
    @property(Node)
    hand: Node = null!;
    @property(Node)
    endcard: Node = null!;
    @property(Node)
    winCard: Node = null!;
    win: boolean = false;

    resizeFuncs: Function[] = [];
    onStoreFuncs: Function[] = [];

    onLoad() {
        ui = this;
        
        try {
            
            if(PlayableSDK.channel == "Google") {
                this.offButtons.forEach(node => node.active = false);                
            }
            
            
        } catch (error) {
            
        }
    }

    @property(Node)
    storeNode: Node = null!;
    bindingToStore() {
        PointerController.ins.unBindingEvent();
        ipm.offBinding();
        PointerController.ins.onStore();
        this.storeNode.active = true;
    }

    openStore(...args: any) {
        console.log('openStore', args);  
        World.ins.soundmanager.stopAll();      
        World.ins.openStore.redirectToStore();
        AppLovinAnalytics.ctaClicked();  

        if(args[1] && args[1] == "button") {

        } else {
            
        }

        if(this.end) {
            room?.clock?.stop();
        }

    }

    first: boolean = true;
    firstMove() {
        if(this.first) {
            this.first = false;
            this.fisrtOn.forEach(node => node.active = true);
            this.firstOff.forEach(node => node.active = false);
        }
    }


    pass25: boolean = false;
    pass50: boolean = false;
    pass75: boolean = false;
    onProgress(p: number) {
        if(p >= 25 && !this.pass25) {
            this.pass25 = true;
            console.log("Progress", truncate(p, 2));
            AppLovinAnalytics.challenge25();
        }
        if(p >= 50 && !this.pass50) {
            this.pass50 = true;
            console.log("Progress", truncate(p, 2));
            AppLovinAnalytics.challenge50();
        }
        if(p >= 75 && !this.pass75) {
            this.pass75 = true;
            console.log("Progress", truncate(p, 2));
            AppLovinAnalytics.challenge75();
        }
        if(p >= 100) {
            AppLovinAnalytics.challengeSolved();

            // setTimeout(() => {
            //     this.onWin();
            // }, 1000);
        }
    }

    end: boolean = false;
    onLose() {
        if(this.endcard.active || this.winCard.active) return;  
        if(this.end) return;
        room?.clock?.stop();
        this.end = true;
        AppLovinAnalytics.challengeFailed();  
        AppLovinAnalytics.endcardShown();  
        this.offEnds.forEach(button => button.active = false);
        this.offHand();
        this.endcard.active = true;
        this.bindingToStore();       
        World.ins.soundmanager.playSound(SoundType.Fail);    
    }


    onWin() {
        if(this.endcard.active || this.winCard.active) return; 
        if(this.end) return;
        room?.clock?.stop();
        this.end = true;
        AppLovinAnalytics.endcardShown();  
        this.offEnds.forEach(button => button.active = false);
        this.offHand();
        this.winCard.active = true;
        this.bindingToStore();  
        World.ins.soundmanager.playSound(SoundType.Win);      
    }

    offHand() {
        this.hand.active = false;
    }


    @property(BindingUI)
    topNode: BindingUI = null!;
    @property(BindingUI)
    bottomNode: BindingUI = null!;
    @property(BindingUI)
    leftNode: BindingUI = null!;
    @property(BindingUI)
    rightNode: BindingUI = null!;      
    @property([BindingUI])
    bindings: BindingUI[] = [];

    getEdge(type: BindUIType) {
        switch(type) {
            case BindUIType.Top:
                return this.topNode.binds[0].getWorldPosition().y;
            case BindUIType.Bottom:
                return this.bottomNode.binds[0].getWorldPosition().y;
            case BindUIType.Left:
                return this.leftNode.binds[0].getWorldPosition().x;
            case BindUIType.Right:
                return this.rightNode.binds[0].getWorldPosition().x;
        }
    }

    bind() {
        let pos = this.uiCam.node.position.clone();
        {
            this.topNode.binds[0].position = this.topNode.binds[0].position.clone();
            this.topNode.binds[0].position = v3(this.topNode.binds[0].position.x + pos.x, 
            this.height + pos.y, 
            this.topNode.binds[0].position.z);

            this.bottomNode.binds[0].position = this.bottomNode.binds[0].position.clone();
            this.bottomNode.binds[0].position = v3(this.bottomNode.binds[0].position.x + pos.x, 
            -this.height + pos.y, 
            this.bottomNode.binds[0].position.z);

            this.leftNode.binds[0].position = this.leftNode.binds[0].position.clone();
            this.leftNode.binds[0].position = v3(-this.width + pos.x, 
            this.leftNode.binds[0].position.y + pos.y, 
            this.leftNode.binds[0].position.z);

            this.rightNode.binds[0].position = this.rightNode.binds[0].position.clone();
            this.rightNode.binds[0].position = v3(this.width + pos.x, 
            this.rightNode.binds[0].position.y + pos.y, 
            this.rightNode.binds[0].position.z);
        }


        this.bindings.forEach(bind => {
            bind.binds.forEach(item => {
                item.position = item.position.clone();
                let pos = item.getWorldPosition();
                switch(bind.type) {
                    case BindUIType.Top:
                        pos.y = this.getEdge(bind.type);
                        break;
                    case BindUIType.Bottom:
                        pos.y = this.getEdge(bind.type);
                        break;
                    case BindUIType.Left:
                        pos.x = this.getEdge(bind.type);
                        break;
                    case BindUIType.Right:
                        pos.x = this.getEdge(bind.type);
                        break;
                }
                let lpos = item.parent.inverseTransformPoint(v3(), pos);
                item.position = lpos;
            })            
        })   
    }

    keepTap() {    
        if(this.current && this.hand.active) {
            this.handTap(this.current);
        }   
    }

    width: number = 0;
    height: number = 0;
    scale: number = 0;
    
    @property([Node])
    offButtons: Node[] = [];
    @property([Node])
    offEnds: Node[] = [];

    @property([Node])
    fisrtOn: Node[] = [];
    @property([Node])
    firstOff: Node[] = [];

    @property([Node])
    adaptUIs: Node[] = [];
    @property([Node])
    gameplays: Node[] = []

    @property([Node])
    portraitNodes: Node[] = [];
    @property([Node])
    landscapeNodes: Node[] = [];


    firstScale: boolean = false;
    resize(scale: number = this.scale) {
        this.scale = scale;
        this.height = this.uiCam.orthoHeight + 0;
        this.width = 1080/2350 * this.height * scale;  
        console.log(this.width / this.height, this.width, this.height, scale);
        if(this.width / this.height < 1.6) {
            scale = misc.clampf(scale, 0, 1.3); 
            // scale = 1;
            this.portraitNodes.forEach((item) => {
                item.active = true;
            });
            this.landscapeNodes.forEach((item) => {
                item.active = false;
            });
            this.adaptUIs.forEach((item) => {
                item.scale = v3(1, 1, 1);
            });
            this.gameplays.forEach((item) => {
                item.scale = v3(1, 1, 1).multiplyScalar(scale);
            })      
        } else {
            this.portraitNodes.forEach((item) => {
                item.active = false;
            });
            this.landscapeNodes.forEach((item) => {
                item.active = true;
            });
            this.adaptUIs.forEach((item) => {
                item.scale = v3(1, 1, 1).multiplyScalar(2);
            });
            this.gameplays.forEach((item) => {
                item.scale = v3(1, 1, 1).multiplyScalar(1.3);
            })
        }
        this.bind();          
    }

    handTap(node: Node) {
        if(!node) return;
        this.current = node;
        let wpos = node.getWorldPosition();
        let lpos = this.hand.parent.inverseTransformPoint(v3(), wpos);
        this.hand.position = lpos;
        // console.log(node.name, lpos);
        if(wpos.x > 0.8 * 2 * this.width) {
            this.hand.children[0].children[0].scale = v3(-1, 1, 1);
        } else {
            this.hand.children[0].children[0].scale = v3(1, 1, 1);
        }
        
        this.hand.active = true;
    }

    moveDir: number = 1;
    // @property(Node)
    startHand: Node = null!;
    // @property(Node)
    endHand: Node = null!;
    // @property(Node)
    current: Node = null!;
    cTween: Tween<any> = null!;
    hTween: Tween<any> = null!;
    isFirtMove: number = 0;
    delayTime: number = 0;
    moveHand() {
        if(!this.startHand || !this.endHand) return;
        let dt = this.delayTime;
        if(this.isFirtMove > 0) {
            this.isFirtMove--;
            dt = 0;
        }
        this.hTween = tween({t: 0})
        .delay(dt)
        .call(() => {
            this.handTap(this.startHand);
            const hand = this.hand;
            let child = this.hand.children[0].getComponentInChildren(Sprite)!;
            child.color = new Color(255, 255, 255, 255);
            // child.node.scale = v3(1, 1, 1).multiplyScalar(2);
            let pos = this.endHand.getWorldPosition();
            let delta = this.hand.worldPosition.clone().subtract(pos);
            
            if(this.moveDir == 0) {

                let p = v3(pos.x, this.hand.worldPosition.y,  this.hand.worldPosition.z);
                let time = delta.length() * 0.5;


                this.hTween = tween(this.hand)
                .delay(0.2)
                .to(time, {worldPosition: p}, {easing: 'smooth'})
                .call(() => {          
                    p = v3(this.hand.worldPosition.x,  this.hand.worldPosition.y, pos.z);
                    let time = delta.length() * 0.5;
                    this.hTween = tween(this.hand)
                    .to(time, {worldPosition: p}, {easing: 'smooth'})
                    .call(() => {
                        this.cTween = tween(child).delay(0.2).to(0.2, {color: new Color(255, 255, 255, 0)}, {easing: 'smooth'})
                        .call(() => {
                            this.moveHand();
                        })
                        .start();   
                    })
                    .start();
                })
                .start();

            } else if (this.moveDir == 1) {

                let p = v3(pos.x, pos.y, pos.z);
                let time = delta.length() / 1000;

                this.hTween = tween(this.hand)
                .delay(0.2)
                .to(time, {worldPosition: p}, {easing: 'smooth',
                    onUpdate(target, ratio) {
                    },
                })
                .call(() => {         
                    this.cTween = tween(child).delay(0.2).to(0.2, {}, {easing: 'smooth',
                        onUpdate(target, ratio) {
                            child.color = new Color(255, 255, 255, 255 * (1 - ratio));
                            
                        },
                    })
                    .call(() => {
                        this.moveHand();
                    })
                    .start();   
                })
                .start();

            }
        })
        .start();
    }

    start() {
    }

    update(dt: number) {
        let size = view.getVisibleSize();
        let scale = size.width/1080;
        if(scale != this.scale) {          
            this.resize(scale);
        }
        let time = 0;
        setTimeout(() => {            
            this.keepTap();          
        }, time);
    }
}


    
export function truncate(n: number, m: number): number {
        const factor = 10 ** m;
        return Math.trunc(n * factor) / factor;
    }