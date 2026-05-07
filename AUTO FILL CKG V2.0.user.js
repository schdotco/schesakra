// ==UserScript==
// @name          AUTO FILL CKG - FINAL ULTIMATE FIX
// @match         https://sehatindonesiaku.kemkes.go.id/*
// @grant         GM_xmlhttpRequest
// ==/UserScript==

(function() {
'use strict';

const wait = ms => new Promise(r => setTimeout(r, ms));

/* ================= CONFIG PER SHEET ================= */
const SHEETS = [
    {
        // SPREADSHEET 1 
        id: "1kDShNBXFk3QtrrGaEX0fTjmRd1zGjb0s9n21a_1oHSM",
        gids: ["2065767248"],
        colNama: 3, colTgl: 6, colWA: 5, colJK:8, colAlamat: 13, colPekerjaan: 9, colKelurahan: 10,
        waStatis: true // Penanda bahwa WA diambil dari D2
    },
    {
        // SPREADSHEET 2 (Data Normal)
        id: "167bRhDc_SniwuCmYvmkdDXtvlu1oQ6wVCeZiESwo0sI",
        gids: ["126079672","1947531650","1920180130"],
        colNama: 4, colJK:5, colTgl: 9, colWA: 12, colAlamat: 11,
        waStatis: false
    }
];

/* ================= GLOBAL DATA ================= */
let currentData = null;

/* ================= UI LOADING ================= */
let loadingEl = null;
function showLoading(text){
    if(loadingEl) return;
    loadingEl = document.createElement("div");
    loadingEl.style = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:999999; display:flex; align-items:center; justify-content:center; color:#00ff88; font-size:20px; font-weight:bold; flex-direction:column; text-align:center;`;
    loadingEl.innerHTML = `<div style="background:#111; padding:20px; border-radius:10px; border:2px solid #00ff88;">${text}<br><br><div class="loader" style="margin:auto;"></div></div>`;
    document.body.appendChild(loadingEl);
}
function hideLoading(){ if(loadingEl){ loadingEl.remove(); loadingEl = null; } }

const style = document.createElement("style");
style.innerHTML = `.loader { border: 5px solid #ccc; border-top: 5px solid #00ff88; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; } @keyframes spin { 0% { transform: rotate(0deg);} 100% { transform: rotate(360deg);} }`;
document.head.appendChild(style);

/* ================= LOGIKA DATA ================= */
const normalizeNIK = v => String(v||"").replace(/\D/g,'');

async function cariData(nikInput){
    const target = normalizeNIK(nikInput);
    for(const source of SHEETS){
        for(const gid of source.gids){
            const csv = await new Promise(resolve => {
                GM_xmlhttpRequest({
                    method:"GET",
                    url:`https://docs.google.com/spreadsheets/d/${source.id}/export?format=csv&gid=${gid}`,
                    onload:r=>resolve(r.responseText)
                });
            });
            const rows = csv.split("\n").map(r => r.split(","));

            // Ambil WA Statis dari D2 jika disetting true
            let waD2 = (source.waStatis && rows[1]) ? normalizeNIK(rows[1][3]) : "";

            for(let i=1; i<rows.length; i++){
                const row = rows[i];
                if(row.find(col => normalizeNIK(col) === target)){
                    return {
                        nik: target,
                        nama: (row[source.colNama] || "").trim(),
                        tgl: (row[source.colTgl] || "").replace(/\//g, '-').trim(),
                        hp: waD2 || (row[source.colWA] || "").replace(/\D/g,''),
                        jk: (row[source.colJK] || "").toLowerCase().startsWith("p") ? "Perempuan" : "Laki-laki",
                        alamat: (row[source.colAlamat] || "-"),
                        pekerjaan: (row[source.colPekerjaan] || "-"),
                        kelurahan: (row[source.colKelurahan] || "-")
                    };
                }
            }
        }
    }
    return null;
}

/* ================= SIMULASI KETIKAN ================= */
async function simulateTyping(el, text) {
    if(!el || !text) return;
    el.focus(); el.value = "";
    for(let c of String(text)){ el.value += c; el.dispatchEvent(new Event("input",{bubbles:true})); await wait(15); }
    el.dispatchEvent(new Event("change",{bubbles:true})); el.blur();
}

/* ================= EKSEKUSI PER HALAMAN ================= */
async function runHal1(){
    const nik = document.getElementById("nikAI").value;
    if(!nik) return alert("Isi NIK!");
    showLoading("🔍 Mencari Data...");
    currentData = await cariData(nik);
    if(!currentData) { alert("NIK Tidak Ada!"); hideLoading(); return; }

    const getInp = (k) => [...document.querySelectorAll("input, textarea")].find(i => i.placeholder?.toLowerCase().includes(k) || i.name?.toLowerCase().includes(k));

    await simulateTyping(getInp("nik"), currentData.nik);
    const btnCek = document.evaluate("//button[contains(., 'Cek NIK')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if(btnCek) { btnCek.click(); await wait(1500); }

    await simulateTyping(getInp("nama lengkap"), currentData.nama);
    // Tambahkan pengaman agar tidak error jika hp kosong
    let cleanHP = (currentData.hp || "").replace(/^0/, "");
    await simulateTyping(getInp("whatsapp"), cleanHP);

document.getElementById("infoAI").innerHTML = `
    <b style="color:#00ff88;">HAL 1 OK</b><br>
    <b>WA:</b> ${currentData.hp}<br>
    <b>Tgl:</b> ${currentData.tgl}<br>
    <b>JK:</b> <span style="color:#fff; background:#444; padding:2px 5px;">${currentData.jk}</span>
`;
    hideLoading();
}

async function runHal2(){
    if(!currentData) return alert("Cari NIK dulu!");
    const getInp = (k) => [...document.querySelectorAll("input, textarea")].find(i => i.placeholder?.toLowerCase().includes(k) || i.name?.toLowerCase().includes(k));
    const inpDet = getInp("detail alamat") || getInp("domisili") || getInp("alamat");

    if(inpDet) {
        await simulateTyping(inpDet, currentData.alamat);
    }

    // Tampilkan informasi lengkap di Halaman 2
    document.getElementById("infoAI").innerHTML = `
        <b style="color:#ffcc00;">HAL 2 OK</b><br>
        <div style="background:#222; padding:5px; border:1px solid #444; margin-top:5px; font-size:11px; line-height:1.5;">
            <b>Pekerjaan:</b> ${currentData.pekerjaan}<br>
            <b>Kelurahan:</b> ${currentData.kelurahan}<br>
            <hr style="border:0; border-top:1px solid #444;">
            <b>Alamat:</b><br>${currentData.alamat}
        </div>
    `;
}

/* ================= UI INIT ================= */
function initUI(){
    if(document.getElementById("ai-box")) return;
    const box = document.createElement("div");
    box.id = "ai-box";
    box.style = `position:fixed; bottom:140px; left:10px; background:#111; color:#fff; padding:12px; border-radius:10px; z-index:99999; box-shadow: 0 0 10px #00ff88; border: 1px solid #333; width: 250px; font-family: sans-serif; font-size:12px;`;
    box.innerHTML = `
        <b style="color:#00ff88;">BOT CKG ULTIMATE</b><br><br>
        <input id="nikAI" placeholder="NIK..." style="width:100%; margin-bottom:8px; padding:5px; border-radius:4px; background:#222; color:#fff; border:1px solid #444;"><br>
        <button id="btnH1" style="width:100%; cursor:pointer; background:#00ff88; border:none; padding:8px; font-weight:bold; margin-bottom:5px; border-radius:4px; color:#000;">1. HAL 1</button>
        <button id="btnH2" style="width:100%; cursor:pointer; background:#ffcc00; border:none; padding:8px; font-weight:bold; border-radius:4px; color:#000;">2. HAL 2</button>
        <div id="infoAI" style="margin-top:10px; line-height:1.4;"></div>
    `;
    document.body.appendChild(box);
    document.getElementById("btnH1").onclick = runHal1;
    document.getElementById("btnH2").onclick = runHal2;
}
setTimeout(initUI, 1500);
})();