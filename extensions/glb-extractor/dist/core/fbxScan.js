"use strict";
/**
 * Quet asset-db tim file .fbx trong project + doc cac sub-asset (Mesh, anh
 * nhung theo fbx) cua tung file - dung asset-db chinh thuc cua Editor thay
 * vi tu doc thu muc assets/ bang fs (asset-db moi biet chinh xac asset nao
 * da import xong, uuid gi, va quan trong nhat la "library" - duong dan file
 * DA BIEN DICH cua tung sub-asset tren dia, thu duoc CHINH XAC boi asset-db
 * chu khong the tu doan).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFbxFiles = listFbxFiles;
/** Cac duoi anh coi la "co the copy nguyen ven ra file" - Cocos giu native asset (anh nhung trong fbx) dung dinh dang goc trong library. */
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tga', '.bmp', '.gif']);
/** De quy vao subAssets (thuong chi 1 cap, nhung phong khi ban importer nao do long sau hon). */
function walkSubAssets(info, meshes, textures) {
    const subAssets = (info === null || info === void 0 ? void 0 : info.subAssets) || {};
    for (const key in subAssets) {
        const sub = subAssets[key];
        if (!sub)
            continue;
        if (sub.type === 'cc.Mesh') {
            meshes.push({ uuid: sub.uuid, name: sub.name || key });
        }
        // Anh nhung trong fbx: uu tien nhan dien theo type 'cc.ImageAsset', nhung
        // van kiem tra du phong theo duoi file trong "library" (ten type co the
        // khac giua cac ban engine) - mien la co 1 file anh that su tren dia.
        const library = sub.library || {};
        let imageEntry = null;
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
async function listFbxFiles() {
    const assets = await Editor.Message.request('asset-db', 'query-assets', { pattern: 'db://assets/**/*.fbx' });
    const result = [];
    for (const asset of assets || []) {
        // query-assets tra thong tin RUT GON (khong chac co subAssets day du) - query lai
        // tung asset de chac chan lay duoc toan bo cay sub-asset (Mesh/Texture...).
        const detail = await Editor.Message.request('asset-db', 'query-asset-info', asset.uuid);
        if (!detail)
            continue;
        const meshes = [];
        const textures = [];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmJ4U2Nhbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NvdXJjZS9jb3JlL2ZieFNjYW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7O0dBT0c7O0FBOERILG9DQXVCQztBQW5GRCw0SUFBNEk7QUFDNUksTUFBTSxTQUFTLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBMEJ0RixpR0FBaUc7QUFDakcsU0FBUyxhQUFhLENBQUMsSUFBUyxFQUFFLE1BQW9CLEVBQUUsUUFBeUI7SUFDN0UsTUFBTSxTQUFTLEdBQUcsQ0FBQSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsU0FBUyxLQUFJLEVBQUUsQ0FBQztJQUN4QyxLQUFLLE1BQU0sR0FBRyxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQzFCLE1BQU0sR0FBRyxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMzQixJQUFJLENBQUMsR0FBRztZQUFFLFNBQVM7UUFFbkIsSUFBSSxHQUFHLENBQUMsSUFBSSxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3pCLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksSUFBSSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQzNELENBQUM7UUFFRCwwRUFBMEU7UUFDMUUsd0VBQXdFO1FBQ3hFLHNFQUFzRTtRQUN0RSxNQUFNLE9BQU8sR0FBMkIsR0FBRyxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUM7UUFDMUQsSUFBSSxVQUFVLEdBQXlDLElBQUksQ0FBQztRQUM1RCxLQUFLLE1BQU0sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ3hCLElBQUksU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQUNuQyxVQUFVLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN6QyxNQUFNO1lBQ1YsQ0FBQztRQUNMLENBQUM7UUFDRCxJQUFJLFVBQVUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEtBQUssZUFBZSxJQUFJLEdBQUcsQ0FBQyxJQUFJLEtBQUssY0FBYyxJQUFJLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDNUYsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSSxJQUFJLEdBQUcsRUFBRSxRQUFRLEVBQUUsVUFBVSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDN0csQ0FBQztRQUVELElBQUksR0FBRyxDQUFDLFNBQVMsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNyRCxhQUFhLENBQUMsR0FBRyxFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN6QyxDQUFDO0lBQ0wsQ0FBQztBQUNMLENBQUM7QUFFRCwwR0FBMEc7QUFDbkcsS0FBSyxVQUFVLFlBQVk7SUFDOUIsTUFBTSxNQUFNLEdBQVUsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsY0FBYyxFQUFFLEVBQUUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLENBQUMsQ0FBQztJQUNwSCxNQUFNLE1BQU0sR0FBa0IsRUFBRSxDQUFDO0lBQ2pDLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxJQUFJLEVBQUUsRUFBRSxDQUFDO1FBQy9CLGtGQUFrRjtRQUNsRiw0RUFBNEU7UUFDNUUsTUFBTSxNQUFNLEdBQVEsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzdGLElBQUksQ0FBQyxNQUFNO1lBQUUsU0FBUztRQUV0QixNQUFNLE1BQU0sR0FBaUIsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sUUFBUSxHQUFvQixFQUFFLENBQUM7UUFDckMsYUFBYSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFeEMsTUFBTSxDQUFDLElBQUksQ0FBQztZQUNSLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSTtZQUNqQixJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUk7WUFDakIsR0FBRyxFQUFFLE1BQU0sQ0FBQyxHQUFHO1lBQ2YsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJO1lBQ2pCLE1BQU07WUFDTixRQUFRO1NBQ1gsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUNELE9BQU8sTUFBTSxDQUFDO0FBQ2xCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFF1ZXQgYXNzZXQtZGIgdGltIGZpbGUgLmZieCB0cm9uZyBwcm9qZWN0ICsgZG9jIGNhYyBzdWItYXNzZXQgKE1lc2gsIGFuaFxuICogbmh1bmcgdGhlbyBmYngpIGN1YSB0dW5nIGZpbGUgLSBkdW5nIGFzc2V0LWRiIGNoaW5oIHRodWMgY3VhIEVkaXRvciB0aGF5XG4gKiB2aSB0dSBkb2MgdGh1IG11YyBhc3NldHMvIGJhbmcgZnMgKGFzc2V0LWRiIG1vaSBiaWV0IGNoaW5oIHhhYyBhc3NldCBuYW9cbiAqIGRhIGltcG9ydCB4b25nLCB1dWlkIGdpLCB2YSBxdWFuIHRyb25nIG5oYXQgbGEgXCJsaWJyYXJ5XCIgLSBkdW9uZyBkYW4gZmlsZVxuICogREEgQklFTiBESUNIIGN1YSB0dW5nIHN1Yi1hc3NldCB0cmVuIGRpYSwgdGh1IGR1b2MgQ0hJTkggWEFDIGJvaSBhc3NldC1kYlxuICogY2h1IGtob25nIHRoZSB0dSBkb2FuKS5cbiAqL1xuXG4vKiogQ2FjIGR1b2kgYW5oIGNvaSBsYSBcImNvIHRoZSBjb3B5IG5ndXllbiB2ZW4gcmEgZmlsZVwiIC0gQ29jb3MgZ2l1IG5hdGl2ZSBhc3NldCAoYW5oIG5odW5nIHRyb25nIGZieCkgZHVuZyBkaW5oIGRhbmcgZ29jIHRyb25nIGxpYnJhcnkuICovXG5jb25zdCBJTUFHRV9FWFQgPSBuZXcgU2V0KFsnLnBuZycsICcuanBnJywgJy5qcGVnJywgJy53ZWJwJywgJy50Z2EnLCAnLmJtcCcsICcuZ2lmJ10pO1xuXG5leHBvcnQgaW50ZXJmYWNlIEZieE1lc2hSZWYge1xuICAgIHV1aWQ6IHN0cmluZztcbiAgICBuYW1lOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmJ4VGV4dHVyZVJlZiB7XG4gICAgdXVpZDogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICAvKiogRHVvbmcgZGFuIHR1eWV0IGRvaSB0cmVuIGRpYSB0b2kgZmlsZSBhbmggZGEgaW1wb3J0IChuZ3V5ZW4gdmVuLCBjdW5nIGRpbmggZGFuZyBnb2MpLiAqL1xuICAgIGZpbGVQYXRoOiBzdHJpbmc7XG4gICAgZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmJ4RmlsZUluZm8ge1xuICAgIHV1aWQ6IHN0cmluZztcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgLyoqIHZkIGRiOi8vYXNzZXRzL21vZGVscy9jaGFyYWN0ZXIuZmJ4ICovXG4gICAgdXJsOiBzdHJpbmc7XG4gICAgLyoqIGR1b25nIGRhbiB0dXlldCBkb2kgdG9pIGZpbGUgLmZieCBuZ3Vvbi4gKi9cbiAgICBmaWxlOiBzdHJpbmc7XG4gICAgbWVzaGVzOiBGYnhNZXNoUmVmW107XG4gICAgdGV4dHVyZXM6IEZieFRleHR1cmVSZWZbXTtcbn1cblxuLyoqIERlIHF1eSB2YW8gc3ViQXNzZXRzICh0aHVvbmcgY2hpIDEgY2FwLCBuaHVuZyBwaG9uZyBraGkgYmFuIGltcG9ydGVyIG5hbyBkbyBsb25nIHNhdSBob24pLiAqL1xuZnVuY3Rpb24gd2Fsa1N1YkFzc2V0cyhpbmZvOiBhbnksIG1lc2hlczogRmJ4TWVzaFJlZltdLCB0ZXh0dXJlczogRmJ4VGV4dHVyZVJlZltdKTogdm9pZCB7XG4gICAgY29uc3Qgc3ViQXNzZXRzID0gaW5mbz8uc3ViQXNzZXRzIHx8IHt9O1xuICAgIGZvciAoY29uc3Qga2V5IGluIHN1YkFzc2V0cykge1xuICAgICAgICBjb25zdCBzdWIgPSBzdWJBc3NldHNba2V5XTtcbiAgICAgICAgaWYgKCFzdWIpIGNvbnRpbnVlO1xuXG4gICAgICAgIGlmIChzdWIudHlwZSA9PT0gJ2NjLk1lc2gnKSB7XG4gICAgICAgICAgICBtZXNoZXMucHVzaCh7IHV1aWQ6IHN1Yi51dWlkLCBuYW1lOiBzdWIubmFtZSB8fCBrZXkgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBBbmggbmh1bmcgdHJvbmcgZmJ4OiB1dSB0aWVuIG5oYW4gZGllbiB0aGVvIHR5cGUgJ2NjLkltYWdlQXNzZXQnLCBuaHVuZ1xuICAgICAgICAvLyB2YW4ga2llbSB0cmEgZHUgcGhvbmcgdGhlbyBkdW9pIGZpbGUgdHJvbmcgXCJsaWJyYXJ5XCIgKHRlbiB0eXBlIGNvIHRoZVxuICAgICAgICAvLyBraGFjIGdpdWEgY2FjIGJhbiBlbmdpbmUpIC0gbWllbiBsYSBjbyAxIGZpbGUgYW5oIHRoYXQgc3UgdHJlbiBkaWEuXG4gICAgICAgIGNvbnN0IGxpYnJhcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSBzdWIubGlicmFyeSB8fCB7fTtcbiAgICAgICAgbGV0IGltYWdlRW50cnk6IHsgZXh0OiBzdHJpbmc7IHBhdGg6IHN0cmluZyB9IHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGZvciAoY29uc3QgZXh0IGluIGxpYnJhcnkpIHtcbiAgICAgICAgICAgIGlmIChJTUFHRV9FWFQuaGFzKGV4dC50b0xvd2VyQ2FzZSgpKSkge1xuICAgICAgICAgICAgICAgIGltYWdlRW50cnkgPSB7IGV4dCwgcGF0aDogbGlicmFyeVtleHRdIH07XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGltYWdlRW50cnkgJiYgKHN1Yi50eXBlID09PSAnY2MuSW1hZ2VBc3NldCcgfHwgc3ViLnR5cGUgPT09ICdjYy5UZXh0dXJlMkQnIHx8IGltYWdlRW50cnkpKSB7XG4gICAgICAgICAgICB0ZXh0dXJlcy5wdXNoKHsgdXVpZDogc3ViLnV1aWQsIG5hbWU6IHN1Yi5uYW1lIHx8IGtleSwgZmlsZVBhdGg6IGltYWdlRW50cnkucGF0aCwgZXh0OiBpbWFnZUVudHJ5LmV4dCB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdWIuc3ViQXNzZXRzICYmIE9iamVjdC5rZXlzKHN1Yi5zdWJBc3NldHMpLmxlbmd0aCkge1xuICAgICAgICAgICAgd2Fsa1N1YkFzc2V0cyhzdWIsIG1lc2hlcywgdGV4dHVyZXMpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vKiogTGlldCBrZSBtb2kgZmlsZSAuZmJ4IGRhIGR1b2MgYXNzZXQtZGIgaW1wb3J0IHRyb25nIHByb2plY3QgKGtob25nIHBoYW4gYmlldCBuYW0gdHJvbmcgYnVuZGxlIG5hbykuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbGlzdEZieEZpbGVzKCk6IFByb21pc2U8RmJ4RmlsZUluZm9bXT4ge1xuICAgIGNvbnN0IGFzc2V0czogYW55W10gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldHMnLCB7IHBhdHRlcm46ICdkYjovL2Fzc2V0cy8qKi8qLmZieCcgfSk7XG4gICAgY29uc3QgcmVzdWx0OiBGYnhGaWxlSW5mb1tdID0gW107XG4gICAgZm9yIChjb25zdCBhc3NldCBvZiBhc3NldHMgfHwgW10pIHtcbiAgICAgICAgLy8gcXVlcnktYXNzZXRzIHRyYSB0aG9uZyB0aW4gUlVUIEdPTiAoa2hvbmcgY2hhYyBjbyBzdWJBc3NldHMgZGF5IGR1KSAtIHF1ZXJ5IGxhaVxuICAgICAgICAvLyB0dW5nIGFzc2V0IGRlIGNoYWMgY2hhbiBsYXkgZHVvYyB0b2FuIGJvIGNheSBzdWItYXNzZXQgKE1lc2gvVGV4dHVyZS4uLikuXG4gICAgICAgIGNvbnN0IGRldGFpbDogYW55ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGFzc2V0LnV1aWQpO1xuICAgICAgICBpZiAoIWRldGFpbCkgY29udGludWU7XG5cbiAgICAgICAgY29uc3QgbWVzaGVzOiBGYnhNZXNoUmVmW10gPSBbXTtcbiAgICAgICAgY29uc3QgdGV4dHVyZXM6IEZieFRleHR1cmVSZWZbXSA9IFtdO1xuICAgICAgICB3YWxrU3ViQXNzZXRzKGRldGFpbCwgbWVzaGVzLCB0ZXh0dXJlcyk7XG5cbiAgICAgICAgcmVzdWx0LnB1c2goe1xuICAgICAgICAgICAgdXVpZDogZGV0YWlsLnV1aWQsXG4gICAgICAgICAgICBuYW1lOiBkZXRhaWwubmFtZSxcbiAgICAgICAgICAgIHVybDogZGV0YWlsLnVybCxcbiAgICAgICAgICAgIGZpbGU6IGRldGFpbC5maWxlLFxuICAgICAgICAgICAgbWVzaGVzLFxuICAgICAgICAgICAgdGV4dHVyZXMsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuIl19