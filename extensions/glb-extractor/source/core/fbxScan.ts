/**
 * Quet asset-db tim file .fbx trong project + doc cac sub-asset (Mesh, anh
 * nhung theo fbx) cua tung file - dung asset-db chinh thuc cua Editor thay
 * vi tu doc thu muc assets/ bang fs (asset-db moi biet chinh xac asset nao
 * da import xong, uuid gi, va quan trong nhat la "library" - duong dan file
 * DA BIEN DICH cua tung sub-asset tren dia, thu duoc CHINH XAC boi asset-db
 * chu khong the tu doan).
 */

/** Cac duoi anh coi la "co the copy nguyen ven ra file" - Cocos giu native asset (anh nhung trong fbx) dung dinh dang goc trong library. */
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tga', '.bmp', '.gif']);

export interface FbxMeshRef {
    uuid: string;
    name: string;
}

export interface FbxTextureRef {
    uuid: string;
    name: string;
    /** Duong dan tuyet doi tren dia toi file anh da import (nguyen ven, cung dinh dang goc). */
    filePath: string;
    ext: string;
}

export interface FbxFileInfo {
    uuid: string;
    name: string;
    /** vd db://assets/models/character.fbx */
    url: string;
    /** duong dan tuyet doi toi file .fbx nguon. */
    file: string;
    meshes: FbxMeshRef[];
    textures: FbxTextureRef[];
}

/** De quy vao subAssets (thuong chi 1 cap, nhung phong khi ban importer nao do long sau hon). */
function walkSubAssets(info: any, meshes: FbxMeshRef[], textures: FbxTextureRef[]): void {
    const subAssets = info?.subAssets || {};
    for (const key in subAssets) {
        const sub = subAssets[key];
        if (!sub) continue;

        if (sub.type === 'cc.Mesh') {
            meshes.push({ uuid: sub.uuid, name: sub.name || key });
        }

        // Anh nhung trong fbx: uu tien nhan dien theo type 'cc.ImageAsset', nhung
        // van kiem tra du phong theo duoi file trong "library" (ten type co the
        // khac giua cac ban engine) - mien la co 1 file anh that su tren dia.
        const library: Record<string, string> = sub.library || {};
        let imageEntry: { ext: string; path: string } | null = null;
        for (const ext in library) {
            if (IMAGE_EXT.has(ext.toLowerCase())) {
                imageEntry = { ext, path: library[ext] };
                break;
            }
        }
        if (imageEntry && (sub.type === 'cc.ImageAsset' || sub.type === 'cc.Texture2D' || imageEntry)) {
            textures.push({ uuid: sub.uuid, name: sub.name || key, filePath: imageEntry.path, ext: imageEntry.ext });
        }

        if (sub.subAssets && Object.keys(sub.subAssets).length) {
            walkSubAssets(sub, meshes, textures);
        }
    }
}

/** Liet ke moi file .fbx da duoc asset-db import trong project (khong phan biet nam trong bundle nao). */
export async function listFbxFiles(): Promise<FbxFileInfo[]> {
    const assets: any[] = await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/**/*.fbx' });
    const result: FbxFileInfo[] = [];
    for (const asset of assets || []) {
        // query-assets tra thong tin RUT GON (khong chac co subAssets day du) - query lai
        // tung asset de chac chan lay duoc toan bo cay sub-asset (Mesh/Texture...).
        const detail: any = await Editor.Message.request('asset-db', 'query-asset-info', asset.uuid);
        if (!detail) continue;

        const meshes: FbxMeshRef[] = [];
        const textures: FbxTextureRef[] = [];
        walkSubAssets(detail, meshes, textures);

        result.push({
            uuid: detail.uuid,
            name: detail.name,
            url: detail.url,
            file: detail.file,
            meshes,
            textures,
        });
    }
    return result;
}
