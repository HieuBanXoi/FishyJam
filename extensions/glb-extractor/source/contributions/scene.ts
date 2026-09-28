/**
 * Scene script - chay TRONG tien trinh Scene cua Editor (noi engine that
 * `cc` dang load san de ve Scene view), khac voi main.ts/panel.ts chay o
 * tien trinh Editor/panel (chi co `Editor`, KHONG co `cc`).
 *
 * Duoc goi tu panel qua:
 *   Editor.Message.request('scene', 'execute-scene-script', {
 *     name: 'glb-extractor', method: 'readMesh', args: [meshUuid],
 *   });
 *
 * Ly do can vong qua day thay vi tu doc file .json/.bin trong `library/`:
 * Cocos serialize asset trong library co the la JSON thuong hoac dinh dang
 * nen CCON tuy phien ban engine - thay vi tu doan/parse (de vo tinh doc sai
 * ma khong bao loi), nho CHINH `cc.assetManager` dang chay giai ma gium, roi
 * chi lay lai KET QUA DA GIAI MA XONG (mesh.struct + mesh.data) - luon dung
 * bat ke dinh dang luu tru noi bo cua ban engine nao.
 */
/// <reference path="../../node_modules/@cocos/creator-types/engine/cc.d.ts" />
import { assetManager, gfx } from 'cc';

function loadAsset(uuid: string): Promise<any> {
    return new Promise((resolve, reject) => {
        assetManager.loadAny(uuid, (err: Error | null, asset: any) => {
            if (err) reject(err);
            else resolve(asset);
        });
    });
}

export const methods = {
    /**
     * Doc 1 cc.Mesh (qua uuid sub-asset da import cua 1 file .fbx) va tra ve
     * du lieu THUAN (JSON-serializable) de tien trinh panel dung lai thanh
     * .glb (xem core/glbBuilder.ts) - khong tra ve thang instance vi IPC
     * giua cac tien trinh Editor chi truyen duoc du lieu, khong truyen duoc
     * class instance/method.
     */
    async readMesh(uuid: string) {
        const mesh: any = await loadAsset(uuid);
        if (!mesh || !mesh.struct || !mesh.data) {
            throw new Error('Không đọc được mesh.struct/mesh.data (asset không phải Mesh hợp lệ, hoặc bản engine này không hỗ trợ).');
        }
        const g: any = gfx;
        const data: Uint8Array = mesh.data;
        return {
            name: mesh.name || '',
            struct: JSON.parse(JSON.stringify(mesh.struct)),
            // Buffer nhi phan phai di qua base64 - kenh IPC cua Editor giua cac
            // tien trinh khong dam bao truyen nguyen ArrayBuffer/TypedArray.
            dataBase64: Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64'),
            formatInfos: JSON.parse(JSON.stringify(g.FormatInfos || null)),
            formatTypeNames: JSON.parse(JSON.stringify(g.FormatType || null)),
            primitiveModeNames: JSON.parse(JSON.stringify(g.PrimitiveMode || null)),
        };
    },
};
