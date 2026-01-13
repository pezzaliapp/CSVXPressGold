// ===============================
// CSVXpressGold — app.js (FULL)
// Preventivi (Riv/Cliente) + Margine + Noleggio + TXT
// SCONTO CLIENTE FINALE INVERSO (servizi nascosti)
// ===============================

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js')
    .then(reg => console.log("SW ok", reg))
    .catch(err => console.warn("SW fail", err));
}

// Stato
var listino = [];
var articoliAggiunti = [];
var autoPopolaCosti = true;

// Utils
function roundTwo(n){ return Math.round(n * 100) / 100; }
function n(v){
  v = parseFloat(String(v ?? "").replace(",", "."));
  return isNaN(v) ? 0 : v;
}
function clampMin(v,min){ return v < min ? min : v; }

// DOM helpers
function byId(id){ return document.getElementById(id); }
function createEl(t){ return document.createElement(t); }
function esc(s){
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

// ===============================
// ANAGRAFICA (localStorage)
// ===============================
var ANAG_KEY = "csvxpressgold_anagrafica_v2";

function hasAnagraficaUI(){
  return !!byId("anagraficaAzienda");
}

function getAnagrafica(){
  if (!hasAnagraficaUI()) return {};
  function v(id){ return (byId(id)?.value || "").trim(); }
  return {
    tipo: v("anagraficaTipo") || "rivenditore",
    azienda: v("anagraficaAzienda"),
    referente: v("anagraficaReferente"),
    email: v("anagraficaEmail"),
    cell: v("anagraficaCell"),
    indirizzo: v("anagraficaIndirizzo"),
    piva: v("anagraficaPiva"),
    cf: v("anagraficaCf"),
    note: v("anagraficaNote")
  };
}

function saveAnagrafica(){
  if (!hasAnagraficaUI()) return;
  localStorage.setItem(ANAG_KEY, JSON.stringify(getAnagrafica()));
}

function loadAnagrafica(){
  if (!hasAnagraficaUI()) return;
  var raw = localStorage.getItem(ANAG_KEY);
  if (!raw) return;
  var d = JSON.parse(raw);
  Object.keys(d).forEach(k=>{
    if(byId("anagrafica"+k.charAt(0).toUpperCase()+k.slice(1))){
      byId("anagrafica"+k.charAt(0).toUpperCase()+k.slice(1)).value = d[k];
    }
  });
}

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  loadAnagrafica();
  ["input","change"].forEach(ev=>{
    document.body.addEventListener(ev, saveAnagrafica, true);
  });

  byId("csvFileInput").addEventListener("change", handleCSVUpload);
  byId("searchListino").addEventListener("input", aggiornaListinoSelect);
  byId("btnAddFromListino").addEventListener("click", aggiungiArticoloDaListino);
  byId("btnManual").addEventListener("click", mostraFormArticoloManuale);

  byId("btnPrevRiv").addEventListener("click",()=>apriPreventivo("riv"));
  byId("btnPrevCli").addEventListener("click",()=>apriPreventivo("cli"));

  byId("btnWA").addEventListener("click",()=>shareWhatsApp(generaReport(false)));
  byId("btnTXT").addEventListener("click",()=>openText(generaReport(false)));

  aggiornaTabellaArticoli();
  aggiornaTotali();
});
// ===============================
// CSV UPLOAD (PapaParse)
// ===============================
function handleCSVUpload(e){
  var file = e.target.files && e.target.files[0];
  if (!file) return;

  if (typeof Papa === "undefined"){
    alert("Errore: PapaParse non caricato. Controlla <script src=...papaparse...> in index.html");
    return;
  }

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function(res){
      if (!res.data || !res.data.length){
        byId("csvError") && (byId("csvError").style.display="block");
        return;
      }
      byId("csvError") && (byId("csvError").style.display="none");

      listino = res.data.map(function(row){
        row = row || {};
        return {
          codice: String(row["Codice"] || "").trim(),
          descrizione: String(row["Descrizione"] || "").trim(),
          prezzoLordo: n(row["PrezzoLordo"] || 0),
          sconto: 0,
          sconto2: 0,
          margine: 0,
          costoTrasporto: n(row["CostoTrasporto"] || 0),
          costoInstallazione: n(row["CostoInstallazione"] || 0),
          quantita: 1,
          venduto: 0
        };
      }).filter(function(x){ return x.codice || x.descrizione; });

      aggiornaListinoSelect();
    },
    error: function(err){
      console.error("CSV error", err);
      byId("csvError") && (byId("csvError").style.display="block");
    }
  });
}

// ===============================
// LISTINO UI
// ===============================
function aggiornaListinoSelect(){
  var sel = byId("listinoSelect");
  if (!sel) return;

  var q = (byId("searchListino")?.value || "").toLowerCase().trim();
  sel.innerHTML = "";

  listino.forEach(function(item){
    var hit =
      (item.codice || "").toLowerCase().includes(q) ||
      (item.descrizione || "").toLowerCase().includes(q);

    if (!q || hit){
      var opt = createEl("option");
      opt.value = item.codice;
      opt.textContent = (item.codice || "—") + " - " + (item.descrizione || "") + " - €" + (n(item.prezzoLordo).toFixed(2));
      sel.appendChild(opt);
    }
  });
}

function trovaInListino(cod){
  for (var i=0;i<listino.length;i++){
    if (listino[i].codice === cod) return listino[i];
  }
  return null;
}

// ===============================
// Aggiunta articolo da listino
// ===============================
function aggiungiArticoloDaListino(){
  var sel = byId("listinoSelect");
  if (!sel || !sel.value) return;

  var base = trovaInListino(sel.value);
  if (!base){
    alert("Articolo non trovato nel listino");
    return;
  }

  var nuovo = Object.assign({}, base);

  // Se disabiliti auto-popola costi, azzera i servizi (restano comunque calcolati internamente se presenti)
  if (!autoPopolaCosti){
    nuovo.costoTrasporto = 0;
    nuovo.costoInstallazione = 0;
  }

  articoliAggiunti.push(nuovo);
  aggiornaTabellaArticoli();
  aggiornaTotali();
}

// ===============================
// CALCOLI
// ===============================
function calcNetto(a){
  var lordo = n(a.prezzoLordo);
  var s1 = n(a.sconto);
  var s2 = n(a.sconto2);
  return roundTwo(lordo * (1 - s1/100) * (1 - s2/100));
}

function calcPrezzoConMargine(netto, marg){
  marg = n(marg);
  if (marg <= 0) return roundTwo(netto);
  if (marg >= 99.99) marg = 99.99;
  return roundTwo(netto / (1 - marg/100));
}

function getMargineRiv(a){
  var m = n(a.margine);
  if (m > 0) return m;
  return n(byId("margineRivDefault")?.value || 0);
}

function getMargineCli(){
  return n(byId("margineCliDefault")?.value || 0);
}
// ===============================
// UI: Servizi nascosti (forza OFF e nasconde toggle)
// ===============================
function setupServiziHidden(){
  var t = byId("toggleMostraServizi");
  if (t){
    try { t.checked = false; } catch(e){}
    // nasconde l'intero blocco contenitore, se è dentro una label o wrapper
    var parent = t.closest ? (t.closest(".row") || t.closest(".box") || t.closest("label") || t.parentNode) : t.parentNode;
    if (parent && parent.style) parent.style.display = "none";
  }
}

// ===============================
// Tabella articoli (servizi NON visibili)
// ===============================
function tdInp(index, field, value, minVal, step){
  var v = (typeof value === "number") ? value : n(value);
  var minAttr = (minVal != null) ? (" min='" + String(minVal) + "'") : "";
  var stepAttr = (step != null) ? (" step='" + String(step) + "'") : "";
  return "<td><input type='number' value='" + v + "' data-index='" + index + "' data-field='" + field + "'" + minAttr + stepAttr + " oninput='aggiornaCampo(event)'></td>";
}

function aggiornaTabellaArticoli(){
  var tbody = document.querySelector("#articoli-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];

    var lordo = n(a.prezzoLordo);
    var netto = calcNetto(a);

    var q = clampMin(n(a.quantita), 1);

    // servizi (interni, NON mostrati)
    var serv = n(a.costoTrasporto) + n(a.costoInstallazione);

    // prezzo riv con margine
    var mRiv = getMargineRiv(a);
    var prezzoRiv = calcPrezzoConMargine(netto, mRiv);

    var totRiv = roundTwo((prezzoRiv + serv) * q);

    var vend = n(a.venduto);
    var diff = roundTwo(vend - totRiv);

    var tr = createEl("tr");
    tr.innerHTML =
      "<td>" + esc(a.codice) + "</td>" +
      "<td style='text-align:left'>" + esc(a.descrizione) + "</td>" +
      "<td>" + lordo.toFixed(2) + "€</td>" +
      tdInp(i, "sconto", n(a.sconto), 0, "0.01") +
      tdInp(i, "sconto2", n(a.sconto2), 0, "0.01") +
      tdInp(i, "margine", n(a.margine), 0, "0.01") +
      "<td>" + netto.toFixed(2) + "€</td>" +
      tdInp(i, "quantita", q, 1, "1") +
      "<td><b>" + totRiv.toFixed(2) + "€</b></td>" +
      tdInp(i, "venduto", vend, 0, "0.01") +
      "<td>" + diff.toFixed(2) + "€</td>" +
      "<td><button type='button' onclick='rimuoviArticolo(" + i + ")'>Rimuovi</button></td>";

    tbody.appendChild(tr);
  }
}

function aggiornaCampo(event){
  var input = event.target;
  var idx = parseInt(input.getAttribute("data-index"), 10);
  var field = input.getAttribute("data-field");
  if (isNaN(idx) || !field) return;

  var val = n(input.value);

  if ((field==="sconto" || field==="sconto2" || field==="margine") && val < 0) val = 0;
  if (field==="quantita" && val < 1) val = 1;

  articoliAggiunti[idx][field] = val;

  aggiornaTabellaArticoli();
  aggiornaTotali();
  aggiornaBoxNoleggio && aggiornaBoxNoleggio();
}

function rimuoviArticolo(i){
  articoliAggiunti.splice(i, 1);
  aggiornaTabellaArticoli();
  aggiornaTotali();
  aggiornaBoxNoleggio && aggiornaBoxNoleggio();
}

// ===============================
// Totali (servizi inclusi ma non mostrati separati)
// ===============================
function aggiornaTotali(){
  var totNetto = 0;
  var totRiv = 0;
  var totVend = 0;
  var totDiff = 0;

  for (var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];
    var q = clampMin(n(a.quantita), 1);

    var netto = calcNetto(a);
    var prezzoRiv = calcPrezzoConMargine(netto, getMargineRiv(a));

    var serv = n(a.costoTrasporto) + n(a.costoInstallazione); // inclusi
    var totRigaRiv = roundTwo((prezzoRiv + serv) * q);

    var vend = n(a.venduto);
    var diff = roundTwo(vend - totRigaRiv);

    totNetto += netto * q;
    totRiv += totRigaRiv;
    totVend += vend;
    totDiff += diff;
  }

  var holder = byId("totaleGenerale");
  if (!holder) return;

  holder.innerHTML =
    "<strong>Totale Netto (dopo sconti):</strong> " + roundTwo(totNetto).toFixed(2) + "€<br>" +
    "<strong>Totale Preventivo Rivenditore:</strong> " + roundTwo(totRiv).toFixed(2) + "€<br>" +
    "<strong>Totale Venduto (se compilato):</strong> " + roundTwo(totVend).toFixed(2) + "€<br>" +
    "<strong>Totale Differenza:</strong> " + roundTwo(totDiff).toFixed(2) + "€";
}

// ===============================
// Aggiunta manuale (servizi NON visibili: li settiamo a 0 di default)
// ===============================
function mostraFormArticoloManuale(){
  var tbody = document.querySelector("#articoli-table tbody");
  if (!tbody) return;
  if (byId("manual-input-row")) return;

  var tr = createEl("tr");
  tr.id = "manual-input-row";
  tr.innerHTML =
    "<td><input type='text' id='manualCodice' placeholder='Codice'></td>" +
    "<td><input type='text' id='manualDescrizione' placeholder='Descrizione'></td>" +
    "<td><input type='number' id='manualPrezzo' placeholder='€' step='0.01'></td>" +
    "<td><input type='number' id='manualSconto1' placeholder='%' value='0' step='0.01'></td>" +
    "<td><input type='number' id='manualSconto2' placeholder='%' value='0' step='0.01'></td>" +
    "<td><input type='number' id='manualMargine' placeholder='%' value='0' step='0.01'></td>" +
    "<td><span id='manualNetto'>—</span></td>" +
    "<td><input type='number' id='manualQuantita' placeholder='1' value='1' min='1'></td>" +
    "<td><span id='manualTotRiv'>—</span></td>" +
    "<td><input type='number' id='manualVenduto' placeholder='€' value='0' step='0.01'></td>" +
    "<td><span id='manualDiff'>—</span></td>" +
    "<td><button type='button' onclick='aggiungiArticoloManuale()'>✅</button> <button type='button' onclick='annullaArticoloManuale()'>❌</button></td>";

  tbody.appendChild(tr);

  ["manualPrezzo","manualSconto1","manualSconto2","manualMargine","manualQuantita","manualVenduto"].forEach(function(id){
    byId(id).addEventListener("input", calcolaRigaManuale, false);
  });

  calcolaRigaManuale();
}

function calcolaRigaManuale(){
  var prezzoLordo = n(byId("manualPrezzo").value);
  var s1 = n(byId("manualSconto1").value);
  var s2 = n(byId("manualSconto2").value);
  var m = n(byId("manualMargine").value);
  var q = clampMin(n(byId("manualQuantita").value), 1);
  var vend = n(byId("manualVenduto").value);

  var netto = roundTwo(prezzoLordo * (1 - s1/100) * (1 - s2/100));
  var mEff = (m > 0) ? m : n(byId("margineRivDefault")?.value || 0);
  var prezzoRiv = calcPrezzoConMargine(netto, mEff);

  // servizi manuali nascosti => 0 (ma puoi cambiarli in codice se vuoi)
  var serv = 0;

  var totRiv = roundTwo((prezzoRiv + serv) * q);
  var diff = roundTwo(vend - totRiv);

  byId("manualNetto").textContent = netto.toFixed(2) + "€";
  byId("manualTotRiv").textContent = totRiv.toFixed(2) + "€";
  byId("manualDiff").textContent = diff.toFixed(2) + "€";
}

function aggiungiArticoloManuale(){
  var nuovo = {
    codice: (byId("manualCodice").value || "").trim(),
    descrizione: (byId("manualDescrizione").value || "").trim(),
    prezzoLordo: n(byId("manualPrezzo").value),
    sconto: n(byId("manualSconto1").value),
    sconto2: n(byId("manualSconto2").value),
    margine: n(byId("manualMargine").value),
    costoTrasporto: 0,        // nascosti
    costoInstallazione: 0,    // nascosti
    quantita: clampMin(n(byId("manualQuantita").value), 1),
    venduto: n(byId("manualVenduto").value)
  };

  articoliAggiunti.push(nuovo);
  annullaArticoloManuale();

  aggiornaTabellaArticoli();
  aggiornaTotali();
  aggiornaBoxNoleggio && aggiornaBoxNoleggio();
}

function annullaArticoloManuale(){
  var row = byId("manual-input-row");
  if (row && row.parentNode) row.parentNode.removeChild(row);
}
// ===============================
// Report TXT / WhatsApp (SERVIZI NASCOSTI)
// ===============================
function generaReportTesto(includeMargine){
  var report = includeMargine
    ? "Report Articoli (Rivenditore - con Margine)\n\n"
    : "Report Articoli (Netto - senza Margine)\n\n";

  var tot = 0;

  for (var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];
    var q = clampMin(n(a.quantita), 1);

    var lordo = n(a.prezzoLordo);
    var s1 = n(a.sconto);
    var s2 = n(a.sconto2);
    var netto = calcNetto(a);

    // servizi interni ma NON mostrati
    var serv = n(a.costoTrasporto) + n(a.costoInstallazione);

    var linea = 0;

    if (includeMargine){
      var prezzoRiv = calcPrezzoConMargine(netto, getMargineRiv(a));
      linea = (prezzoRiv + serv) * q; // inclusi
    } else {
      linea = (netto + serv) * q; // inclusi
    }

    linea = roundTwo(linea);
    tot += linea;

    report += (i+1) + ". " + (a.codice || "") + " — " + (a.descrizione || "") + "\n";
    report += "Lordo: " + lordo.toFixed(2) + "€ | S1: " + s1.toFixed(2) + "% | S2: " + s2.toFixed(2) + "%\n";
    report += "Netto: " + netto.toFixed(2) + "€ | Q.tà: " + q + "\n";
    if (includeMargine) report += "Margine%: " + getMargineRiv(a).toFixed(2) + "\n";
    report += "Totale Riga: " + linea.toFixed(2) + "€\n\n";
  }

  report += "TOTALE: " + roundTwo(tot).toFixed(2) + "€\n";
  return report;
}

function shareWhatsApp(text){
  var appUrl = "whatsapp://send?text=" + encodeURIComponent(text);
  var webUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(text);
  setTimeout(function(){ window.open(webUrl, "_blank"); }, 800);
  window.location = appUrl;
}

function openText(content){
  var w = window.open("", "_blank");
  if (!w) { alert("Popup bloccato: abilita l'apertura finestre o usa Safari."); return; }
  w.document.open();
  w.document.write("<!doctype html><html><head><meta charset='utf-8'><title>TXT</title></head>" +
                   "<body style='font-family:monospace;white-space:pre-wrap;padding:12px;'>" +
                   esc(content) +
                   "</body></html>");
  w.document.close();
}

function inviaReportWhatsApp(){
  shareWhatsApp(generaReportTesto(true));
}

function generaTXTReport(){
  openText(generaReportTesto(true));
}

function inviaReportWhatsAppSenzaMargine(){
  shareWhatsApp(generaReportTesto(false));
}

function generaTXTReportSenzaMargine(){
  openText(generaReportTesto(false));
}

// ===============================
// Preventivi stampabili (Riv / Cliente Finale) — SERVIZI INCLUSI MA NON MOSTRATI
// ===============================
function apriPreventivo(variant){
  var mostraIVA = byId("preventivoMostraIVA") && byId("preventivoMostraIVA").checked;
  var mostraUnit = byId("preventivoPrezziUnitari") && byId("preventivoPrezziUnitari").checked;
  var ivaPerc = n(byId("ivaPerc") ? byId("ivaPerc").value : 22);

  var titolo = (variant === 'cli') ? "Preventivo Cliente Finale" : "Preventivo Rivenditore";
  var margineCli = getMargineCli();
  var ana = getAnagraficaForVariant(variant);

  var rowsHtml = "";
  var tot = 0;

  for (var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];
    var q = clampMin(n(a.quantita), 1);

    var lordo = n(a.prezzoLordo);
    var s1 = n(a.sconto);
    var s2 = n(a.sconto2);

    var netto = calcNetto(a);

    // servizi: inclusi ma NON visibili
    var serv = n(a.costoTrasporto) + n(a.costoInstallazione);

    var prezzoUnit = 0;
    if (variant === 'cli'){
      prezzoUnit = calcPrezzoConMargine(netto, margineCli);
    } else {
      prezzoUnit = calcPrezzoConMargine(netto, getMargineRiv(a));
    }

    var scontoTxt = "";
    if (variant === 'cli'){
      var sInv = calcScontoClientePerc(lordo, prezzoUnit, serv);
      scontoTxt = sInv.toFixed(2) + "%";
    } else {
      scontoTxt = s1.toFixed(2) + "% + " + s2.toFixed(2) + "%";
    }

    var riga = roundTwo((prezzoUnit + serv) * q); // servizi inclusi nel totale riga
    tot += riga;

    rowsHtml += "<tr>";
    rowsHtml += "<td>" + esc(a.codice) + "</td>";
    rowsHtml += "<td style='text-align:left'>" + esc(a.descrizione) + "</td>";
    rowsHtml += "<td>" + q + "</td>";
    rowsHtml += "<td>" + lordo.toFixed(2) + "€</td>";
    rowsHtml += "<td>" + esc(scontoTxt) + "</td>";
    rowsHtml += "<td>" + netto.toFixed(2) + "€</td>";
    if (mostraUnit) rowsHtml += "<td>" + prezzoUnit.toFixed(2) + "€</td>";
    rowsHtml += "<td><b>" + riga.toFixed(2) + "€</b></td>";
    rowsHtml += "</tr>";
  }

  tot = roundTwo(tot);
  var imp = tot;
  var iva = mostraIVA ? roundTwo(imp * (ivaPerc/100)) : 0;
  var totIva = mostraIVA ? roundTwo(imp + iva) : imp;

  var html = "";
  html += "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>" + esc(titolo) + "</title>";
  html += "<style>";
  html += "body{font-family:Arial;margin:18px;color:#111}";
  html += "h1{margin:0 0 6px 0;font-size:20px}";
  html += ".sub{color:#444;margin-bottom:10px}";
  html += ".box{border:1px solid #e5e7eb;border-radius:10px;padding:10px;background:#fafafa;margin:10px 0}";
  html += "table{width:100%;border-collapse:collapse;margin-top:10px}";
  html += "th,td{border:1px solid #ddd;padding:8px;text-align:center;font-size:12px}";
  html += "th{background:#f3f5f7}";
  html += ".tot{margin-top:12px;font-size:14px;line-height:1.6}";
  html += ".btn{margin-top:14px;display:inline-block;padding:10px 12px;border:1px solid #ccc;background:#f8f8f8;cursor:pointer}";
  html += "@media print{.btn{display:none}}";
  html += "</style></head><body>";

  html += "<h1>" + esc(titolo) + "</h1>";
  html += "<div class='sub'>Generato da CSVXpressGold — " + new Date().toLocaleString() + "</div>";

  // Anagrafica
  var hasAny = (ana.azienda||ana.referente||ana.indirizzo||ana.email||ana.cell||ana.piva||ana.cf||ana.note);
  if (hasAny){
    html += "<div class='box'>";
    html += "<div style='font-weight:700;margin-bottom:6px'>Anagrafica (" + esc(ana._label || "Dati") + ")</div>";
    if (ana.azienda)   html += "<div><b>Azienda:</b> " + esc(ana.azienda) + "</div>";
    if (ana.referente) html += "<div><b>Referente:</b> " + esc(ana.referente) + "</div>";
    if (ana.indirizzo) html += "<div><b>Indirizzo:</b> " + esc(ana.indirizzo) + "</div>";
    if (ana.email)     html += "<div><b>Email:</b> " + esc(ana.email) + "</div>";
    if (ana.cell)      html += "<div><b>Cellulare:</b> " + esc(ana.cell) + "</div>";
    if (ana.piva)      html += "<div><b>P.IVA:</b> " + esc(ana.piva) + "</div>";
    if (ana.cf)        html += "<div><b>C.F.:</b> " + esc(ana.cf) + "</div>";
    if (ana.note)      html += "<div><b>Note:</b> " + esc(ana.note) + "</div>";
    html += "</div>";
  }

  if (variant === 'cli'){
    html += "<div class='sub'><b>Margine Cliente Finale:</b> " + margineCli.toFixed(2) + "% — <b>Sconto mostrato:</b> inverso (" + esc(getScontoClienteMode()) + ")</div>";
  } else {
    html += "<div class='sub'><b>Margine Rivenditore:</b> per riga (o default " + n(byId('margineRivDefault') ? byId('margineRivDefault').value : 0).toFixed(2) + "%) — <b>Sconto mostrato:</b> S1 + S2</div>";
  }

  html += "<table><thead><tr>";
  html += "<th>Codice</th><th style='text-align:left'>Descrizione</th><th>Q.tà</th>";
  html += "<th>Lordo</th><th>Sconto</th><th>Netto</th>";
  if (mostraUnit) html += "<th>Prezzo Unit.</th>";
  html += "<th>Totale Riga</th>";
  html += "</tr></thead><tbody>" + rowsHtml + "</tbody></table>";

  html += "<div class='tot'>";
  html += "<div><b>Imponibile:</b> " + imp.toFixed(2) + "€</div>";
  if (mostraIVA) html += "<div><b>IVA (" + ivaPerc.toFixed(2) + "%):</b> " + iva.toFixed(2) + "€</div>";
  html += "<div style='font-size:18px;margin-top:6px'><b>TOTALE:</b> " + totIva.toFixed(2) + "€</div>";
  html += "</div>";

  // Box noleggio (opzionale)
  var showNol = byId("noleggioMostraNelPreventivo") && byId("noleggioMostraNelPreventivo").checked;
  if (showNol){
    var durSel = byId("noleggioDurata") ? byId("noleggioDurata").value : 24;
    var outN = calcolaNoleggio(imp, durSel);
    var showDettN = byId("noleggioMostraDettagli") && byId("noleggioMostraDettagli").checked;

    html += "<div class='box'>";
    html += "<div style='font-weight:700;margin-bottom:6px'>Noleggio Operativo (simulazione)</div>";
    html += "<div>Durata: <b>" + esc(String(durSel)) + " mesi</b></div>";
    html += "<div>Rata mensile: <b>" + formatNumberIT(outN.rata) + " €</b></div>";
    html += "<div>Spese contratto: <b>" + formatNumberIT(outN.spese) + " €</b></div>";
    if (showDettN){
      html += "<div>Costo giornaliero: <b>" + formatNumberIT(outN.giorno) + " €</b> — Costo orario: <b>" + formatNumberIT(outN.ora) + " €</b></div>";
      html += "<div style='margin-top:6px;color:#444'>Spese incasso RID: 4,00 € al mese</div>";
    }
    html += "</div>";
  }

  html += "<button class='btn' onclick='window.print()'>Stampa / Salva PDF</button>";
  html += "</body></html>";

  var w = window.open("", "_blank");
  if (!w) { alert("Popup bloccato: abilita l'apertura finestre o usa Safari."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ===============================
// NOLEGGIO (coeff + spese)
// ===============================
function formatNumberIT(value) {
  value = (typeof value === "number") ? value : n(value);
  try {
    return value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch(e) {
    return value.toFixed(2).replace('.', ',');
  }
}

function calcolaSpeseContratto(importo) {
  if (importo < 5001) return 75;
  if (importo < 10001) return 100;
  if (importo < 25001) return 150;
  if (importo < 50001) return 225;
  return 300;
}

function calcolaCanoniPerDurate(importo) {
  var coefficienti = {
    5000:   { 12: 0.081123, 18: 0.058239, 24: 0.045554, 36: 0.032359, 48: 0.025445, 60: 0.021358 },
    15000:  { 12: 0.081433, 18: 0.058341, 24: 0.045535, 36: 0.032207, 48: 0.025213, 60: 0.021074 },
    25000:  { 12: 0.081280, 18: 0.058195, 24: 0.045392, 36: 0.032065, 48: 0.025068, 60: 0.020926 },
    50000:  { 12: 0.080770, 18: 0.057710, 24: 0.044915, 36: 0.031592, 48: 0.024588, 60: 0.020437 },
    100000: { 12: 0.080744, 18: 0.057686, 24: 0.044891, 36: 0.031568, 48: 0.024564, 60: 0.020413 }
  };

  var keys = [5000,15000,25000,50000,100000];
  var fascia = 100000;
  for (var i=0;i<keys.length;i++){
    if (importo <= keys[i]) { fascia = keys[i]; break; }
  }

  var result = {};
  [12,18,24,36,48,60].forEach(function(mesi){
    result[mesi] = importo * coefficienti[fascia][mesi];
  });
  return result;
}

function calcolaNoleggio(importoImponibile, durataMesi){
  var importo = n(importoImponibile);
  durataMesi = parseInt(durataMesi, 10) || 24;

  if (!importo || importo <= 0) {
    return { rata: 0, spese: 0, giorno: 0, ora: 0, canoni: null };
  }

  var canoni = calcolaCanoniPerDurate(importo);
  var rata = canoni[durataMesi] || 0;
  var spese = calcolaSpeseContratto(importo);

  var giorno = rata / 22;
  var ora = giorno / 8;

  return { rata: rata, spese: spese, giorno: giorno, ora: ora, canoni: canoni };
}

function getTotaleImponibileDaArticoli(variant){
  var tot = 0;
  for (var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];
    var q = clampMin(n(a.quantita), 1);
    var netto = calcNetto(a);

    var prezzoUnit = (variant === 'cli')
      ? calcPrezzoConMargine(netto, getMargineCli())
      : calcPrezzoConMargine(netto, getMargineRiv(a));

    var serv = n(a.costoTrasporto) + n(a.costoInstallazione);
    tot += roundTwo((prezzoUnit + serv) * q);
  }
  return roundTwo(tot);
}

function aggiornaBoxNoleggio(){
  var dur = byId("noleggioDurata");
  if (!dur) return;

  var imponibile = getTotaleImponibileDaArticoli('cli'); // live cliente finale
  var out = calcolaNoleggio(imponibile, dur.value);

  var elR = byId("noleggioRata");
  var elS = byId("noleggioSpese");
  var elDH = byId("noleggioDayHour");

  if (!imponibile || imponibile <= 0){
    if (elR) elR.textContent = "—";
    if (elS) elS.textContent = "—";
    if (elDH) elDH.textContent = "—";
    return;
  }

  if (elR) elR.textContent = formatNumberIT(out.rata) + " € / mese";
  if (elS) elS.textContent = formatNumberIT(out.spese) + " €";

  var showDett = byId("noleggioMostraDettagli") && byId("noleggioMostraDettagli").checked;
  if (elDH){
    elDH.textContent = showDett
      ? (formatNumberIT(out.giorno) + " €/giorno — " + formatNumberIT(out.ora) + " €/ora")
      : "—";
  }
}

function scaricaNoleggioTXT(){
  var imponibile = getTotaleImponibileDaArticoli('cli');
  if (!imponibile || imponibile <= 0){
    alert("Aggiungi almeno un articolo prima di generare il TXT noleggio.");
    return;
  }

  var canoni = calcolaCanoniPerDurate(imponibile);
  var speseContratto = calcolaSpeseContratto(imponibile);

  var testo = "";
  testo += "PREVENTIVO DI NOLEGGIO OPERATIVO BCC\n";
  testo += "--------------------------------------\n\n";
  testo += "Importo (imponibile): " + formatNumberIT(imponibile) + " €\n\n";
  testo += "CANONI MENSILI DISPONIBILI:\n";
  testo += "12 mesi: " + formatNumberIT(canoni[12]) + " €\n";
  testo += "18 mesi: " + formatNumberIT(canoni[18]) + " €\n";
  testo += "24 mesi: " + formatNumberIT(canoni[24]) + " €\n";
  testo += "36 mesi: " + formatNumberIT(canoni[36]) + " €\n";
  testo += "48 mesi: " + formatNumberIT(canoni[48]) + " €\n";
  testo += "60 mesi: " + formatNumberIT(canoni[60]) + " €\n";
  testo += "\n\nDETTAGLI CONTRATTUALI:\n";
  testo += "Spese di contratto: " + formatNumberIT(speseContratto) + " €\n";
  testo += "Spese incasso RID: 4,00 € al mese\n\n";
  testo += "BENEFICI FISCALI:\n";
  testo += "- Canone interamente deducibile.\n";
  testo += "- Il bene non entra nei cespiti.\n";
  testo += "- Nessuna incidenza su IRAP.\n\n";
  testo += "BENEFICI FINANZIARI:\n";
  testo += "- Non è un finanziamento.\n";
  testo += "- Non impegna le linee di credito.\n";
  testo += "- Non è un bene da ammortizzare.\n\n";

  try {
    var blob = new Blob([testo], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "preventivo_noleggio_" + Math.round(imponibile) + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch(e) {
    openText(testo);
  }
}

// ===============================
// BOOTSTRAP (ultimo) — forza servizi nascosti
// ===============================
document.addEventListener("DOMContentLoaded", function(){
  setupServiziHidden();

  // upload + ricerca listino
  var f = byId("csvFileInput"); if (f) f.addEventListener("change", handleCSVUpload, false);
  var s = byId("searchListino"); if (s) s.addEventListener("input", aggiornaListinoSelect, false);

  // bottoni
  var b1 = byId("btnAddFromListino"); if (b1) b1.addEventListener("click", aggiungiArticoloDaListino, false);
  var b2 = byId("btnManual"); if (b2) b2.addEventListener("click", mostraFormArticoloManuale, false);

  var wa = byId("btnWA"); if (wa) wa.addEventListener("click", inviaReportWhatsApp, false);
  var tx = byId("btnTXT"); if (tx) tx.addEventListener("click", generaTXTReport, false);

  var wa2 = byId("btnWASenzaMargine"); if (wa2) wa2.addEventListener("click", inviaReportWhatsAppSenzaMargine, false);
  var tx2 = byId("btnTXTSenzaMargine"); if (tx2) tx2.addEventListener("click", generaTXTReportSenzaMargine, false);

  var pr = byId("btnPrevRiv"); if (pr) pr.addEventListener("click", function(){ apriPreventivo('riv'); }, false);
  var pc = byId("btnPrevCli"); if (pc) pc.addEventListener("click", function(){ apriPreventivo('cli'); }, false);

  // toggle costi: se disattivi, azzera servizi (anche se non visibili)
  var tg = byId("toggleCosti");
  if (tg){
    tg.addEventListener("change", function(){
      autoPopolaCosti = tg.checked;

      for (var i=0;i<articoliAggiunti.length;i++){
        var a = articoliAggiunti[i];
        if (!autoPopolaCosti){
          a.costoTrasporto = 0;
          a.costoInstallazione = 0;
        } else {
          var base = trovaInListino(a.codice);
          if (base){
            a.costoTrasporto = base.costoTrasporto || 0;
            a.costoInstallazione = base.costoInstallazione || 0;
          }
        }
      }

      aggiornaTabellaArticoli();
      aggiornaTotali();
      aggiornaBoxNoleggio();
    }, false);
  }

  // noleggio
  var nd = byId("noleggioDurata"); if (nd) nd.addEventListener("change", aggiornaBoxNoleggio, false);
  var nt = byId("btnNoleggioTXT"); if (nt) nt.addEventListener("click", scaricaNoleggioTXT, false);

  var mcli = byId("margineCliDefault"); if (mcli) mcli.addEventListener("input", aggiornaBoxNoleggio, false);
  var mriv = byId("margineRivDefault"); if (mriv) mriv.addEventListener("input", aggiornaBoxNoleggio, false);

  var radios = document.getElementsByName("scontoClienteMode");
  for (var r=0;r<radios.length;r++){
    radios[r].addEventListener("change", aggiornaBoxNoleggio, false);
  }

  // anagrafica
  bindAnagraficaAutosave();
  var bs = byId("btnSaveAnagrafica"); if (bs) bs.addEventListener("click", saveAnagrafica, false);
  var bc = byId("btnClearAnagrafica");
  if (bc) bc.addEventListener("click", function(){
    try{ localStorage.removeItem(ANAG_KEY); }catch(e){}
    loadAnagrafica(true);
  }, false);

  // init
  aggiornaTabellaArticoli();
  aggiornaTotali();
  aggiornaBoxNoleggio();
});
