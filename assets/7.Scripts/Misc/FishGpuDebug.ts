import { director, Director, Material, MeshRenderer, pipeline, Texture2D } from 'cc';
import { EDITOR } from 'cc/env';
import { room } from '../Gameplay/Room';
import { Thing } from '../Gameplay/Thing';

/**
 * Chẩn đoán cá đen trên một số điện thoại Android - chỉ chạy khi URL có "?fishtest" (không ảnh hưởng game thường).
 * 1. In thông tin GPU / shader / texture của cá ra console.
 * 2. Mỗi loại cá trong màn dùng 1 biến thể material để so sánh trên máy lỗi:
 *    V0 giữ nguyên | V1 tắt USE_ALPHA_TEST | V2 tắt USE_OUTLINE_PASS | V3 shader builtin-unlit + texture.
 *    Nhìn loại cá nào hiện đúng màu là biết nguyên nhân.
 */
const ENABLED = !EDITOR && typeof location !== 'undefined' && /fishtest/i.test(location.search);

function log(msg: string) {
    console.log('[FishTest] ' + msg);
}

function gpuInfo(): string {
    try {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        const gl: any = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
        if (!gl) return 'no gl';
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        const isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
        const depthBits = gl.getParameter(gl.DEPTH_BITS);
        const fsHigh = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        return `${isGL2 ? 'WebGL2' : 'WebGL1'} | ${renderer} | depthBits=${depthBits} | fsHighp=${fsHigh ? fsHigh.precision : 0}`;
    } catch (e) {
        return 'gpuInfo error ' + e;
    }
}

/** Compile riêng vs / fs + link, in trạng thái, lỗi và số uniform / varying khai báo để khoanh vùng. */
function compileReport(gl: any, gpuShader: any, tag: string) {
    if (!gl || !gpuShader || !gpuShader.gpuStages) {
        log(`${tag}: no gpuStages`);
        return;
    }
    const shaders: any[] = [];
    gpuShader.gpuStages.forEach((st: any) => {
        const src: string = st.source || '';
        const isVS = /gl_Position/.test(src);
        const sh = gl.createShader(isVS ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS);
        const varyings = (src.match(/\bvarying\b|\bout\s+(?:highp|mediump|lowp)?\s*\w+\s+v_/g) || []).length;
        log(`${tag} ${isVS ? 'VS' : 'FS'} compile=${ok} len=${src.length} varyings~${varyings}` +
            (ok ? '' : ' ERR=' + String(gl.getShaderInfoLog(sh) || '').slice(0, 600)));
        shaders.push(sh);
    });
    const prog = gl.createProgram();
    shaders.forEach(s => gl.attachShader(prog, s));
    gl.linkProgram(prog);
    const ok = gl.getProgramParameter(prog, gl.LINK_STATUS);
    log(`${tag} relink=${ok}` + (ok ? '' : ' ERR=' + String(gl.getProgramInfoLog(prog) || '').slice(0, 600)));
    // Kích thước mảng joint thật trong VS + thử link lại với mảng nhỏ (30 joint = 90 vec4): link được -> tràn uniform VS.
    const vsStage = gpuShader.gpuStages.find((st: any) => /gl_Position/.test(st.source || ''));
    const jm = vsStage && vsStage.source.match(/#define\s+CC_JOINT_UNIFORM_CAPACITY\s+(\d+)/);
    const U: any = (pipeline as any).UBOSkinning;
    log(`${tag} shader CC_JOINT_UNIFORM_CAPACITY=${jm ? jm[1] : 'none'} capacityNow=${U && U.JOINT_UNIFORM_CAPACITY} macro=${((director.root as any)?.pipeline?.constantMacros || '').match(/CC_JOINT_UNIFORM_CAPACITY \d+/)}`);
    if (!ok && jm) {
        const small = vsStage.source.replace(/#define\s+CC_JOINT_UNIFORM_CAPACITY\s+\d+/, '#define CC_JOINT_UNIFORM_CAPACITY 24');
        const vs2 = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs2, small);
        gl.compileShader(vs2);
        const fsStage = gpuShader.gpuStages.find((st: any) => !/gl_Position/.test(st.source || ''));
        const fs2 = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs2, fsStage.source);
        gl.compileShader(fs2);
        const p2 = gl.createProgram();
        gl.attachShader(p2, vs2);
        gl.attachShader(p2, fs2);
        gl.linkProgram(p2);
        log(`${tag} relink with CAPACITY 24: ${gl.getProgramParameter(p2, gl.LINK_STATUS)}`);
        gl.deleteProgram(p2);
        gl.deleteShader(vs2);
        gl.deleteShader(fs2);
    }
    if (!ok && vsStage) bisect(gl, vsStage.source, gpuShader.gpuStages.find((st: any) => !/gl_Position/.test(st.source || '')).source, tag);
    log(`limits maxVaryingVectors=${gl.getParameter(gl.MAX_VARYING_VECTORS)} maxVertexAttribs=${gl.getParameter(gl.MAX_VERTEX_ATTRIBS)} ` +
        `maxFSTex=${gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)} maxCombinedTex=${gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)}`);
    gl.deleteProgram(prog);
    shaders.forEach(s => gl.deleteShader(s));
}

// Shader tổng hợp mô phỏng skinning kiểu uniform (đọc mảng uniform theo chỉ số động) + 1 varying cho FS đọc.
const SYN_VS = `precision highp float;
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
const SYN_FS = `precision mediump float;
varying vec2 v_uv;
void main() { gl_FragColor = vec4(v_uv, 0.0, 1.0); }`;

function tryLink(gl: any, vsSrc: string, fsSrc: string): string {
    const mk = (type: number, src: string) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
    };
    const vs = mk(gl.VERTEX_SHADER, vsSrc);
    const fs = mk(gl.FRAGMENT_SHADER, fsSrc);
    const vsOk = gl.getShaderParameter(vs, gl.COMPILE_STATUS);
    const fsOk = gl.getShaderParameter(fs, gl.COMPILE_STATUS);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    const ok = gl.getProgramParameter(p, gl.LINK_STATUS);
    const info = ok ? '' : String(gl.getProgramInfoLog(p) || '').slice(0, 200);
    gl.deleteProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return !vsOk ? 'VScompileFAIL' : !fsOk ? 'FScompileFAIL' : ok ? 'OK' : 'FAIL ' + info;
}

/** Chia đôi nguyên nhân link lỗi: mỗi thử nghiệm đổi 1 phần shader rồi link lại. */
function bisect(gl: any, vs: string, fs: string, tag: string) {
    const fsHead = 'precision mediump float;\n';
    const setDef = (src: string, name: string, val: string) => src.replace(new RegExp('#define\\s+' + name + '\\s+\\S+'), `#define ${name} ${val}`);
    const tests: [string, string, string][] = [
        ['FS trivial (khong varying)', vs, fsHead + 'void main(){ gl_FragColor = vec4(1.0); }'],
        ['FS chi doc v_uv', vs, fsHead + 'varying vec2 v_uv;\nvoid main(){ gl_FragColor = vec4(v_uv, 0.0, 1.0); }'],
        ['FS texture, uv co dinh', vs, fsHead + 'uniform sampler2D tex;\nvoid main(){ gl_FragColor = texture2D(tex, vec2(0.5)); }'],
        ['FS texture theo v_uv', vs, fsHead + 'varying vec2 v_uv;\nuniform sampler2D tex;\nvoid main(){ gl_FragColor = texture2D(tex, v_uv); }'],
        ['tat skinning (goc)', setDef(vs, 'CC_USE_SKINNING', '0'), setDef(fs, 'CC_USE_SKINNING', '0')],
        ['bo texture 2 stage', setDef(setDef(vs, 'USE_TEXTURE', '0'), 'USE_ALBEDO_MAP', '0'), setDef(setDef(fs, 'USE_TEXTURE', '0'), 'USE_ALBEDO_MAP', '0')],
        ['tat receive shadow', setDef(vs, 'CC_RECEIVE_SHADOW', '0'), setDef(fs, 'CC_RECEIVE_SHADOW', '0')],
        ['highp -> mediump trong FS', vs, fs.replace(/precision highp float;/g, 'precision mediump float;')],
        ['skinning bang joint texture', setDef(vs, 'CC_USE_REAL_TIME_JOINT_TEXTURE', '1'), setDef(fs, 'CC_USE_REAL_TIME_JOINT_TEXTURE', '1')],
        ['synthetic uniform array dong + varying', SYN_VS, SYN_FS],
        ['synthetic nhung index hang so', SYN_VS.replace('int(a_joints.x) * 3', '3'), SYN_FS],
    ];
    tests.forEach(([name, v, f]) => log(`${tag} test [${name}]: ${tryLink(gl, v, f)}`));
}

function variantMaterial(src: Material, v: number): Material {
    if (v === 0) return src;
    const defines: any = { ...(src.passes[0].defines) };
    if (v === 1) defines.USE_ALPHA_TEST = false;
    if (v === 2) defines.USE_OUTLINE_PASS = false;
    if (v === 1 || v === 2) {
        const m = new Material();
        m.copy(src, { defines });
        return m;
    }
    // V3: shader đơn giản nhất của engine, chỉ texture, không lighting / không outline.
    const m = new Material();
    m.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
    const tex = src.getProperty('mainTexture') as Texture2D;
    if (tex) m.setProperty('mainTexture', tex);
    return m;
}

function applyTo(thing: Thing, mat: Material) {
    thing.getComponentsInChildren(MeshRenderer).forEach(mr => {
        mr.sharedMaterials.forEach((m, i) => m && mr.setSharedMaterial(mat, i));
    });
}

function run() {
    if (!room || !room.mat) return;
    log('GPU ' + gpuInfo());
    const dev: any = director.root?.device;
    if (dev) log(`gfxAPI=${dev.gfxAPI} maxVU=${dev.capabilities.maxVertexUniformVectors} maxFU=${dev.capabilities.maxFragmentUniformVectors}`);

    const bubbleThings = room.things.filter(t => t.bubble);
    const sample = bubbleThings[0];
    if (sample) {
        const mr = sample.getComponentInChildren(MeshRenderer) as any;
        const model = mr && mr.model;
        const pass = mr && mr.getRenderMaterial(0)?.passes[0];
        const d = pass ? pass.defines : {};
        log(`sample type=${sample.thingType} model=${model && model.constructor.name} realtimeTex=${model && model._realTimeTextureMode} ` +
            `alphaTest=${d.USE_ALPHA_TEST} outline=${d.USE_OUTLINE_PASS} fixedLight=${d.FIXED_LIGHTING} hdr=${d.CC_USE_HDR}`);
        const tex = room.mat.mats[sample.thingType]?.getProperty('mainTexture') as Texture2D;
        log(`texture ${tex ? tex.width + 'x' + tex.height + ' fmt=' + tex.getPixelFormat() + ' gpu=' + !!tex.getGFXTexture() : 'none'}`);
        try {
            const canvas = document.querySelector('canvas') as HTMLCanvasElement;
            const gl: any = canvas.getContext('webgl2') || canvas.getContext('webgl');
            const sm = model.subModels[0];
            sm.passes.forEach((p: any, i: number) => {
                const prog = sm.shaders[i]?.gpuShader?.glProgram;
                if (!prog) return;
                const ok = gl.getProgramParameter(prog, gl.LINK_STATUS);
                log(`pass${i} phase=${p.phase} link=${ok}` + (ok ? '' : ' log=' + gl.getProgramInfoLog(prog)));
            });
            // Biên dịch lại từng stage của pass chính để lấy lỗi cụ thể của driver (log link thường trống).
            compileReport(gl, sm.shaders[0]?.gpuShader, 'pass0');
        } catch (e) {
            log('link check error ' + e);
        }
    }

    const types = [...new Set(bubbleThings.map(t => t.thingType))];
    const names = ['V0 giu nguyen', 'V1 tat alpha test', 'V2 tat outline pass', 'V3 unlit texture'];
    types.forEach((type, k) => {
        const v = k % 4;
        const src = room.mat.mats[type];
        if (!src) return;
        const mat = variantMaterial(src, v);
        room.things.filter(t => t.thingType === type).forEach(t => applyTo(t, mat));
        room.slots.forEach(s => s.avatar && s.thingType === type && applyTo(s.avatar.getComponent(Thing), mat));
        log(`type ${type} (${room.fish.children[type]?.name}) -> ${names[v]}`);
    });

    // Sau 1 frame (shader biến thể đã được tạo): link của từng biến thể trên 1 con đại diện.
    setTimeout(() => {
        try {
            const canvas = document.querySelector('canvas') as HTMLCanvasElement;
            const gl: any = canvas.getContext('webgl2') || canvas.getContext('webgl');
            types.forEach((type, k) => {
                const t = room.things.find(x => x.thingType === type && x.bubble);
                const mr: any = t && t.getComponentInChildren(MeshRenderer);
                const sm = mr && mr.model && mr.model.subModels[0];
                if (!sm) return;
                const st = sm.passes.map((p: any, i: number) => {
                    const prog = sm.shaders[i]?.gpuShader?.glProgram;
                    return prog ? `p${i}:${gl.getProgramParameter(prog, gl.LINK_STATUS) ? 'ok' : 'FAIL'}` : `p${i}:-`;
                }).join(' ');
                log(`V${k % 4} type ${type}: ${st}`);
                if (k % 4 === 3) compileReport(gl, sm.shaders[0]?.gpuShader, 'unlit');
            });
        } catch (e) {
            log('variant check error ' + e);
        }
    }, 500);
}

if (ENABLED) {
    director.once(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
        setTimeout(run, 2500);
    });
}
