import { director, game, pipeline } from 'cc';
import { EDITOR } from 'cc/env';

/**
 * Sửa cá skinned mất màu (chỉ còn bóng màu viền đen / vàng) trên một số điện thoại Android.
 *
 * 1. Bug driver (đã xác nhận trên Adreno 642L, WebGL1 qua ANGLE): vertex shader đọc mảng uniform theo chỉ số động
 *    (đúng kiểu skinning mặc định của engine: cc_joints[idx * 3]) sẽ KHÔNG link được nếu fragment shader có đọc varying
 *    -> pass chính của cá (và cả builtin-unlit) link lỗi, log trống; pass outline sống vì FS không đọc varying.
 *    Lúc khởi động chạy thử đúng mẫu shader đó; máy bị bug -> hạ dung lượng joint uniform xuống 1 để engine chuyển
 *    mọi skeleton sang joint texture (VS đọc ma trận xương từ texture, không còn mảng uniform). Máy bình thường giữ
 *    chế độ uniform (nhẹ hơn).
 * 2. Máy bình thường: giới hạn joint uniform còn MAX_JOINTS (cá tối đa ~21 joint) thay vì (maxVertexUniformVectors
 *    - 100) / 3 của engine - bớt hàng trăm vec4 uniform ở VS, an toàn hơn với GPU giới hạn thấp.
 *
 * Phải chạy lúc load module: script project được load TRƯỚC khi pipeline dựng macro CC_JOINT_UNIFORM_CAPACITY
 * (Game: _loadProjectBundles -> _setupRenderPipeline). Bỏ qua trong Editor vì pipeline Editor đã dựng xong.
 */
const MAX_JOINTS = 32;

const TEST_VS = `precision highp float;
attribute vec3 a_position;
attribute vec4 a_joints;
attribute vec2 a_texCoord;
uniform highp vec4 cc_joints[96];
varying vec2 v_uv;
void main() {
  int idx = int(a_joints.x) * 3;
  vec4 r = cc_joints[idx];
  v_uv = a_texCoord;
  gl_Position = vec4(a_position + r.xyz, 1.0);
}`;
const TEST_FS = `precision mediump float;
varying vec2 v_uv;
void main() { gl_FragColor = vec4(v_uv, 0.0, 1.0); }`;

/** true nếu driver không link được shader skinning kiểu uniform (bug ở trên). Không phải WebGL / lỗi khác -> false. */
function hasUniformSkinningBug(): boolean {
    try {
        const canvas: any = game.canvas;
        const gl: any = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
        if (!gl || !gl.createShader) return false;
        const mk = (type: number, src: string) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            return s;
        };
        const vs = mk(gl.VERTEX_SHADER, TEST_VS);
        const fs = mk(gl.FRAGMENT_SHADER, TEST_FS);
        const compiled = gl.getShaderParameter(vs, gl.COMPILE_STATUS) && gl.getShaderParameter(fs, gl.COMPILE_STATUS);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        const linked = gl.getProgramParameter(prog, gl.LINK_STATUS);
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return !!compiled && !linked;
    } catch (e) {
        return false;
    }
}

(function fixSkinning() {
    if (EDITOR) return;
    const U: any = (pipeline as any).UBOSkinning;
    const layout: any = (pipeline as any).localDescriptorSetLayout;
    if (!U || !layout || typeof U.initLayout !== 'function') return;
    const before = U.JOINT_UNIFORM_CAPACITY;
    // ?forceJointTex trên URL: ép chế độ joint texture để kiểm tra trên máy không bị bug.
    const force = typeof location !== 'undefined' && /forceJointTex/i.test(location.search);
    const bug = force || hasUniformSkinningBug();
    // Máy lỗi: dung lượng 1 -> skeleton nào có > 1 joint cũng dùng joint texture (SkinningModel._realTimeTextureMode).
    const target = bug ? 1 : Math.min(before, MAX_JOINTS);
    if (target !== before) {
        U.initLayout(target);
        layout.layouts[U.NAME] = U.LAYOUT;
        layout.bindings[U.BINDING] = U.DESCRIPTOR;
    }
    const caps: any = director.root?.device?.capabilities;
    console.log(`[SkinningFix] uniformSkinningBug=${bug} -> ${bug ? 'joint texture' : 'joint uniform'} | capacity ${before} -> ${U.JOINT_UNIFORM_CAPACITY}` +
        (caps ? ` | maxVertexUniformVectors=${caps.maxVertexUniformVectors} maxVertexTextureUnits=${caps.maxVertexTextureUnits}` : ''));
})();
