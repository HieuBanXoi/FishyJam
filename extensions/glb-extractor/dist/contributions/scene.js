"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
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
const cc_1 = require("cc");
function loadAsset(uuid) {
    return new Promise((resolve, reject) => {
        cc_1.assetManager.loadAny(uuid, (err, asset) => {
            if (err)
                reject(err);
            else
                resolve(asset);
        });
    });
}
exports.methods = {
    /**
     * Doc 1 cc.Mesh (qua uuid sub-asset da import cua 1 file .fbx) va tra ve
     * du lieu THUAN (JSON-serializable) de tien trinh panel dung lai thanh
     * .glb (xem core/glbBuilder.ts) - khong tra ve thang instance vi IPC
     * giua cac tien trinh Editor chi truyen duoc du lieu, khong truyen duoc
     * class instance/method.
     */
    async readMesh(uuid) {
        const mesh = await loadAsset(uuid);
        if (!mesh || !mesh.struct || !mesh.data) {
            throw new Error('Không đọc được mesh.struct/mesh.data (asset không phải Mesh hợp lệ, hoặc bản engine này không hỗ trợ).');
        }
        const g = cc_1.gfx;
        const data = mesh.data;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zb3VyY2UvY29udHJpYnV0aW9ucy9zY2VuZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQTs7Ozs7Ozs7Ozs7Ozs7OztHQWdCRztBQUNILCtFQUErRTtBQUMvRSwyQkFBdUM7QUFFdkMsU0FBUyxTQUFTLENBQUMsSUFBWTtJQUMzQixPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQ25DLGlCQUFZLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLEdBQWlCLEVBQUUsS0FBVSxFQUFFLEVBQUU7WUFDekQsSUFBSSxHQUFHO2dCQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQzs7Z0JBQ2hCLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQztBQUVZLFFBQUEsT0FBTyxHQUFHO0lBQ25COzs7Ozs7T0FNRztJQUNILEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBWTtRQUN2QixNQUFNLElBQUksR0FBUSxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN0QyxNQUFNLElBQUksS0FBSyxDQUFDLHdHQUF3RyxDQUFDLENBQUM7UUFDOUgsQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFRLFFBQUcsQ0FBQztRQUNuQixNQUFNLElBQUksR0FBZSxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ25DLE9BQU87WUFDSCxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksSUFBSSxFQUFFO1lBQ3JCLE1BQU0sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQy9DLG9FQUFvRTtZQUNwRSxpRUFBaUU7WUFDakUsVUFBVSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDO1lBQ3pGLFdBQVcsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsQ0FBQztZQUM5RCxlQUFlLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLENBQUM7WUFDakUsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxhQUFhLElBQUksSUFBSSxDQUFDLENBQUM7U0FDMUUsQ0FBQztJQUNOLENBQUM7Q0FDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTY2VuZSBzY3JpcHQgLSBjaGF5IFRST05HIHRpZW4gdHJpbmggU2NlbmUgY3VhIEVkaXRvciAobm9pIGVuZ2luZSB0aGF0XG4gKiBgY2NgIGRhbmcgbG9hZCBzYW4gZGUgdmUgU2NlbmUgdmlldyksIGtoYWMgdm9pIG1haW4udHMvcGFuZWwudHMgY2hheSBvXG4gKiB0aWVuIHRyaW5oIEVkaXRvci9wYW5lbCAoY2hpIGNvIGBFZGl0b3JgLCBLSE9ORyBjbyBgY2NgKS5cbiAqXG4gKiBEdW9jIGdvaSB0dSBwYW5lbCBxdWE6XG4gKiAgIEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2V4ZWN1dGUtc2NlbmUtc2NyaXB0Jywge1xuICogICAgIG5hbWU6ICdnbGItZXh0cmFjdG9yJywgbWV0aG9kOiAncmVhZE1lc2gnLCBhcmdzOiBbbWVzaFV1aWRdLFxuICogICB9KTtcbiAqXG4gKiBMeSBkbyBjYW4gdm9uZyBxdWEgZGF5IHRoYXkgdmkgdHUgZG9jIGZpbGUgLmpzb24vLmJpbiB0cm9uZyBgbGlicmFyeS9gOlxuICogQ29jb3Mgc2VyaWFsaXplIGFzc2V0IHRyb25nIGxpYnJhcnkgY28gdGhlIGxhIEpTT04gdGh1b25nIGhvYWMgZGluaCBkYW5nXG4gKiBuZW4gQ0NPTiB0dXkgcGhpZW4gYmFuIGVuZ2luZSAtIHRoYXkgdmkgdHUgZG9hbi9wYXJzZSAoZGUgdm8gdGluaCBkb2Mgc2FpXG4gKiBtYSBraG9uZyBiYW8gbG9pKSwgbmhvIENISU5IIGBjYy5hc3NldE1hbmFnZXJgIGRhbmcgY2hheSBnaWFpIG1hIGdpdW0sIHJvaVxuICogY2hpIGxheSBsYWkgS0VUIFFVQSBEQSBHSUFJIE1BIFhPTkcgKG1lc2guc3RydWN0ICsgbWVzaC5kYXRhKSAtIGx1b24gZHVuZ1xuICogYmF0IGtlIGRpbmggZGFuZyBsdXUgdHJ1IG5vaSBibyBjdWEgYmFuIGVuZ2luZSBuYW8uXG4gKi9cbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi8uLi9ub2RlX21vZHVsZXMvQGNvY29zL2NyZWF0b3ItdHlwZXMvZW5naW5lL2NjLmQudHNcIiAvPlxuaW1wb3J0IHsgYXNzZXRNYW5hZ2VyLCBnZnggfSBmcm9tICdjYyc7XG5cbmZ1bmN0aW9uIGxvYWRBc3NldCh1dWlkOiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGFzc2V0TWFuYWdlci5sb2FkQW55KHV1aWQsIChlcnI6IEVycm9yIHwgbnVsbCwgYXNzZXQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKGVycikgcmVqZWN0KGVycik7XG4gICAgICAgICAgICBlbHNlIHJlc29sdmUoYXNzZXQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGNvbnN0IG1ldGhvZHMgPSB7XG4gICAgLyoqXG4gICAgICogRG9jIDEgY2MuTWVzaCAocXVhIHV1aWQgc3ViLWFzc2V0IGRhIGltcG9ydCBjdWEgMSBmaWxlIC5mYngpIHZhIHRyYSB2ZVxuICAgICAqIGR1IGxpZXUgVEhVQU4gKEpTT04tc2VyaWFsaXphYmxlKSBkZSB0aWVuIHRyaW5oIHBhbmVsIGR1bmcgbGFpIHRoYW5oXG4gICAgICogLmdsYiAoeGVtIGNvcmUvZ2xiQnVpbGRlci50cykgLSBraG9uZyB0cmEgdmUgdGhhbmcgaW5zdGFuY2UgdmkgSVBDXG4gICAgICogZ2l1YSBjYWMgdGllbiB0cmluaCBFZGl0b3IgY2hpIHRydXllbiBkdW9jIGR1IGxpZXUsIGtob25nIHRydXllbiBkdW9jXG4gICAgICogY2xhc3MgaW5zdGFuY2UvbWV0aG9kLlxuICAgICAqL1xuICAgIGFzeW5jIHJlYWRNZXNoKHV1aWQ6IHN0cmluZykge1xuICAgICAgICBjb25zdCBtZXNoOiBhbnkgPSBhd2FpdCBsb2FkQXNzZXQodXVpZCk7XG4gICAgICAgIGlmICghbWVzaCB8fCAhbWVzaC5zdHJ1Y3QgfHwgIW1lc2guZGF0YSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdLaMO0bmcgxJHhu41jIMSRxrDhu6NjIG1lc2guc3RydWN0L21lc2guZGF0YSAoYXNzZXQga2jDtG5nIHBo4bqjaSBNZXNoIGjhu6NwIGzhu4csIGhv4bq3YyBi4bqjbiBlbmdpbmUgbsOgeSBraMO0bmcgaOG7lyB0cuG7oykuJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZzogYW55ID0gZ2Z4O1xuICAgICAgICBjb25zdCBkYXRhOiBVaW50OEFycmF5ID0gbWVzaC5kYXRhO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbmFtZTogbWVzaC5uYW1lIHx8ICcnLFxuICAgICAgICAgICAgc3RydWN0OiBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG1lc2guc3RydWN0KSksXG4gICAgICAgICAgICAvLyBCdWZmZXIgbmhpIHBoYW4gcGhhaSBkaSBxdWEgYmFzZTY0IC0ga2VuaCBJUEMgY3VhIEVkaXRvciBnaXVhIGNhY1xuICAgICAgICAgICAgLy8gdGllbiB0cmluaCBraG9uZyBkYW0gYmFvIHRydXllbiBuZ3V5ZW4gQXJyYXlCdWZmZXIvVHlwZWRBcnJheS5cbiAgICAgICAgICAgIGRhdGFCYXNlNjQ6IEJ1ZmZlci5mcm9tKGRhdGEuYnVmZmVyLCBkYXRhLmJ5dGVPZmZzZXQsIGRhdGEuYnl0ZUxlbmd0aCkudG9TdHJpbmcoJ2Jhc2U2NCcpLFxuICAgICAgICAgICAgZm9ybWF0SW5mb3M6IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoZy5Gb3JtYXRJbmZvcyB8fCBudWxsKSksXG4gICAgICAgICAgICBmb3JtYXRUeXBlTmFtZXM6IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoZy5Gb3JtYXRUeXBlIHx8IG51bGwpKSxcbiAgICAgICAgICAgIHByaW1pdGl2ZU1vZGVOYW1lczogSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShnLlByaW1pdGl2ZU1vZGUgfHwgbnVsbCkpLFxuICAgICAgICB9O1xuICAgIH0sXG59O1xuIl19