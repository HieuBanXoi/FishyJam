import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { listFbxFiles, FbxFileInfo } from '../../core/fbxScan';
import { extractFbx, ExtractProgress } from '../../core/extract';

// panel Editor.Panel.define khong co kieu `this` chinh xac (phu thuoc $ map dong) -
// giu 1 bien module-scope tro toi instance, giong cach lam trong playable-ads-builder/panel.ts.
let panel: any;

let fbxList: FbxFileInfo[] = [];
const selected = new Set<string>();
/** trang thai hien thi cua tung dong theo uuid fbx - null = chua chay, true/false = ket qua lan gan nhat. */
const rowStatus = new Map<string, { ok: boolean | null; message: string }>();
let busy = false;

function appendLog(line: string): void {
    if (!panel?.$.logBox) return;
    const time = new Date().toLocaleTimeString();
    panel.$.logBox.textContent += `[${time}] ${line}\n`;
    panel.$.logBox.scrollTop = panel.$.logBox.scrollHeight;
}

function escapeHtml(s: string): string {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function renderTable(): void {
    if (!panel?.$.tableBody) return;

    if (fbxList.length === 0) {
        panel.$.tableBody.innerHTML = '<tr class="gx-empty-row"><td colspan="6">Bấm "Quét .fbx trong project" để bắt đầu.</td></tr>';
        panel.$.headerCheckbox.checked = false;
        return;
    }

    panel.$.tableBody.innerHTML = fbxList
        .map((fbx) => {
            const checked = selected.has(fbx.uuid) ? 'checked' : '';
            const status = rowStatus.get(fbx.uuid);
            let statusHtml = '';
            if (busy && status === undefined) {
                statusHtml = '';
            } else if (status) {
                statusHtml = status.ok
                    ? `<span class="gx-row-status-ok">✓ ${escapeHtml(status.message)}</span>`
                    : `<span class="gx-row-status-error">✗ ${escapeHtml(status.message)}</span>`;
            }
            return `
            <tr data-uuid="${escapeHtml(fbx.uuid)}">
                <td class="gx-col-check"><input type="checkbox" class="gx-row-check" ${checked} /></td>
                <td title="${escapeHtml(fbx.name)}">${escapeHtml(fbx.name)}</td>
                <td title="${escapeHtml(fbx.url)}">${escapeHtml(fbx.url)}</td>
                <td class="gx-col-num">${fbx.meshes.length}</td>
                <td class="gx-col-num">${fbx.textures.length}</td>
                <td>${statusHtml}</td>
            </tr>`;
        })
        .join('');

    panel.$.headerCheckbox.checked = fbxList.length > 0 && fbxList.every((f) => selected.has(f.uuid));
}

function updateSummary(): void {
    if (!panel?.$.summaryText) return;
    const totalMesh = fbxList.reduce((s, f) => s + f.meshes.length, 0);
    const totalTex = fbxList.reduce((s, f) => s + f.textures.length, 0);
    panel.$.summaryText.textContent = fbxList.length
        ? `${fbxList.length} file .fbx · ${totalMesh} mesh · ${totalTex} texture nhúng`
        : '';
    panel.$.extractBtn.disabled = selected.size === 0 || busy;
}

async function onScanClick(): Promise<void> {
    if (busy) return;
    panel.$.scanBtn.disabled = true;
    appendLog('Đang quét project tìm file .fbx...');
    try {
        fbxList = await listFbxFiles();
        selected.clear();
        rowStatus.clear();
        appendLog(`Tìm thấy ${fbxList.length} file .fbx.`);
        if (fbxList.length === 0) {
            appendLog('Không tìm thấy file .fbx nào dưới assets/ (hoặc chưa import xong - thử đợi asset-db import rồi quét lại).');
        }
    } catch (err) {
        appendLog(`Quét thất bại: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
        panel.$.scanBtn.disabled = false;
        renderTable();
        updateSummary();
    }
}

function onTableClick(ev: Event): void {
    const target = ev.target as HTMLElement;
    if (!target.classList.contains('gx-row-check')) return;
    const tr = target.closest('tr[data-uuid]') as HTMLElement | null;
    const uuid = tr?.dataset.uuid;
    if (!uuid) return;
    if ((target as HTMLInputElement).checked) selected.add(uuid);
    else selected.delete(uuid);
    panel.$.headerCheckbox.checked = fbxList.length > 0 && fbxList.every((f) => selected.has(f.uuid));
    updateSummary();
}

function onHeaderCheckboxChange(): void {
    const check = panel.$.headerCheckbox.checked;
    selected.clear();
    if (check) fbxList.forEach((f) => selected.add(f.uuid));
    renderTable();
    updateSummary();
}

function onSelectAllClick(): void {
    selected.clear();
    fbxList.forEach((f) => selected.add(f.uuid));
    renderTable();
    updateSummary();
}

function onSelectNoneClick(): void {
    selected.clear();
    renderTable();
    updateSummary();
}

async function onChooseDirClick(): Promise<void> {
    const res = await Editor.Dialog.select({
        title: 'Chọn thư mục xuất',
        type: 'directory',
        path: panel.$.outputInput.value || Editor.Project.path,
    });
    if (!res.canceled && res.filePaths && res.filePaths[0]) {
        panel.$.outputInput.value = res.filePaths[0];
    }
}

async function onExtractClick(): Promise<void> {
    if (busy || selected.size === 0) return;
    const outputDir = (panel.$.outputInput.value || '').trim();
    if (!outputDir) {
        appendLog('Chưa chọn thư mục xuất.');
        return;
    }

    busy = true;
    panel.$.extractBtn.disabled = true;
    panel.$.scanBtn.disabled = true;
    rowStatus.clear();
    renderTable();

    const targets = fbxList.filter((f) => selected.has(f.uuid));
    appendLog(`Bắt đầu trích xuất ${targets.length} file .fbx -> ${outputDir}`);

    let totalMeshOk = 0, totalMeshFail = 0, totalTexOk = 0, totalTexFail = 0;
    const allErrors: string[] = [];

    for (const fbx of targets) {
        const onProgress = (p: ExtractProgress) => {
            appendLog(`${p.ok ? '✓' : '✗'} [${p.stage}] ${fbx.name}/${p.itemName}${p.message ? ' - ' + p.message : ''}`);
        };
        try {
            const summary = await extractFbx(fbx, outputDir, onProgress);
            totalMeshOk += summary.meshOk;
            totalMeshFail += summary.meshFail;
            totalTexOk += summary.textureOk;
            totalTexFail += summary.textureFail;
            allErrors.push(...summary.errors);
            const ok = summary.meshFail === 0 && summary.textureFail === 0;
            rowStatus.set(fbx.uuid, {
                ok,
                message: ok ? `${summary.meshOk} mesh, ${summary.textureOk} texture` : `${summary.meshFail + summary.textureFail} lỗi (xem log)`,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            allErrors.push(`[${fbx.name}] ${message}`);
            rowStatus.set(fbx.uuid, { ok: false, message });
            appendLog(`✗ ${fbx.name}: ${message}`);
        }
        renderTable();
    }

    appendLog(`Hoàn tất: ${totalMeshOk} mesh OK / ${totalMeshFail} lỗi, ${totalTexOk} texture OK / ${totalTexFail} lỗi.`);
    if (allErrors.length) appendLog(`Chi tiết lỗi:\n  - ${allErrors.join('\n  - ')}`);

    busy = false;
    panel.$.scanBtn.disabled = false;
    updateSummary();
}

module.exports = Editor.Panel.define({
    listeners: {
        show() {},
        hide() {},
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        app: '#app',
        scanBtn: '#scanBtn',
        summaryText: '#summaryText',
        outputInput: '#outputInput',
        chooseDirBtn: '#chooseDirBtn',
        selectAllBtn: '#selectAllBtn',
        selectNoneBtn: '#selectNoneBtn',
        extractBtn: '#extractBtn',
        tableBody: '#tableBody',
        headerCheckbox: '#headerCheckbox',
        logBox: '#logBox',
    },
    methods: {},
    ready() {
        panel = this;

        // Mac dinh: <project>/extracted_glb - nguoi dung doi duoc qua nut "Chon...".
        panel.$.outputInput.value = join(Editor.Project.path, 'extracted_glb');

        panel.$.scanBtn.addEventListener('click', onScanClick);
        panel.$.tableBody.addEventListener('click', onTableClick);
        panel.$.headerCheckbox.addEventListener('change', onHeaderCheckboxChange);
        panel.$.selectAllBtn.addEventListener('click', onSelectAllClick);
        panel.$.selectNoneBtn.addEventListener('click', onSelectNoneClick);
        panel.$.chooseDirBtn.addEventListener('click', onChooseDirClick);
        panel.$.extractBtn.addEventListener('click', onExtractClick);

        renderTable();
        updateSummary();
        appendLog('Sẵn sàng. Bấm "Quét .fbx trong project" để bắt đầu.');
    },
    beforeClose() {},
    close() {
        panel.$.scanBtn.removeEventListener('click', onScanClick);
        panel.$.tableBody.removeEventListener('click', onTableClick);
        panel.$.headerCheckbox.removeEventListener('change', onHeaderCheckboxChange);
        panel.$.selectAllBtn.removeEventListener('click', onSelectAllClick);
        panel.$.selectNoneBtn.removeEventListener('click', onSelectNoneClick);
        panel.$.chooseDirBtn.removeEventListener('click', onChooseDirClick);
        panel.$.extractBtn.removeEventListener('click', onExtractClick);
    },
});
