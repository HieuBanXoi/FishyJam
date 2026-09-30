import { director, pipeline } from 'cc';
import { EDITOR } from 'cc/env';

/**
 * Sửa cá skinned mất mesh (chỉ còn viền outline) trên một số điện thoại Android: driver bug khi vertex shader đọc
 * mảng uniform joint theo chỉ số động (cc_joints[idx * 3], đúng kiểu skinning mặc định của engine) kết hợp fragment
 * shader phức tạp (standard-fs: PBR + shadow + fog...) khiến pass chính của cá link lỗi (pass outline sống vì FS
 * đơn giản hơn nhiều). Test thử-compile 1 shader tối giản để dò bug này bị false-negative trên thiết bị thật
 * (Adreno, maxVertexTextureUnits=16, maxVertexUniformVectors=256) - không tái hiện đúng độ phức tạp của shader
 * thật nên không phát hiện ra. Nên bỏ dò, luôn ép joint texture khi thiết bị có vertex texture unit (universal,
 * né hẳn code path index-động gây bug, chi phí hiệu năng không đáng kể với vài chục xương/con).
 *
 * Phải chạy lúc load module: script project được load TRƯỚC khi pipeline dựng macro CC_JOINT_UNIFORM_CAPACITY
 * (Game: _loadProjectBundles -> _setupRenderPipeline). Bỏ qua trong Editor vì pipeline Editor đã dựng xong.
 */
const MAX_JOINTS = 32;

(function fixSkinning() {
    if (EDITOR) return;
    const U: any = (pipeline as any).UBOSkinning;
    const layout: any = (pipeline as any).localDescriptorSetLayout;
    if (!U || !layout || typeof U.initLayout !== 'function') return;
    const before = U.JOINT_UNIFORM_CAPACITY;
    const caps: any = director.root?.device?.capabilities;
    const canUseJointTexture = !caps || caps.maxVertexTextureUnits > 0;
    // dung lượng 1 -> skeleton nào có > 1 joint cũng dùng joint texture (SkinningModel._realTimeTextureMode),
    // né hẳn mảng uniform index-động gây bug; máy không hỗ trợ texture thì đành giữ uniform, giảm capacity phòng ngừa.
    const target = canUseJointTexture ? 1 : Math.min(before, MAX_JOINTS);
    if (target !== before) {
        U.initLayout(target);
        layout.layouts[U.NAME] = U.LAYOUT;
        layout.bindings[U.BINDING] = U.DESCRIPTOR;
    }
    console.log(`[SkinningFix] ${canUseJointTexture ? 'joint texture' : 'joint uniform'} | capacity ${before} -> ${U.JOINT_UNIFORM_CAPACITY}` +
        (caps ? ` | maxVertexUniformVectors=${caps.maxVertexUniformVectors} maxVertexTextureUnits=${caps.maxVertexTextureUnits}` : ''));
})();
