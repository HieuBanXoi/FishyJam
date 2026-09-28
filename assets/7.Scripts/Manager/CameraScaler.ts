import { _decorator, Camera, Component, Enum, screen, Vec2, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

export enum CameraScalerWorkingMode {
  ConstantHeight = 0,
  ConstantWidth = 1,
  MatchWidthOrHeight = 2,
  Expand = 3,
  Shrink = 4,
}

Enum(CameraScalerWorkingMode);

@ccclass('CameraScaler')
export class CameraScaler extends Component {
  @property(Vec2) referenceResolution: Vec2 = new Vec2(720, 1280);
  @property({ type: CameraScalerWorkingMode }) mode: CameraScalerWorkingMode = CameraScalerWorkingMode.ConstantWidth;
  @property matchWidthOrHeight = 0.5;

  @property(Vec3) offsetPosLandscape: Vec3 = new Vec3(0, 1, 0);
  @property() mulCamSizeLandScape: number = 1;

  @property([Camera]) private componentCameras: Camera[] = [];
  private targetAspect = 1;
  private cameraZoom = 1;
  private initialSize = 1;
  private initialFov = 45;
  private initialPosition: Vec3 = new Vec3();
  private horizontalFov = 45;
  private previousUpdateAspect = 0;
  private previousUpdateMode: CameraScalerWorkingMode = null;
  private previousUpdateMatch = -1;
  private previousUpdateZoom = -1;
  private previousUpdateLandscapeMul = -1;
  private previousUpdateIsLandscape = false;
  private previousUpdateOffsetLandscape: Vec3 = new Vec3();
  private resizeAspect = 0;
  private initialized = false;

  public get horizontalSize(): number { return this.initialSize * this.targetAspect; }
  public get HorizontalSize(): number { return this.horizontalSize; }
  public get HorizontalFov(): number { return this.horizontalFov; }
  public get CameraZoom(): number { return this.cameraZoom; }
  public set CameraZoom(value: number) {
    this.cameraZoom = Math.max(0.0001, value);
    this.updateCamera();
  }

  protected onLoad(): void {
    this.resize();
  }

  protected update(): void {
    if (!this.ensureInitialized()) return;

    const aspect = this.getCurrentAspect();
    const isLandscape = this.isLandscape();
    if (
      !this.approximately(this.previousUpdateAspect, aspect) ||
      this.previousUpdateMode !== this.mode ||
      !this.approximately(this.previousUpdateMatch, this.matchWidthOrHeight) ||
      !this.approximately(this.previousUpdateZoom, this.cameraZoom) ||
      !this.approximately(this.previousUpdateLandscapeMul, this.mulCamSizeLandScape) ||
      this.previousUpdateIsLandscape !== isLandscape ||
      !this.approximatelyVec3(this.previousUpdateOffsetLandscape, this.offsetPosLandscape)
    ) {
      this.updateCamera();
      this.saveUpdateState(aspect, isLandscape);
    }
  }

  public resize(aspect: number = 0): void {
    if (!this.ensureInitialized()) return;

    this.resizeAspect = aspect;
    this.updateCamera();
    this.saveUpdateState(this.getCurrentAspect(), this.isLandscape());
  }

  private updateCamera(): void {
    if (!this.ensureInitialized()) return;
    this.updatePosition();
    const isOrtho = this.isOrthographicCamera(this.componentCameras[0]);
    if (isOrtho) this.updateOrtho();
    else this.updatePerspective();
    this.applyLandscapeCameraSize(isOrtho);
  }

  private ensureInitialized(): boolean {
    if (this.initialized) return true;
    if (this.componentCameras.length === 0) {
      const camera = this.getComponent(Camera);
      if (camera) this.componentCameras.push(camera);
    }
    if (this.componentCameras.length === 0) return false;

    this.initialSize = this.componentCameras[0].orthoHeight;
    this.targetAspect = this.referenceResolution.x / this.referenceResolution.y;
    this.initialFov = this.componentCameras[0].fov;
    this.initialPosition.set(this.node.position);
    this.horizontalFov = CameraScaler.calcVerticalFov(this.initialFov, 1 / this.targetAspect);
    this.initialized = true;
    return true;
  }

  private updateOrtho(): void {
    const zoom = Math.max(0.0001, this.cameraZoom);
    const aspect = this.getCurrentAspect();
    switch (this.mode) {
      case CameraScalerWorkingMode.ConstantHeight:
        this.applyOrtho(this.initialSize / zoom);
        break;
      case CameraScalerWorkingMode.ConstantWidth:
        this.applyOrtho(this.initialSize * (this.targetAspect / aspect) / zoom);
        break;
      case CameraScalerWorkingMode.MatchWidthOrHeight: {
        const vSize = this.initialSize;
        const hSize = this.initialSize * (this.targetAspect / aspect);
        const logWeightedAverage = this.lerp(Math.log2(hSize), Math.log2(vSize), this.matchWidthOrHeight);
        this.applyOrtho(Math.pow(2, logWeightedAverage) / zoom);
        break;
      }
      case CameraScalerWorkingMode.Expand:
        this.applyOrtho((this.targetAspect > aspect ? this.initialSize * (this.targetAspect / aspect) : this.initialSize) / zoom);
        break;
      case CameraScalerWorkingMode.Shrink:
        this.applyOrtho((this.targetAspect < aspect ? this.initialSize * (this.targetAspect / aspect) : this.initialSize) / zoom);
        break;
    }
  }

  private updatePerspective(): void {
    const zoom = Math.max(0.0001, this.cameraZoom);
    const aspect = this.getCurrentAspect();
    switch (this.mode) {
      case CameraScalerWorkingMode.ConstantHeight:
        this.applyPerspective(this.initialFov / zoom);
        break;
      case CameraScalerWorkingMode.ConstantWidth:
        this.applyPerspective(CameraScaler.calcVerticalFov(this.horizontalFov, aspect) / zoom);
        break;
      case CameraScalerWorkingMode.MatchWidthOrHeight: {
        const vFov = this.initialFov;
        const hFov = CameraScaler.calcVerticalFov(this.horizontalFov, aspect);
        const logWeightedAverage = this.lerp(Math.log2(hFov), Math.log2(vFov), this.matchWidthOrHeight);
        this.applyPerspective(Math.pow(2, logWeightedAverage) / zoom);
        break;
      }
      case CameraScalerWorkingMode.Expand:
        this.applyPerspective((this.targetAspect > aspect ? CameraScaler.calcVerticalFov(this.horizontalFov, aspect) : this.initialFov) / zoom);
        break;
      case CameraScalerWorkingMode.Shrink:
        this.applyPerspective((this.targetAspect < aspect ? CameraScaler.calcVerticalFov(this.horizontalFov, aspect) : this.initialFov) / zoom);
        break;
    }
  }

  private applyOrtho(value: number): void {
    for (let i = 0; i < this.componentCameras.length; i++) this.componentCameras[i].orthoHeight = value;
  }

  private applyPerspective(value: number): void {
    for (let i = 0; i < this.componentCameras.length; i++) this.componentCameras[i].fov = value;
  }

  private applyLandscapeCameraSize(isOrtho: boolean): void {
    const landscapeMul = this.getLandscapeMul();
    if (this.approximately(landscapeMul, 1)) return;

    for (let i = 0; i < this.componentCameras.length; i++) {
      const camera = this.componentCameras[i];
      if (isOrtho) camera.orthoHeight /= landscapeMul;
      else camera.fov *= landscapeMul;
    }
  }

  private updatePosition(): void {
    if (this.isLandscape()) {
      this.node.setPosition(
        this.initialPosition.x + this.offsetPosLandscape.x,
        this.initialPosition.y + this.offsetPosLandscape.y,
        this.initialPosition.z + this.offsetPosLandscape.z
      );
      return;
    }

    this.node.setPosition(this.initialPosition);
  }

  private getLandscapeMul(): number {
    if (!this.isLandscape()) return 1;
    return Math.max(0.0001, this.mulCamSizeLandScape);
  }

  private isLandscape(): boolean {
    return true
  }

  private isOrthographicCamera(camera: Camera): boolean {
    return (camera as Camera & { projection?: number }).projection !== 1;
  }

  private getCurrentAspect(): number {
    if (this.resizeAspect > 0) return this.resizeAspect;
    const windowSize = screen.windowSize;
    if (windowSize.height <= 0) return this.targetAspect;
    return windowSize.width / windowSize.height;
  }

  private lerp(from: number, to: number, t: number): number {
    return from + (to - from) * Math.max(0, Math.min(1, t));
  }

  private approximately(a: number, b: number): boolean {
    return Math.abs(a - b) <= 0.00001;
  }

  private approximatelyVec3(a: Vec3, b: Vec3): boolean {
    return this.approximately(a.x, b.x) && this.approximately(a.y, b.y) && this.approximately(a.z, b.z);
  }

  private saveUpdateState(aspect: number, isLandscape: boolean): void {
    this.previousUpdateAspect = aspect;
    this.previousUpdateMode = this.mode;
    this.previousUpdateMatch = this.matchWidthOrHeight;
    this.previousUpdateZoom = this.cameraZoom;
    this.previousUpdateLandscapeMul = this.mulCamSizeLandScape;
    this.previousUpdateIsLandscape = isLandscape;
    this.previousUpdateOffsetLandscape.set(this.offsetPosLandscape);
  }

  private static calcVerticalFov(hFovInDeg: number, aspectRatio: number): number {
    const hFovInRads = hFovInDeg * Math.PI / 180;
    const vFovInRads = 2 * Math.atan(Math.tan(hFovInRads / 2) / aspectRatio);
    return vFovInRads * 180 / Math.PI;
  }
}
