import { _decorator, Component, MeshRenderer, Node, Quat, quat, v3 } from 'cc';
import { room } from '../Gameplay/Room';
const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('MatGet')
@executeInEditMode(true)
export class MatGet extends Component {
    start() {
        let index = this.node.getSiblingIndex();
        let mesh = this.getComponentInChildren(MeshRenderer);
        mesh.sharedMaterials = [room.mat.mats[index]];
    }

    update(deltaTime: number) {
        // rotate node circle
        let r = quat();
        Quat.fromAxisAngle(r, v3(0, 1, 0), 0.5 * deltaTime);
        this.node.rotate(r);
    }
}


