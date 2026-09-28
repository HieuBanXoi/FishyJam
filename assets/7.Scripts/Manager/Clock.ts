import { _decorator, Color, Component, Enum, Label, Node, Sprite, Tween, tween, UI, v3 } from 'cc';
import { room } from '../Gameplay/Room';
const { ccclass, property } = _decorator;

// 180 or 2:00

export enum TimeFormat {
    Second,
    Minute
}

@ccclass('Clock')
export class Clock extends Component {

    @property
    time: number = 0;
    max: number = 0;
    @property(Label)
    label: Label = null!;
    @property(Node)
    needle: Node = null!;
    tween: Tween<any> = null!;
    changeColor: boolean = false;
    @property({
        type: Enum(TimeFormat)
    })
    timeFormat: TimeFormat = TimeFormat.Minute;
    @property(Sprite)
    scaleBar: Sprite = null!;

    ratio: number = 0;

    setTime() {
        this.needle.eulerAngles = v3(0, 0, -(this.max - this.time) * 360 / 60);
        let seconds = this.time % 60;
        let secondsStr = seconds < 10 ? '0' + seconds : seconds.toString();

        let minutes = (this.time - seconds) / 60;
        let minutesStr = minutes.toString();

        let txt =  minutesStr + ' : ' + secondsStr  

        if(this.timeFormat == TimeFormat.Second) txt = this.time + "s";

        this.label.string = txt;

        // let ratio = this.time / this.max;

        // this.scaleBar.fillRange = 1 - ratio;

        if(!this.changeColor) 
        if(this.time < 10) {
            this.changeColor = true;
            this.label.color = new Color(255, 0, 0);
        }
    }

    checked: boolean = false;
    // @property
    checkingRatio: number = 0.66;
    onRatio() {
        if(!this.checked && this.time <= 90) {
            this.checked = true;
            this.onChecking();
        }
    }

    onChecking() {
        // room.onBind();
        room.fishTypes = [1, 2, 6, 8, 10, 16, 17]
    }


    onTimeUp() {

    }

    count() {
        this.tween = tween({t: 0})
        .to(this.max, {t: 1}, {
            "onUpdate": (target, ratio) => {
                this.scaleBar.fillRange = 1 - ratio;
                this.time = this.max - Math.floor(this.max * ratio);
                this.ratio = ratio;
                this.onRatio();
                this.setTime();
            }
        })
        .call(() => {
            this.onTimeUp();
        })
        .start();
    }

    stop() {
        this.tween.stop();
    }

    init() {
        this.max = this.time;
        this.setTime();
        // setTimeout(() => {
        //     this.count();
        // }, 1000);
    }

    update(deltaTime: number) {
        
    }
}


