(function () {
'use strict';

function wait(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

/* ================= CONFIG SPREADSHEET ================= */
const SHEETS = [
    {
        id: "1kDShNBXFk3QtrrGaEX0fTjmRd1zGjb0s9n21a_1oHSM",
        gids: ["2065767248"],
        colNama: 3, colTgl: 6, colWA: 5, colJK: 6, colPekerjaan: 7, colKelurahan: 8, colAlamat: 11, colMartial: 12,
        waStatis: true
    },
    {
        id: "167bRhDc_SniwuCmYvmkdDXtvlu1oQ6wVCeZiESwo0sI",
        gids: ["126079672", "1947531650", "1920180130"],
        colNama: 4, colJK: 5, colTgl: 9, colWA: 12, colAlamat: 11, colSekolah: 3, // -> Sudah ditambahkan koma (Fix)
        colKelas: 6,
        colDisabilitas: 15,
        waStatis: false
    }
];

let isProcessing = false;
let loadingEl = null;
let currentScrapedData = null;

/* ================= LOADING SCREEN ================= */
function showLoading(text){
    if(loadingEl) { loadingEl.querySelector('#loadText').innerHTML = text; return; }
    loadingEl = document.createElement("div");
    loadingEl.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;color:#00ff88;font-size:20px;font-weight:bold;text-align:center;flex-direction:column;";
    loadingEl.innerHTML = `<div style="background:#111;padding:30px;border-radius:12px;border:3px solid #00ff88;box-shadow:0 0 20px #00ff88;"><span id="loadText">${text}</span><br><br><div style="margin:auto;border:6px solid #333;border-top:6px solid #00ff88;border-radius:50%;width:50px;height:50px;animation:spin 1s linear infinite;"></div></div>`;
    document.body.appendChild(loadingEl);
}
function hideLoading(){ if(loadingEl){ loadingEl.remove(); loadingEl = null; } }
const style = document.createElement('style'); style.innerHTML = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }`; document.head.appendChild(style);

/* ================= LOGIKA DATA & SAFE CLICK ================= */
const normalizeNIK = v => String(v || "").replace(/\D/g, '');

function sikatReactInput(element, value){
    if(!element) return;
    const setter = Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set;
    if(setter){
        setter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles:true }));
        element.dispatchEvent(new Event('change', { bubbles:true }));
    }
}

function forceInject(element, value) {
    if (!element) return;
    element.removeAttribute('disabled');
    element.removeAttribute('readonly');
    sikatReactInput(element, value);
}

function getInput(keyword){
    const inputs = Array.from(document.querySelectorAll("input, textarea"));
    let target = inputs.find(i => (i.placeholder || "").toLowerCase().includes(keyword.toLowerCase()));
    if(target) return target;
    const labels = Array.from(document.querySelectorAll('.ant-form-item-label label'));
    const label = labels.find(l => l.innerText.toLowerCase().includes(keyword.toLowerCase()));
    if (label) {
        const row = label.closest('.ant-form-item');
        if (row) return row.querySelector('input, textarea');
    }
    return null;
}

// Ritme klik manusia untuk elemen statis non-dropdown
async function ultraClick(el){

    if(!el) return false;

    const rect = el.getBoundingClientRect();

    const x = rect.left + rect.width/2;
    const y = rect.top + rect.height/2;

    el.scrollIntoView({
        behavior:'smooth',
        block:'center'
    });

    await wait(300);

    ['pointerover','mouseover','mouseenter'].forEach(type=>{

        el.dispatchEvent(new MouseEvent(type,{
            bubbles:true,
            clientX:x,
            clientY:y
        }));
    });

    await wait(80);

    el.dispatchEvent(new PointerEvent('pointerdown',{
        bubbles:true,
        pointerType:'mouse',
        clientX:x,
        clientY:y,
        isPrimary:true
    }));

    el.dispatchEvent(new MouseEvent('mousedown',{
        bubbles:true,
        clientX:x,
        clientY:y
    }));

    await wait(120);

    el.dispatchEvent(new PointerEvent('pointerup',{
        bubbles:true,
        pointerType:'mouse',
        clientX:x,
        clientY:y,
        isPrimary:true
    }));

    el.dispatchEvent(new MouseEvent('mouseup',{
        bubbles:true,
        clientX:x,
        clientY:y
    }));

    await wait(50);

    el.click();

    return true;
}

/* ================= TARIK DATA ================= */
function parseCSV(text){

    const rows = [];
    let row = [];
    let current = "";
    let insideQuote = false;

    for(let i=0;i<text.length;i++){

        const char = text[i];
        const next = text[i+1];

        if(char === '"'){

            if(insideQuote && next === '"'){

                current += '"';
                i++;

            }else{

                insideQuote = !insideQuote;
            }
        }

        else if(char === ',' && !insideQuote){

            row.push(current);
            current = "";
        }

        else if(
            (char === '\n' || char === '\r')
            && !insideQuote
        ){

            if(current || row.length){

                row.push(current);

                rows.push(row);

                row = [];
                current = "";
            }
        }

        else{

            current += char;
        }
    }

    if(current || row.length){

        row.push(current);

        rows.push(row);
    }

    return rows;
}

async function cariData(nikInput){

    const target = normalizeNIK(nikInput);

    for(const source of SHEETS){

        for(const gid of source.gids){

            const csv = await new Promise(resolve => {

                GM_xmlhttpRequest({

                    method: "GET",

                    url:
                    `https://docs.google.com/spreadsheets/d/${source.id}/export?format=csv&gid=${gid}`,

                    timeout: 10000,

                    onload: r =>
                        resolve(r.responseText || ""),

                    onerror: () =>
                        resolve("")
                });
            });

            if(!csv || csv.trim()==="") continue;

            /* ================= FIX CSV ================= */

            const rows = parseCSV(csv);

            /* ================= WA STATIS ================= */

            let waD2 =
                (source.waStatis && rows[1])
                ?
                normalizeNIK(rows[1][3])
                :
                "";

            for(let i=1;i<rows.length;i++){

                const row = rows[i];

                if(
                    row.find(
                        col =>
                        normalizeNIK(col)
                        === target
                    )
                ){

                    return {

                        nik: target,

                        nama:
                            (row[source.colNama] || "")
                            .trim(),

                        tgl:
                            (row[source.colTgl] || "")
                            .trim(),

                        hp:
                            waD2
                            ||
                            (row[source.colWA] || "")
                            .replace(/\D/g,''),

                        jk:
                            (row[source.colJK] || "")
                            .trim(),

                        alamat:
                            row[source.colAlamat]
                            || "-",

                        pekerjaan:
                            row[source.colPekerjaan]
                            || "-",

                        kelurahan:
                            row[source.colKelurahan]
                            || "-",

                        sekolah:
                            row[source.colSekolah]
                            || "-",

                        disabilitas:
                            (row[source.colDisabilitas] || "")
                            .trim(),

                        Martial:
                            (row[source.colMartial] || "")
                            .trim(),

                        kelas:
                            (row[source.colKelas] || "")
                            .trim()
                    };
                }
            }
        }
    }

    return null;
}

/* ================= UPGRADE ENGINE SMART DROPDOWN (STABILIZED REAL CLICK) ================= */
async function smartClickDropdown(labelText, valueText) {
    if (!valueText || String(valueText).trim() === "" || valueText === "-") {
        console.log(`[BOT] Data untuk dropdown "${labelText}" kosong. Melewati...`);
        return false;
    }

    // Ambil data mentah dari spreadsheet dan bersihkan spasi di ujungnya
    let rawSheetText = String(valueText).trim().toUpperCase();
    let targetText = String(valueText).trim(); // Default teks pencarian

    // 🔄 KONVERTER KAPITAL OTOMATIS (Menyelaraskan SHeet vs Web Kemenkes)
    if (labelText.toLowerCase().includes("jenis kelamin")) {
        if (rawSheetText.startsWith("LAKI")) targetText = "Laki-laki";
        if (rawSheetText.startsWith("PEREMPUAN") || rawSheetText.startsWith("PEREM")) targetText = "Perempuan";
    }
    else if (labelText.toLowerCase().includes("disabilitas")) {
        if (rawSheetText.startsWith("TIDAK")) targetText = "Tidak Disabilitas";
    }

    // 1. Cari elemen label komponen dropdown (Jenis Kelamin, Disabilitas, dll)
    const labels = Array.from(document.querySelectorAll('.ant-form-item-label label'));
    const label = labels.find(l => l.innerText.toLowerCase().includes(labelText.toLowerCase()));
    if (!label) return false;

    const container = label.closest('.ant-form-item');
    if (!container) return false;

    const selector = container.querySelector('.ant-select-selector');
    if (!selector) return false;

    // 2. KLIK PEMICU DROPDOWN (Sama seperti await dropdownJK.click())
    selector.scrollIntoView({ behavior: "smooth", block: "center" });
    await wait(200);

    selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    await wait(60);
    selector.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    await wait(60);

    // 3. TUNGGU TIMEOUT ANIMASI DROPDOWN (Sama seperti await page.waitForTimeout(500))
    let retries = 15;
    while (retries > 0) {
        await wait(300);

        // Ambil semua elemen opsi dropdown yang muncul di layar (.ant-select-item-option-content)
        const semuaOpsiGlobal = Array.from(document.querySelectorAll('.ant-select-item-option-content'));

        // Saring elemen yang COCOK MURNI (Case-Sensitive) dengan teks target yang sudah dikonversi
        // Ini kloningan murni dari locator(`text="${targetText}"`) Playwright Anda
        const opsiCocok = semuaOpsiGlobal.filter(el => el && el.innerText && el.innerText.trim() === targetText);

        if (opsiCocok.length > 0) {
            // 4. AMBIL ELEMEN URUTAN PALING AKHIR (Sama seperti .last() di Playwright)
            const targetOpsiAkhir = opsiCocok.pop();

            if (targetOpsiAkhir) {
                // Ambil pembungkus baris opsi agar kliknya presisi dan state React tersimpan
                const opsiWrapper = targetOpsiAkhir.closest('.ant-select-item-option') || targetOpsiAkhir;

                opsiWrapper.scrollIntoView({ behavior: "auto", block: "nearest" });
                await wait(50);

                // 5. EKSEKUSI REAL CLICK PADA OPSI (Sama seperti await opsiJK.click())
                opsiWrapper.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
                await wait(150);
                opsiWrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                await wait(60);
                opsiWrapper.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                await wait(60);

                if (typeof opsiWrapper.click === 'function') opsiWrapper.click();
                else opsiWrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

                // 6. JEDA AKHIR ANIMASI DROPDOWN MENUTUP (Sama seperti await page.waitForTimeout(300))
                await wait(300);
                console.log(`[BOT] Sukses konversi & kloning Playwright untuk "${labelText}" -> ${targetText}`);
                return true;
            }
        }
        retries--;
    }

    // Tutup paksa jika gagal agar form tidak berantakan
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.body.click();
    return false;
}

/* ================= EKSEKUSI HALAMAN 2 ================= */
async function eksekusiHalamanDua(data) {
    showLoading("⚡ MENGISI HALAMAN 2... ⚡<br><span style='font-size:14px;color:#fff;'>Sinkronisasi data...</span>");
    await wait(1500);

    // 1. Disabilitas
    let nilaiDisabilitas = data.disabilitas || "Tidak Disabilitas";
    await smartClickDropdown("Disabilitas", nilaiDisabilitas);

    // 2. Pencarian Sekolah
    const labelSekolah = Array.from(document.querySelectorAll('.ant-form-item-label label')).find(l => l.innerText.toLowerCase().includes('sekolah'));
    if (labelSekolah) {
        const containerSekolah = labelSekolah.closest('.ant-form-item');
        if (containerSekolah) {
            const triggerSekolah = containerSekolah.querySelector('.ant-select-selector') || containerSekolah.querySelector('input') || containerSekolah.querySelector('button') || containerSekolah;
            if (triggerSekolah) {
                triggerSekolah.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                ultraClick(triggerSekolah);
                showLoading("⏳ Menunggu Pop-up Sekolah terbuka...");

                let inputCariSekolah = null;
                let btnSubmitCari = null;

                for(let i = 0; i < 10; i++) {
                    await wait(500);
                    inputCariSekolah = document.querySelector('.ant-modal-content input');
                    btnSubmitCari = document.querySelector('.ant-modal-content button.ant-input-search-button') || document.querySelector('.ant-modal-content button.ant-btn-primary') || Array.from(document.querySelectorAll('.ant-modal-content button')).find(b => b.querySelector('.anticon-search'));

                    if (inputCariSekolah && btnSubmitCari) break;
                }

                if (inputCariSekolah && btnSubmitCari) {
                    forceInject(inputCariSekolah, data.sekolah); // Menggunakan variabel data.sekolah yang benar sesuai penarikan
                    await wait(500);

                    btnSubmitCari.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    ultraClick(btnSubmitCari);

                    showLoading("⏳ Mencari Sekolah di database Kemenkes...");
                    await wait(3000);

                    let hasilPertama = null;
                    for(let i = 0; i < 8; i++) {
                        await wait(500);
                        hasilPertama = document.querySelector('.ant-modal-content .ant-list-item button') || document.querySelector('.ant-modal-content .ant-list-item');
                        if (hasilPertama) break;
                    }

                    if (hasilPertama) {
                        hasilPertama.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                        ultraClick(hasilPertama);
                        await wait(1000);
                    } else {
                        const btnClose = document.querySelector('.ant-modal-close');
                        if (btnClose) ultraClick(btnClose);
                    }
                }
            }
        }
    }

    showLoading("⚡ MEMILIH JENJANG & KELAS... ⚡");

    // 3. Jenjang Pendidikan & Kelas
    await smartClickDropdown("Pendidikan", data.kelas);
    await smartClickDropdown("Kelas", data.kelas);

    // 4. Checkbox Alamat Sama KTP
    const checkboxSamaKTP = Array.from(document.querySelectorAll('.ant-checkbox-wrapper')).find(el => el.innerText.toLowerCase().includes('sama dengan alamat ktp'));
    if (checkboxSamaKTP) {
        if (!checkboxSamaKTP.className.includes('ant-checkbox-wrapper-checked') && !checkboxSamaKTP.querySelector('.ant-checkbox-checked')) {
            checkboxSamaKTP.scrollIntoView({ behavior: "smooth", block: "center" });
            checkboxSamaKTP.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            ultraClick(checkboxSamaKTP);
            await wait(500);
        }
    }

// 5. DETAIL ALAMAT (DIKUNCI KHUSUS FORM ALAMAT)
    showLoading("⚡ MENYUNTIKKAN ALAMAT... ⚡");

    let inpAlamat = document.getElementById('address')
                 || document.getElementById('deliveryAddress')
                 || document.querySelector('textarea[id*="alamat" i]')
                 || document.querySelector('textarea[placeholder*="alamat" i]')
                 || document.querySelector('textarea[placeholder*="domisili" i]')
                 || getInput("detail alamat")
                 || getInput("alamat");
                 // 🗑️ BARIS LIAR `|| document.querySelector('textarea')` SUDAH DIBUANG TOTAL!

    if (inpAlamat) {
        inpAlamat.scrollIntoView({ behavior: "smooth", block: "center" });
        ultraClick(inpAlamat);
        await wait(300);

        let alamatTarget = data.alamat || "-";
        forceInject(inpAlamat, alamatTarget);

        inpAlamat.dispatchEvent(new Event('input', { bubbles:true }));
        inpAlamat.dispatchEvent(new Event('change', { bubbles:true }));
        inpAlamat.blur();
        await wait(300);
        console.log("[BOT] Alamat berhasil disuntikkan secara aman:", alamatTarget);
    } else {
        console.log("[BOT] Form alamat belum/tidak ditemukan di halaman ini. Dilewati demi keamanan form medis.");
    }
    
/* ================= SISTEM SEMI AUTO-PILOT ================= */
async function autoPilotSikatHabis(data) {
    currentScrapedData = data;

    showLoading("⚡ AUTO-PILOT AKTIF ⚡<br><span style='font-size:14px;color:#fff;'>Mengisi NIK...</span>");

    const btnTambah = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tambah Baru') || b.innerText.includes('Tambah Peserta'));
    if (btnTambah && !document.querySelector('.ant-modal-content')) {
        ultraClick(btnTambah);
        await wait(1500);
    }

    const inpNIK = getInput("nik");
    if (inpNIK) {
        forceInject(inpNIK, data.nik);
        await wait(300);
        const btnCek = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Cek NIK') || b.innerText.includes('Cari'));
        if (btnCek) ultraClick(btnCek);
    }

    showLoading("⏳ Menunggu Dukcapil Mereset Form...");
    await wait(5000);

    showLoading("⚡ MENGISI DATA AWAL... ⚡");

    let inpNama = getInput("nama lengkap");
    if (inpNama) forceInject(inpNama, data.nama);

    let cleanHP = (data.hp || "").replace(/^0/, "");
    let inpWA = getInput("whatsapp") || getInput("telepon");
    if (inpWA) forceInject(inpWA, cleanHP);

    // EKSEKUSI DROPDOWN JENIS KELAMIN HALAMAN 1 (RITME BARU AMAN STABIL)
/* ================= ISI JK ================= */

await smartClickDropdown(
    "Jenis Kelamin",
    data.jk
);

await wait(1200);

/* ================= ISI TANGGAL ================= */

const inputTanggal =
    document.querySelector(
        '.ant-picker-input input'
    );

if(inputTanggal){

    await ultraClick(inputTanggal);

    await wait(800);

    inputTanggal.removeAttribute(
        'readonly'
    );

    const nativeSetter =
        Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        ).set;

    nativeSetter.call(
        inputTanggal,
        ''
    );

    inputTanggal.dispatchEvent(
        new Event(
            'input',
            { bubbles:true }
        )
    );

    await wait(300);

    nativeSetter.call(
        inputTanggal,
        data.tgl
    );

    inputTanggal.dispatchEvent(
        new Event(
            'input',
            { bubbles:true }
        )
    );

    inputTanggal.dispatchEvent(
        new Event(
            'change',
            { bubbles:true }
        )
    );

    inputTanggal.dispatchEvent(
        new KeyboardEvent(
            'keydown',
            {
                key:'Enter',
                code:'Enter',
                keyCode:13,
                which:13,
                bubbles:true
            }
        )
    );

    inputTanggal.dispatchEvent(
        new KeyboardEvent(
            'keyup',
            {
                key:'Enter',
                code:'Enter',
                keyCode:13,
                which:13,
                bubbles:true
            }
        )
    );

    await wait(1200);

    inputTanggal.blur();
}

/* ================= INFO UI ================= */

hideLoading();

document.getElementById(
    "infoAI"
).innerHTML = `

    <div style="
        background:#00ff88;
        color:#000;
        padding:8px;
        border-radius:5px;
        text-align:center;
        font-weight:bold;
        margin-bottom:8px;
    ">
        ✅ HALAMAN 1 OTOMATIS
    </div>

    <div style="
        background:#222;
        border:1px solid #555;
        padding:8px;
        border-radius:5px;
        font-size:12px;
        line-height:1.6;
    ">

        <b>📌 DATA TERISI:</b><br>

        • Nama:
        <b style="color:#00ff88;">
            ${data.nama}
        </b><br>

        • Tgl:
        <b style="color:#00ff88;">
            ${data.tgl}
        </b><br>

        • JK:
        <b style="color:#00ff88;">
            ${data.jk}
        </b><br>

        • Sekolah:
        <b style="color:#00ff88;">
            ${data.sekolah}
        </b><br>

        • Kelas:
        <b style="color:#00ff88;">
            ${data.kelas}
        </b>

    </div>

    <div style="
        margin-top:8px;
        font-size:11px;
        color:#aaa;
        text-align:center;
    ">
        Bot memantau tombol
        <b>'Selanjutnya'</b>...
    </div>
`;

/* ================= AUTO NEXT ================= */

let btnLanjut = null;

while(true){

    btnLanjut =
        Array.from(
            document.querySelectorAll(
                'button'
            )
        ).find(
            b =>
            b.innerText.includes(
                'Selanjutnya'
            )
        );

    if(
        btnLanjut &&
        !btnLanjut.disabled &&
        !btnLanjut.classList.contains(
            'ant-btn-disabled'
        )
    ){
        break;
    }

    await wait(500);
}

await ultraClick(btnLanjut);

await wait(4000);

/* ================= HALAMAN 2 ================= */

await eksekusiHalamanDua(data);

/* ================= UI KONTROL & DRAGGABLE LOGIC ================= */
function initUI(){
    if(document.getElementById("ai-box")) return;

    const box = document.createElement("div");
    box.id = "ai-box";
    box.style = "position:fixed;top:150px;right:20px;background:#111;color:#fff;padding:15px;border-radius:12px;z-index:99999;width:270px;font-family:sans-serif;box-shadow:0 0 15px #00ff88; border: 2px solid #222;";

    box.innerHTML = `
        <div id="dragHeader" style="text-align:center; margin-bottom:10px; cursor:move; background:#222; padding:8px; border-radius:8px; border:1px solid #444;" title="Klik dan tahan untuk menggeser bot">
            <b style="color:#00ff88; font-size:16px;">BOT CKG V30</b><br>
            <span style="font-size:10px; color:#aaa; letter-spacing:1px;">THE FINAL FIX</span>
        </div>
        <div style="background:#222; padding:10px; border-radius:8px; text-align:center; margin-bottom:10px; border:1px solid #444;">
            <b style="color:#ffcc00; font-size:11px;">⚡ TEMPEL/SCAN NIK DI SINI ⚡</b><br>
            <input id="nikAI" placeholder="16 Digit NIK..." style="width:90%; margin-top:8px; padding:8px; border-radius:5px; background:#000; color:#00ff88; font-weight:bold; text-align:center; border:1px solid #00ff88; outline:none;">
        </div>
        <div id="infoAI" style="font-size:12px; line-height:1.5; color:#ccc;">
            Status: <b style="color:#00ff88;">Siaga. Menunggu NIK...</b>
        </div>
    `;
    document.body.appendChild(box);

    const dragHeader = document.getElementById("dragHeader");
    let isDraggingBox = false;
    let offsetX, offsetY;

    dragHeader.addEventListener('mousedown', function(e) {
        isDraggingBox = true;
        offsetX = e.clientX - box.getBoundingClientRect().left;
        offsetY = e.clientY - box.getBoundingClientRect().top;
        box.style.opacity = "0.8";
    });

    document.addEventListener('mousemove', function(e) {
        if (isDraggingBox) {
            box.style.right = 'auto';
            box.style.bottom = 'auto';
            box.style.left = (e.clientX - offsetX) + 'px';
            box.style.top = (e.clientY - offsetY) + 'px';
        }
    });

    document.addEventListener('mouseup', function() {
        if (isDraggingBox) {
            isDraggingBox = false;
            box.style.opacity = "1";
        }
    });

    document.getElementById("nikAI").addEventListener('input', async (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length === 16 && !isProcessing) {
            isProcessing = true;
            document.getElementById("infoAI").innerHTML = `<b style="color:#ffcc00;">Mencari NIK: ${val}...</b>`;

            try {
                let data = await cariData(val);
                if (data) {
                    await autoPilotSikatHabis(data);
                } else {
                    document.getElementById("infoAI").innerHTML = `<b style="color:#ff3333;">Data NIK ${val} tidak ditemukan!</b>`;
                }
            } catch (err) {
                console.log("[BOT ERROR]", err);
                hideLoading();
                document.getElementById("infoAI").innerHTML = `<b style="color:#ff3333;">Terjadi Kendala. Coba lagi!</b>`;
            } finally {
                e.target.value = "";
                isProcessing = false;
            }
        }
    });
}
setTimeout(initUI, 1500);
})();
