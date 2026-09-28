import * as fs from 'fs-extra';
import * as path from 'path';
import { PACKAGE_NAME, warn } from '../global';
import { buildMeshGlb, MeshFormatTables } from './glbBuilder';
import { FbxFileInfo } from './fbxScan';

/** Ten file/thu muc an toan tren ca Windows lan macOS - thay ky tu cam bang "_". */
export function sanitizeName(name: string): string {
    const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
    return cleaned || 'unnamed';
}

export interface ExtractProgress {
    fbxName: string;
    stage: 'mesh' | 'texture';
    itemName: string;
    ok: boolean;
    message?: string;
}

export interface ExtractSummary {
    meshOk: number;
    meshFail: number;
    textureOk: number;
    textureFail: number;
    errors: string[];
}

/**
 * Goi scene script (`contributions/scene.ts`) doc 1 Mesh sub-asset roi dung
 * thanh .glb - can 1 Scene dang mo trong Editor (scene script chay trong
 * tien trinh Scene), neu khong se nem loi ro rang de nguoi dung mo 1 scene
 * bat ky roi thu lai (khong bat buoc phai la scene chua model do).
 */
async function readMeshViaSceneScript(meshUuid: string): Promise<{ struct: any; data: Buffer; tables: MeshFormatTables; name: string }> {
    let res: any;
    try {
        res = await Editor.Message.request('scene', 'execute-scene-script', {
            name: PACKAGE_NAME,
            method: 'readMesh',
            args: [meshUuid],
        });
    } catch (err) {
        throw new Error(
            `Gọi scene script thất bại (${err instanceof Error ? err.message : String(err)}) - hãy mở 1 Scene bất kỳ trong Editor rồi thử lại.`
        );
    }
    if (!res) throw new Error('Scene script không trả về dữ liệu (mesh.struct/mesh.data rỗng).');
    return {
        struct: res.struct,
        data: Buffer.from(res.dataBase64, 'base64'),
        tables: {
            formatInfos: res.formatInfos,
            formatTypeNames: res.formatTypeNames,
            primitiveModeNames: res.primitiveModeNames,
        },
        name: res.name,
    };
}

/**
 * Trich xuat 1 file .fbx: moi Mesh sub-asset -> 1 file .glb, moi anh nhung
 * -> copy nguyen ven ra file. Best-effort - 1 mesh/texture loi khong lam
 * dung ca file .fbx dang xu ly, ghi lai o `onProgress` + `summary.errors`.
 */
export async function extractFbx(fbx: FbxFileInfo, outputDir: string, onProgress: (p: ExtractProgress) => void): Promise<ExtractSummary> {
    const summary: ExtractSummary = { meshOk: 0, meshFail: 0, textureOk: 0, textureFail: 0, errors: [] };
    const targetDir = path.join(outputDir, sanitizeName(fbx.name));
    await fs.ensureDir(targetDir);

    const usedNames = new Set<string>();
    function dedupe(base: string, ext: string): string {
        let candidate = `${base}${ext}`;
        let i = 2;
        while (usedNames.has(candidate.toLowerCase())) {
            candidate = `${base}_${i}${ext}`;
            i++;
        }
        usedNames.add(candidate.toLowerCase());
        return candidate;
    }

    for (const mesh of fbx.meshes) {
        try {
            const { struct, data, tables, name } = await readMeshViaSceneScript(mesh.uuid);
            const { glb, warnings } = buildMeshGlb(struct, data, tables, name || mesh.name);
            const fileName = dedupe(sanitizeName(mesh.name), '.glb');
            await fs.writeFile(path.join(targetDir, fileName), glb);
            summary.meshOk++;
            warnings.forEach((w) => warn(`${fbx.name}/${mesh.name}: ${w}`));
            onProgress({ fbxName: fbx.name, stage: 'mesh', itemName: mesh.name, ok: true, message: warnings.length ? `${warnings.length} lưu ý` : undefined });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            summary.meshFail++;
            summary.errors.push(`[Mesh] ${fbx.name}/${mesh.name}: ${message}`);
            onProgress({ fbxName: fbx.name, stage: 'mesh', itemName: mesh.name, ok: false, message });
        }
    }

    for (const tex of fbx.textures) {
        try {
            const fileName = dedupe(sanitizeName(tex.name), tex.ext);
            await fs.copy(tex.filePath, path.join(targetDir, fileName));
            summary.textureOk++;
            onProgress({ fbxName: fbx.name, stage: 'texture', itemName: tex.name, ok: true });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            summary.textureFail++;
            summary.errors.push(`[Texture] ${fbx.name}/${tex.name}: ${message}`);
            onProgress({ fbxName: fbx.name, stage: 'texture', itemName: tex.name, ok: false, message });
        }
    }

    return summary;
}
