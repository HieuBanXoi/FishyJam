/**
 * Dung lai 1 cc.Mesh (Cocos Creator 3.x) thanh file .glb (glTF Binary).
 *
 * Cung mot co che da dung trong CocosInspectorCustom (extension Chrome doc
 * mesh cua game dang chay trong trinh duyet) - chi khac nguon lay du lieu:
 *   - Ben do: doc truc tiep tu `window.cc` cua trang dang mo.
 *   - Ben nay (editor extension): KHONG the tu doan dinh dang file .json/.bin
 *     ma Cocos serialize trong thu muc `library/` (co the la JSON thuong hoac
 *     dinh dang nen rieng CCON tuy ban engine) - nen thay vi tu parse, ta nho
 *     scene script (`contributions/scene.ts`) load asset qua chinh
 *     `cc.assetManager` DANG CHAY trong Scene cua Editor, roi lay lai dung
 *     ket qua da giai ma xong: `mesh.struct` (object thuan) + `mesh.data`
 *     (buffer tho) + bang tra cuu format (`cc.gfx.FormatInfos`...). Ham o
 *     day chi lo phan con lai: GHI thanh container .glb hop le.
 *
 * Gioi han co y (giu code don gian & luon ra file .glb HOP LE thay vi co
 * gang bam sat 100% nhung de sai):
 *   - Bo qua vertex thuoc "stream" phu (stream != 0) - hiem gap.
 *   - Bo qua khop xuong (a_joints/a_weights) - khong dung lai duoc skeleton/
 *     bones nen giu 2 thuoc tinh nay se vo nghia (mesh xuat ra la bind-pose
 *     tinh, khong theo animation).
 *   - Khong xuat material/texture vao trong .glb (texture nhung fbx nao co
 *     duoc trich xuat rieng thanh file anh o ben ngoai, xem extract.ts).
 */

export interface MeshFormatTables {
    /** cc.gfx.FormatInfos - mang/obj tra format-so -> {name,size,count,type}. */
    formatInfos: Record<number, { size: number; count: number; type: number }>;
    /** cc.gfx.FormatType - enum so -> ten ('FLOAT','UNORM','SNORM','UINT','INT'...). */
    formatTypeNames: Record<number, string>;
    /** cc.gfx.PrimitiveMode - enum so -> ten ('TRIANGLE_LIST'...). */
    primitiveModeNames: Record<number, string>;
}

export interface MeshExportResult {
    glb: Buffer;
    warnings: string[];
}

const COMPONENT_TYPE = {
    BYTE: 5120,
    UNSIGNED_BYTE: 5121,
    SHORT: 5122,
    UNSIGNED_SHORT: 5123,
    UNSIGNED_INT: 5125,
    FLOAT: 5126,
} as const;

const TYPE_BY_COUNT: Record<number, string> = { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' };

const PRIMITIVE_MODE_MAP: Record<string, number> = {
    POINT_LIST: 0,
    LINE_LIST: 1,
    LINE_LOOP: 2,
    LINE_STRIP: 3,
    TRIANGLE_LIST: 4,
    TRIANGLE_STRIP: 5,
    TRIANGLE_FAN: 6,
};

function halfToFloat(h: number): number {
    const s = (h & 0x8000) >> 15;
    const e = (h & 0x7c00) >> 10;
    const f = h & 0x03ff;
    if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
    if (e === 0x1f) return f ? NaN : (s ? -1 : 1) * Infinity;
    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

/** Doc 1 thanh phan so (1 kenh mau/toa do) tu buffer theo format goc, tra ve gia tri da "giai chuan hoa" (UNORM/SNORM -> float 0..1 / -1..1). */
function readComponent(dv: DataView, byteOffset: number, bytesPerComp: number, typeName: string): number {
    switch (bytesPerComp) {
        case 1:
            if (typeName === 'SNORM') return Math.max(dv.getInt8(byteOffset) / 127, -1);
            if (typeName === 'UINT') return dv.getUint8(byteOffset);
            if (typeName === 'INT') return dv.getInt8(byteOffset);
            return dv.getUint8(byteOffset) / 255;
        case 2:
            if (typeName === 'FLOAT' || typeName === 'UFLOAT') return halfToFloat(dv.getUint16(byteOffset, true));
            if (typeName === 'SNORM') return Math.max(dv.getInt16(byteOffset, true) / 32767, -1);
            if (typeName === 'UINT') return dv.getUint16(byteOffset, true);
            if (typeName === 'INT') return dv.getInt16(byteOffset, true);
            return dv.getUint16(byteOffset, true) / 65535;
        case 4:
            if (typeName === 'FLOAT' || typeName === 'UFLOAT') return dv.getFloat32(byteOffset, true);
            if (typeName === 'SNORM') return Math.max(dv.getInt32(byteOffset, true) / 2147483647, -1);
            if (typeName === 'UINT') return dv.getUint32(byteOffset, true);
            if (typeName === 'INT') return dv.getInt32(byteOffset, true);
            return dv.getUint32(byteOffset, true) / 4294967295;
        default:
            return 0;
    }
}

/** Map ten thuoc tinh Cocos (a_position, a_texCoord1...) sang semantic glTF + so thu tu set (TEXCOORD_0, TEXCOORD_1...). null = khong map duoc (bo qua). */
function attrSemantic(name: string): { semantic: string; setIndex: number } | null {
    if (name === 'a_position') return { semantic: 'POSITION', setIndex: -1 };
    if (name === 'a_normal') return { semantic: 'NORMAL', setIndex: -1 };
    if (name === 'a_tangent') return { semantic: 'TANGENT', setIndex: -1 };
    let m = /^a_texCoord(\d*)$/.exec(name);
    if (m) return { semantic: 'TEXCOORD', setIndex: m[1] ? Number(m[1]) : 0 };
    m = /^a_color(\d*)$/.exec(name);
    if (m) return { semantic: 'COLOR', setIndex: m[1] ? Number(m[1]) : 0 };
    // a_joints/a_weights: co nhan dien nhung KHONG dung (xem gioi han o dau file).
    return null;
}

/** Ep 1 mang float ve dung so kenh glTF yeu cau (vd TEXCOORD phai la VEC2, TANGENT phai la VEC4). */
function coerceComponents(data: Float32Array, count: number, current: number, target: number, fillValue = 0): Float32Array {
    if (current === target) return data;
    const out = new Float32Array(count * target);
    for (let i = 0; i < count; i++) {
        for (let c = 0; c < target; c++) {
            out[i * target + c] = c < current ? data[i * current + c] : fillValue;
        }
    }
    return out;
}

/** Gom nhieu mang nho lai thanh 1 buffer lien tuc, tu dong dem (pad) ve boi so 4 byte cho tung phan - dieu kien de accessor FLOAT/UINT luon align dung. */
class BinWriter {
    private chunks: Buffer[] = [];
    length = 0;

    push(view: { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }): { byteOffset: number; byteLength: number } {
        const bytes = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
        const byteOffset = this.length;
        this.chunks.push(bytes);
        this.length += bytes.byteLength;
        const pad = (4 - (this.length % 4)) % 4;
        if (pad > 0) {
            this.chunks.push(Buffer.alloc(pad));
            this.length += pad;
        }
        return { byteOffset, byteLength: bytes.byteLength };
    }

    build(): Buffer {
        return Buffer.concat(this.chunks, this.length);
    }
}

/** Dong goi 1 doc JSON glTF + 1 buffer nhi phan thanh dung dinh dang container .glb (2 chunk JSON + BIN, theo spec glTF 2.0). */
function toGlb(json: unknown, bin: Buffer): Buffer {
    let jsonBytes = Buffer.from(JSON.stringify(json), 'utf-8');
    const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
    if (jsonPad > 0) {
        jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
    }
    const binPad = (4 - (bin.length % 4)) % 4;
    const binBytes = binPad > 0 ? Buffer.concat([bin, Buffer.alloc(binPad, 0)]) : bin;

    const totalLength = 12 + (8 + jsonBytes.length) + (8 + binBytes.length);
    const out = Buffer.alloc(totalLength);
    let o = 0;
    out.writeUInt32LE(0x46546c67, o); o += 4; // magic 'glTF'
    out.writeUInt32LE(2, o); o += 4; // version
    out.writeUInt32LE(totalLength, o); o += 4;

    out.writeUInt32LE(jsonBytes.length, o); o += 4;
    out.writeUInt32LE(0x4e4f534a, o); o += 4; // 'JSON'
    jsonBytes.copy(out, o); o += jsonBytes.length;

    out.writeUInt32LE(binBytes.length, o); o += 4;
    out.writeUInt32LE(0x004e4942, o); o += 4; // 'BIN\0'
    binBytes.copy(out, o);

    return out;
}

interface DecodedAttr {
    data: Float32Array;
    numComponents: number;
}

/**
 * @param struct   `mesh.struct` (JSON.parse(JSON.stringify(...)) tu scene script - object thuan).
 * @param rawBuffer `mesh.data` (buffer tho, cung layout byte voi `struct` mo ta).
 * @param tables   Bang tra format/primitive-mode doc song tu `cc.gfx` (xem `contributions/scene.ts`).
 * @param name     Ten dat cho node/mesh trong file .glb (chi de hien thi, khong anh huong du lieu).
 */
export function buildMeshGlb(struct: any, rawBuffer: Buffer, tables: MeshFormatTables, name: string): MeshExportResult {
    if (!struct || !Array.isArray(struct.vertexBundles) || !Array.isArray(struct.primitives)) {
        throw new Error('mesh.struct rỗng hoặc không hợp lệ.');
    }
    const { formatInfos, formatTypeNames, primitiveModeNames } = tables;
    if (!formatInfos) {
        throw new Error('Không có bảng cc.gfx.FormatInfos (scene script chưa trả về hoặc bản engine không hỗ trợ).');
    }

    const warnings: string[] = [];
    const dv = new DataView(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength);
    let skippedJointsWeights = false;

    // -- buoc 1: giai ma tung vertex bundle thanh cac Float32Array theo tung thuoc tinh (POSITION, NORMAL...) --
    const decodedBundles: Array<{ count: number; attrs: Map<string, DecodedAttr> }> = struct.vertexBundles.map(
        (bundle: any, bundleIndex: number) => {
            const view = bundle.view || {};
            const count: number = view.count ?? 0;
            const stride: number = view.stride ?? 0;
            const baseOffset: number = view.offset ?? 0;
            const attrs = new Map<string, DecodedAttr>();
            let runningOffset = 0;

            for (const attr of bundle.attributes || []) {
                const info = formatInfos[attr.format];
                if (!info) {
                    warnings.push(`Bundle #${bundleIndex}: bỏ qua thuộc tính "${attr.name}" (format ${attr.format} không rõ).`);
                    continue;
                }
                const size: number = info.size;
                const stream = attr.stream || 0;
                if (stream !== 0) {
                    warnings.push(`Bundle #${bundleIndex}: bỏ qua thuộc tính "${attr.name}" (nằm ở stream phụ #${stream}, chưa hỗ trợ).`);
                    runningOffset += size;
                    continue;
                }
                const attrByteOffset = runningOffset;
                runningOffset += size;

                const sem = attrSemantic(attr.name);
                if (!sem) {
                    if (attr.name === 'a_joints' || attr.name === 'a_weights') skippedJointsWeights = true;
                    continue;
                }

                const numComponents: number = info.count;
                const bytesPerComponent = size / numComponents;
                const typeName = (formatTypeNames && formatTypeNames[info.type]) || 'UNORM';
                const out = new Float32Array(count * numComponents);

                for (let v = 0; v < count; v++) {
                    const vertexByteOffset = baseOffset + v * stride + attrByteOffset;
                    for (let c = 0; c < numComponents; c++) {
                        out[v * numComponents + c] = readComponent(dv, vertexByteOffset + c * bytesPerComponent, bytesPerComponent, typeName);
                    }
                }

                const key = sem.setIndex >= 0 ? `${sem.semantic}_${sem.setIndex}` : sem.semantic;
                attrs.set(key, { data: out, numComponents });
            }
            return { count, attrs };
        }
    );

    if (skippedJointsWeights) {
        warnings.push('Bỏ qua khớp xương (a_joints/a_weights) — công cụ chưa dựng lại được skeleton, mesh xuất ra là dáng tĩnh (bind pose).');
    }

    // -- buoc 2: gom submesh (primitive) tu cac bundle no tham chieu toi + doc index buffer --
    interface BuiltPrimitive {
        attrs: Record<string, DecodedAttr>;
        indices: { values: ArrayLike<number>; componentType: number } | null;
        mode: number;
    }
    const builtPrimitives: BuiltPrimitive[] = [];

    struct.primitives.forEach((sub: any, subIndex: number) => {
        const bundleIdxs: number[] = sub.vertexBundelIndices || sub.vertexBundleIndices || [];
        const mergedAttrs: Record<string, DecodedAttr> = {};
        for (const bi of bundleIdxs) {
            const decoded = decodedBundles[bi];
            if (!decoded) continue;
            decoded.attrs.forEach((val, key) => (mergedAttrs[key] = val));
        }
        if (!mergedAttrs.POSITION) {
            warnings.push(`Submesh #${subIndex}: không có POSITION hợp lệ, bỏ qua.`);
            return;
        }

        let indices: BuiltPrimitive['indices'] = null;
        if (sub.indexView) {
            const iv = sub.indexView;
            const stride: number = iv.stride || 2;
            const count: number = iv.count ?? Math.floor(iv.length / stride);
            const values = new Array<number>(count);
            for (let i = 0; i < count; i++) {
                const o = iv.offset + i * stride;
                values[i] = stride === 1 ? dv.getUint8(o) : stride === 4 ? dv.getUint32(o, true) : dv.getUint16(o, true);
            }
            const componentType =
                stride === 1 ? COMPONENT_TYPE.UNSIGNED_BYTE : stride === 4 ? COMPONENT_TYPE.UNSIGNED_INT : COMPONENT_TYPE.UNSIGNED_SHORT;
            indices = { values, componentType };
        }

        const modeName = (primitiveModeNames && primitiveModeNames[sub.primitiveMode]) || 'TRIANGLE_LIST';
        let mode = PRIMITIVE_MODE_MAP[modeName];
        if (mode === undefined) {
            warnings.push(`Submesh #${subIndex}: primitive mode "${modeName}" chưa hỗ trợ, xuất tạm như TRIANGLE_LIST.`);
            mode = PRIMITIVE_MODE_MAP.TRIANGLE_LIST;
        }

        builtPrimitives.push({ attrs: mergedAttrs, indices, mode });
    });

    if (builtPrimitives.length === 0) {
        throw new Error('Không dựng được submesh nào có POSITION hợp lệ (dữ liệu mesh rỗng hoặc không đọc được).');
    }

    // -- buoc 3: ghi tat ca xuong 1 buffer nhi phan + mo ta glTF (bufferView/accessor/primitive) --
    const bin = new BinWriter();
    const bufferViews: any[] = [];
    const accessors: any[] = [];

    function addAccessor(data: Float32Array | Uint8Array | Uint16Array | Uint32Array, componentType: number, numComponents: number, target: number, withMinMax: boolean): number {
        const { byteOffset, byteLength } = bin.push(data);
        bufferViews.push({ buffer: 0, byteOffset, byteLength, target });
        const count = data.length / numComponents;
        const accessor: any = { bufferView: bufferViews.length - 1, componentType, count, type: TYPE_BY_COUNT[numComponents] || 'SCALAR' };
        if (withMinMax && data instanceof Float32Array) {
            const min = new Array(numComponents).fill(Infinity);
            const max = new Array(numComponents).fill(-Infinity);
            for (let i = 0; i < count; i++) {
                for (let c = 0; c < numComponents; c++) {
                    const v = data[i * numComponents + c];
                    if (v < min[c]) min[c] = v;
                    if (v > max[c]) max[c] = v;
                }
            }
            accessor.min = min;
            accessor.max = max;
        }
        accessors.push(accessor);
        return accessors.length - 1;
    }

    const TARGET_ARRAY_BUFFER = 34962;
    const TARGET_ELEMENT_ARRAY_BUFFER = 34963;

    const gltfPrimitives = builtPrimitives.map((prim) => {
        const gltfAttrs: Record<string, number> = {};
        for (const [key, attr] of Object.entries(prim.attrs)) {
            const vertexCount = attr.data.length / attr.numComponents;
            // glTF quy dinh cung so kenh cho tung semantic (POSITION/NORMAL=VEC3,
            // TANGENT=VEC4, TEXCOORD_n=VEC2) - ep ve dung so do, du Cocos co the
            // luu it/nhieu kenh hon (vd tangent thieu w, hoac uv 3 kenh hiem gap).
            const targetComponents = key === 'TANGENT' ? 4 : key.startsWith('TEXCOORD') ? 2 : key === 'POSITION' || key === 'NORMAL' ? 3 : attr.numComponents;
            const fillValue = key === 'TANGENT' ? 1 : 0;
            const data = coerceComponents(attr.data, vertexCount, attr.numComponents, targetComponents, fillValue);
            gltfAttrs[key] = addAccessor(data, COMPONENT_TYPE.FLOAT, targetComponents, TARGET_ARRAY_BUFFER, key === 'POSITION');
        }

        let indicesIdx: number | undefined;
        if (prim.indices) {
            const { values, componentType } = prim.indices;
            const typed =
                componentType === COMPONENT_TYPE.UNSIGNED_BYTE
                    ? Uint8Array.from(values)
                    : componentType === COMPONENT_TYPE.UNSIGNED_INT
                        ? Uint32Array.from(values)
                        : Uint16Array.from(values);
            indicesIdx = addAccessor(typed, componentType, 1, TARGET_ELEMENT_ARRAY_BUFFER, false);
        }

        return { attributes: gltfAttrs, indices: indicesIdx, mode: prim.mode };
    });

    const binBytes = bin.build();

    const gltf = {
        asset: { version: '2.0', generator: 'glb-extractor (Cocos Creator editor extension)' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0, name }],
        meshes: [{ name, primitives: gltfPrimitives }],
        buffers: [{ byteLength: binBytes.length }],
        bufferViews,
        accessors,
    };

    return { glb: toGlb(gltf, binBytes), warnings };
}
