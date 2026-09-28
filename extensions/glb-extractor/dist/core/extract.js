"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeName = sanitizeName;
exports.extractFbx = extractFbx;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const global_1 = require("../global");
const glbBuilder_1 = require("./glbBuilder");
/** Ten file/thu muc an toan tren ca Windows lan macOS - thay ky tu cam bang "_". */
function sanitizeName(name) {
    const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
    return cleaned || 'unnamed';
}
/**
 * Goi scene script (`contributions/scene.ts`) doc 1 Mesh sub-asset roi dung
 * thanh .glb - can 1 Scene dang mo trong Editor (scene script chay trong
 * tien trinh Scene), neu khong se nem loi ro rang de nguoi dung mo 1 scene
 * bat ky roi thu lai (khong bat buoc phai la scene chua model do).
 */
async function readMeshViaSceneScript(meshUuid) {
    let res;
    try {
        res = await Editor.Message.request('scene', 'execute-scene-script', {
            name: global_1.PACKAGE_NAME,
            method: 'readMesh',
            args: [meshUuid],
        });
    }
    catch (err) {
        throw new Error(`Gọi scene script thất bại (${err instanceof Error ? err.message : String(err)}) - hãy mở 1 Scene bất kỳ trong Editor rồi thử lại.`);
    }
    if (!res)
        throw new Error('Scene script không trả về dữ liệu (mesh.struct/mesh.data rỗng).');
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
async function extractFbx(fbx, outputDir, onProgress) {
    const summary = { meshOk: 0, meshFail: 0, textureOk: 0, textureFail: 0, errors: [] };
    const targetDir = path.join(outputDir, sanitizeName(fbx.name));
    await fs.ensureDir(targetDir);
    const usedNames = new Set();
    function dedupe(base, ext) {
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
            const { glb, warnings } = (0, glbBuilder_1.buildMeshGlb)(struct, data, tables, name || mesh.name);
            const fileName = dedupe(sanitizeName(mesh.name), '.glb');
            await fs.writeFile(path.join(targetDir, fileName), glb);
            summary.meshOk++;
            warnings.forEach((w) => (0, global_1.warn)(`${fbx.name}/${mesh.name}: ${w}`));
            onProgress({ fbxName: fbx.name, stage: 'mesh', itemName: mesh.name, ok: true, message: warnings.length ? `${warnings.length} lưu ý` : undefined });
        }
        catch (err) {
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
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            summary.textureFail++;
            summary.errors.push(`[Texture] ${fbx.name}/${tex.name}: ${message}`);
            onProgress({ fbxName: fbx.name, stage: 'texture', itemName: tex.name, ok: false, message });
        }
    }
    return summary;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0cmFjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS9jb3JlL2V4dHJhY3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFPQSxvQ0FHQztBQXVERCxnQ0FpREM7QUFsSEQsNkNBQStCO0FBQy9CLDJDQUE2QjtBQUM3QixzQ0FBK0M7QUFDL0MsNkNBQThEO0FBRzlELG9GQUFvRjtBQUNwRixTQUFnQixZQUFZLENBQUMsSUFBWTtJQUNyQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLHdCQUF3QixFQUFFLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ25FLE9BQU8sT0FBTyxJQUFJLFNBQVMsQ0FBQztBQUNoQyxDQUFDO0FBa0JEOzs7OztHQUtHO0FBQ0gsS0FBSyxVQUFVLHNCQUFzQixDQUFDLFFBQWdCO0lBQ2xELElBQUksR0FBUSxDQUFDO0lBQ2IsSUFBSSxDQUFDO1FBQ0QsR0FBRyxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLHNCQUFzQixFQUFFO1lBQ2hFLElBQUksRUFBRSxxQkFBWTtZQUNsQixNQUFNLEVBQUUsVUFBVTtZQUNsQixJQUFJLEVBQUUsQ0FBQyxRQUFRLENBQUM7U0FDbkIsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDWCxNQUFNLElBQUksS0FBSyxDQUNYLDhCQUE4QixHQUFHLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLHFEQUFxRCxDQUN0SSxDQUFDO0lBQ04sQ0FBQztJQUNELElBQUksQ0FBQyxHQUFHO1FBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQyxpRUFBaUUsQ0FBQyxDQUFDO0lBQzdGLE9BQU87UUFDSCxNQUFNLEVBQUUs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QUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNYLE1BQU0sT0FBTyxHQUFHLEdBQUcsWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNqRSxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDdEIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxHQUFHLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNyRSxVQUFVLENBQUMsRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUNoRyxDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQU8sT0FBTyxDQUFDO0FBQ25CLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBmcyBmcm9tICdmcy1leHRyYSc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgUEFDS0FHRV9OQU1FLCB3YXJuIH0gZnJvbSAnLi4vZ2xvYmFsJztcbmltcG9ydCB7IGJ1aWxkTWVzaEdsYiwgTWVzaEZvcm1hdFRhYmxlcyB9IGZyb20gJy4vZ2xiQnVpbGRlcic7XG5pbXBvcnQgeyBGYnhGaWxlSW5mbyB9IGZyb20gJy4vZmJ4U2Nhbic7XG5cbi8qKiBUZW4gZmlsZS90aHUgbXVjIGFuIHRvYW4gdHJlbiBjYSBXaW5kb3dzIGxhbiBtYWNPUyAtIHRoYXkga3kgdHUgY2FtIGJhbmcgXCJfXCIuICovXG5leHBvcnQgZnVuY3Rpb24gc2FuaXRpemVOYW1lKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3QgY2xlYW5lZCA9IG5hbWUucmVwbGFjZSgvWzw+OlwiL1xcXFx8PypcXHgwMC1cXHgxZl0vZywgJ18nKS50cmltKCk7XG4gICAgcmV0dXJuIGNsZWFuZWQgfHwgJ3VubmFtZWQnO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEV4dHJhY3RQcm9ncmVzcyB7XG4gICAgZmJ4TmFtZTogc3RyaW5nO1xuICAgIHN0YWdlOiAnbWVzaCcgfCAndGV4dHVyZSc7XG4gICAgaXRlbU5hbWU6IHN0cmluZztcbiAgICBvazogYm9vbGVhbjtcbiAgICBtZXNzYWdlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEV4dHJhY3RTdW1tYXJ5IHtcbiAgICBtZXNoT2s6IG51bWJlcjtcbiAgICBtZXNoRmFpbDogbnVtYmVyO1xuICAgIHRleHR1cmVPazogbnVtYmVyO1xuICAgIHRleHR1cmVGYWlsOiBudW1iZXI7XG4gICAgZXJyb3JzOiBzdHJpbmdbXTtcbn1cblxuLyoqXG4gKiBHb2kgc2NlbmUgc2NyaXB0IChgY29udHJpYnV0aW9ucy9zY2VuZS50c2ApIGRvYyAxIE1lc2ggc3ViLWFzc2V0IHJvaSBkdW5nXG4gKiB0aGFuaCAuZ2xiIC0gY2FuIDEgU2NlbmUgZGFuZyBtbyB0cm9uZyBFZGl0b3IgKHNjZW5lIHNjcmlwdCBjaGF5IHRyb25nXG4gKiB0aWVuIHRyaW5oIFNjZW5lKSwgbmV1IGtob25nIHNlIG5lbSBsb2kgcm8gcmFuZyBkZSBuZ3VvaSBkdW5nIG1vIDEgc2NlbmVcbiAqIGJhdCBreSByb2kgdGh1IGxhaSAoa2hvbmcgYmF0IGJ1b2MgcGhhaSBsYSBzY2VuZSBjaHVhIG1vZGVsIGRvKS5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVhZE1lc2hWaWFTY2VuZVNjcmlwdChtZXNoVXVpZDogc3RyaW5nKTogUHJvbWlzZTx7IHN0cnVjdDogYW55OyBkYXRhOiBCdWZmZXI7IHRhYmxlczogTWVzaEZvcm1hdFRhYmxlczsgbmFtZTogc3RyaW5nIH0+IHtcbiAgICBsZXQgcmVzOiBhbnk7XG4gICAgdHJ5IHtcbiAgICAgICAgcmVzID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnZXhlY3V0ZS1zY2VuZS1zY3JpcHQnLCB7XG4gICAgICAgICAgICBuYW1lOiBQQUNLQUdFX05BTUUsXG4gICAgICAgICAgICBtZXRob2Q6ICdyZWFkTWVzaCcsXG4gICAgICAgICAgICBhcmdzOiBbbWVzaFV1aWRdLFxuICAgICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgYEfhu41pIHNjZW5lIHNjcmlwdCB0aOG6pXQgYuG6oWkgKCR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfSkgLSBow6N5IG3hu58gMSBTY2VuZSBi4bqldCBr4buzIHRyb25nIEVkaXRvciBy4buTaSB0aOG7rSBs4bqhaS5gXG4gICAgICAgICk7XG4gICAgfVxuICAgIGlmICghcmVzKSB0aHJvdyBuZXcgRXJyb3IoJ1NjZW5lIHNjcmlwdCBraMO0bmcgdHLhuqMgduG7gSBk4buvIGxp4buHdSAobWVzaC5zdHJ1Y3QvbWVzaC5kYXRhIHLhu5duZykuJyk7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc3RydWN0OiByZXMuc3RydWN0LFxuICAgICAgICBkYXRhOiBCdWZmZXIuZnJvbShyZXMuZGF0YUJhc2U2NCwgJ2Jhc2U2NCcpLFxuICAgICAgICB0YWJsZXM6IHtcbiAgICAgICAgICAgIGZvcm1hdEluZm9zOiByZXMuZm9ybWF0SW5mb3MsXG4gICAgICAgICAgICBmb3JtYXRUeXBlTmFtZXM6IHJlcy5mb3JtYXRUeXBlTmFtZXMsXG4gICAgICAgICAgICBwcmltaXRpdmVNb2RlTmFtZXM6IHJlcy5wcmltaXRpdmVNb2RlTmFtZXMsXG4gICAgICAgIH0sXG4gICAgICAgIG5hbWU6IHJlcy5uYW1lLFxuICAgIH07XG59XG5cbi8qKlxuICogVHJpY2ggeHVhdCAxIGZpbGUgLmZieDogbW9pIE1lc2ggc3ViLWFzc2V0IC0+IDEgZmlsZSAuZ2xiLCBtb2kgYW5oIG5odW5nXG4gKiAtPiBjb3B5IG5ndXllbiB2ZW4gcmEgZmlsZS4gQmVzdC1lZmZvcnQgLSAxIG1lc2gvdGV4dHVyZSBsb2kga2hvbmcgbGFtXG4gKiBkdW5nIGNhIGZpbGUgLmZieCBkYW5nIHh1IGx5LCBnaGkgbGFpIG8gYG9uUHJvZ3Jlc3NgICsgYHN1bW1hcnkuZXJyb3JzYC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4dHJhY3RGYngoZmJ4OiBGYnhGaWxlSW5mbywgb3V0cHV0RGlyOiBzdHJpbmcsIG9uUHJvZ3Jlc3M6IChwOiBFeHRyYWN0UHJvZ3Jlc3MpID0+IHZvaWQpOiBQcm9taXNlPEV4dHJhY3RTdW1tYXJ5PiB7XG4gICAgY29uc3Qgc3VtbWFyeTogRXh0cmFjdFN1bW1hcnkgPSB7IG1lc2hPazogMCwgbWVzaEZhaWw6IDAsIHRleHR1cmVPazogMCwgdGV4dHVyZUZhaWw6IDAsIGVycm9yczogW10gfTtcbiAgICBjb25zdCB0YXJnZXREaXIgPSBwYXRoLmpvaW4ob3V0cHV0RGlyLCBzYW5pdGl6ZU5hbWUoZmJ4Lm5hbWUpKTtcbiAgICBhd2FpdCBmcy5lbnN1cmVEaXIodGFyZ2V0RGlyKTtcblxuICAgIGNvbnN0IHVzZWROYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGZ1bmN0aW9uIGRlZHVwZShiYXNlOiBzdHJpbmcsIGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgbGV0IGNhbmRpZGF0ZSA9IGAke2Jhc2V9JHtleHR9YDtcbiAgICAgICAgbGV0IGkgPSAyO1xuICAgICAgICB3aGlsZSAodXNlZE5hbWVzLmhhcyhjYW5kaWRhdGUudG9Mb3dlckNhc2UoKSkpIHtcbiAgICAgICAgICAgIGNhbmRpZGF0ZSA9IGAke2Jhc2V9XyR7aX0ke2V4dH1gO1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICB9XG4gICAgICAgIHVzZWROYW1lcy5hZGQoY2FuZGlkYXRlLnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICByZXR1cm4gY2FuZGlkYXRlO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgbWVzaCBvZiBmYngubWVzaGVzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IHN0cnVjdCwgZGF0YSwgdGFibGVzLCBuYW1lIH0gPSBhd2FpdCByZWFkTWVzaFZpYVNjZW5lU2NyaXB0KG1lc2gudXVpZCk7XG4gICAgICAgICAgICBjb25zdCB7IGdsYiwgd2FybmluZ3MgfSA9IGJ1aWxkTWVzaEdsYihzdHJ1Y3QsIGRhdGEsIHRhYmxlcywgbmFtZSB8fCBtZXNoLm5hbWUpO1xuICAgICAgICAgICAgY29uc3QgZmlsZU5hbWUgPSBkZWR1cGUoc2FuaXRpemVOYW1lKG1lc2gubmFtZSksICcuZ2xiJyk7XG4gICAgICAgICAgICBhd2FpdCBmcy53cml0ZUZpbGUocGF0aC5qb2luKHRhcmdldERpciwgZmlsZU5hbWUpLCBnbGIpO1xuICAgICAgICAgICAgc3VtbWFyeS5tZXNoT2srKztcbiAgICAgICAgICAgIHdhcm5pbmdzLmZvckVhY2goKHcpID0+IHdhcm4oYCR7ZmJ4Lm5hbWV9LyR7bWVzaC5uYW1lfTogJHt3fWApKTtcbiAgICAgICAgICAgIG9uUHJvZ3Jlc3MoeyBmYnhOYW1lOiBmYngubmFtZSwgc3RhZ2U6ICdtZXNoJywgaXRlbU5hbWU6IG1lc2gubmFtZSwgb2s6IHRydWUsIG1lc3NhZ2U6IHdhcm5pbmdzLmxlbmd0aCA/IGAke3dhcm5pbmdzLmxlbmd0aH0gbMawdSDDvWAgOiB1bmRlZmluZWQgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcbiAgICAgICAgICAgIHN1bW1hcnkubWVzaEZhaWwrKztcbiAgICAgICAgICAgIHN1bW1hcnkuZXJyb3JzLnB1c2goYFtNZXNoXSAke2ZieC5uYW1lfS8ke21lc2gubmFtZX06ICR7bWVzc2FnZX1gKTtcbiAgICAgICAgICAgIG9uUHJvZ3Jlc3MoeyBmYnhOYW1lOiBmYngubmFtZSwgc3RhZ2U6ICdtZXNoJywgaXRlbU5hbWU6IG1lc2gubmFtZSwgb2s6IGZhbHNlLCBtZXNzYWdlIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCB0ZXggb2YgZmJ4LnRleHR1cmVzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmaWxlTmFtZSA9IGRlZHVwZShzYW5pdGl6ZU5hbWUodGV4Lm5hbWUpLCB0ZXguZXh0KTtcbiAgICAgICAgICAgIGF3YWl0IGZzLmNvcHkodGV4LmZpbGVQYXRoLCBwYXRoLmpvaW4odGFyZ2V0RGlyLCBmaWxlTmFtZSkpO1xuICAgICAgICAgICAgc3VtbWFyeS50ZXh0dXJlT2srKztcbiAgICAgICAgICAgIG9uUHJvZ3Jlc3MoeyBmYnhOYW1lOiBmYngubmFtZSwgc3RhZ2U6ICd0ZXh0dXJlJywgaXRlbU5hbWU6IHRleC5uYW1lLCBvazogdHJ1ZSB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpO1xuICAgICAgICAgICAgc3VtbWFyeS50ZXh0dXJlRmFpbCsrO1xuICAgICAgICAgICAgc3VtbWFyeS5lcnJvcnMucHVzaChgW1RleHR1cmVdICR7ZmJ4Lm5hbWV9LyR7dGV4Lm5hbWV9OiAke21lc3NhZ2V9YCk7XG4gICAgICAgICAgICBvblByb2dyZXNzKHsgZmJ4TmFtZTogZmJ4Lm5hbWUsIHN0YWdlOiAndGV4dHVyZScsIGl0ZW1OYW1lOiB0ZXgubmFtZSwgb2s6IGZhbHNlLCBtZXNzYWdlIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHN1bW1hcnk7XG59XG4iXX0=