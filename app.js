/* TMR Team - app interna TMR Village */
(function () {
"use strict";

var REPARTI = [
  { id: "hospitality", nome: "Hospitality" },
  { id: "negozio", nome: "Negozio" },
  { id: "magazzino", nome: "Magazzino" },
  { id: "amministrazione", nome: "Amministrazione" },
  { id: "online", nome: "Team online" }
];
var RUOLI = { dipendente: "Dipendente", responsabile: "Responsabile", admin: "Amministratore" };
var STATI = { attesa: "In attesa", approvato: "Approvato", rifiutato: "Rifiutato" };
var VISTE = ["avvisi", "turni", "permessi", "chat", "persone"];

var S = {
  me: null, persone: [], avvisi: [], turni: [], permessi: [], msg: [],
  vista: "avvisi", canale: "tutti", sett: 0, canaleRT: null, caricato: false
};
var sb = null;

/* ---------- utilita' ---------- */
function $(id) { return document.getElementById(id); }
function h(tag, attrs, kids) {
  var e = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    var v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === "text") e.textContent = v;
    else if (k === "on") for (var ev in v) e.addEventListener(ev, v[ev]);
    else e.setAttribute(k, v === true ? "" : v);
  }
  (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return e;
}
function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
function nomeRep(id) { if (id === "tutti") return "Tutta l'azienda"; var r = REPARTI.filter(function (x) { return x.id === id; })[0]; return r ? r.nome : id; }
function pillRep(id) { return h("span", { "class": "pill dot rep-" + id, text: nomeRep(id) }); }
function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function daIso(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function lunedi(off, base) { var d = base ? new Date(base) : new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7 + (off || 0) * 7); return d; }
function fData(s) { return daIso(s).toLocaleDateString("it-IT", { day: "numeric", month: "short" }); }
function fQuando(ts) {
  var d = new Date(ts), oggi = new Date();
  if (d.toDateString() === oggi.toDateString()) return "oggi " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function ora(t) { return String(t || "").slice(0, 5); }
function nomeDi(id) {
  if (S.me && id === S.me.id) return "Tu";
  var p = S.persone.filter(function (x) { return x.id === id; })[0];
  return p ? p.nome : "Ex collega";
}
function isResp() { return S.me && S.me.approvato && (S.me.ruolo === "responsabile" || S.me.ruolo === "admin"); }
function isAdmin() { return S.me && S.me.approvato && S.me.ruolo === "admin"; }
var tToast;
function toast(t) { var e = $("toast"); e.textContent = t; e.hidden = false; clearTimeout(tToast); tToast = setTimeout(function () { e.hidden = true; }, 3500); }
function base() { return location.origin + location.pathname.replace(/index\.html$/, ""); }

function errore(err) {
  var m = (err && (err.message || err.error_description)) || "";
  if (/Invalid login credentials/i.test(m)) return "Email o password sbagliate.";
  if (/already registered|already exists/i.test(m)) return "Esiste già un account con questa email: usa \"Accedi\".";
  if (/Email not confirmed/i.test(m)) return "Devi prima confermare l'email: apri il link che ti abbiamo mandato.";
  if (/rate limit|too many|security purposes/i.test(m)) return "Troppi tentativi. Riprova tra qualche minuto.";
  if (/Password should be|weak/i.test(m)) return "La password è troppo debole: usa almeno 8 caratteri, con lettere e numeri.";
  if (/invalid.*email|valid email/i.test(m)) return "L'indirizzo email non è valido.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Nessuna connessione. Controlla internet e riprova.";
  if (/row-level security|permission|42501/i.test(m)) return "Non hai il permesso per questa operazione.";
  return "Qualcosa non ha funzionato. Riprova." + (m ? " (" + m + ")" : "");
}
function opzioniReparti(sel, extra) {
  sel.textContent = "";
  (extra || []).forEach(function (o) { sel.appendChild(h("option", { value: o[0], text: o[1] })); });
  REPARTI.forEach(function (r) { sel.appendChild(h("option", { value: r.id, text: r.nome })); });
}
function mostra(idVista) {
  ["v-avvio", "v-accesso", "v-attesa", "v-app"].forEach(function (v) { $(v).hidden = v !== idVista; });
}
function occupato(form, si) { form.querySelectorAll("button[type=submit]").forEach(function (b) { b.disabled = si; }); }

/* ---------- avvio ---------- */
function avvio() {
  var C = window.TMR_CONFIG || {};
  if (!C.SUPABASE_URL || !C.SUPABASE_KEY) { $("avvio-msg").textContent = "L'app non è ancora collegata all'archivio dati. Inserire indirizzo e chiave di Supabase nel file config.js."; return; }
  if (!window.supabase || !window.supabase.createClient) { $("avvio-msg").textContent = "Impossibile caricare l'app. Controlla la connessione e riapri."; return; }
  sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  preparaAccesso();
  preparaApp();

  var recupero = /type=recovery/.test(location.hash);
  sb.auth.onAuthStateChange(function (event, session) {
    setTimeout(function () {
      if (event === "PASSWORD_RECOVERY" || (recupero && session)) { recupero = false; mostraForm("f-nuova"); mostra("v-accesso"); return; }
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
      gestisciSessione(session);
    }, 0);
  });
}

var ultimaSessione = null;
function gestisciSessione(session) {
  var uid = session && session.user ? session.user.id : null;
  if (!uid) { ultimaSessione = null; staccaTempoReale(); S.me = null; mostraForm("f-entra"); mostra("v-accesso"); return; }
  if (uid === ultimaSessione && S.caricato) return;
  ultimaSessione = uid;
  caricaMe(uid, 0);
}
function caricaMe(uid, tentativo) {
  sb.from("persone").select("*").eq("id", uid).maybeSingle().then(function (r) {
    if (r.error) { mostra("v-avvio"); $("avvio-msg").textContent = errore(r.error); return; }
    if (!r.data && tentativo < 3) { setTimeout(function () { caricaMe(uid, tentativo + 1); }, 800); return; }
    S.me = r.data;
    if (!S.me) {
      $("att-nome").textContent = "";
      document.querySelector("#v-attesa p").textContent = "Il tuo account non è abilitato. Chiedi a un responsabile di approvarti di nuovo.";
      mostra("v-attesa"); return;
    }
    if (!S.me.approvato) { $("att-nome").textContent = S.me.nome; mostra("v-attesa"); return; }
    entraNellApp();
  });
}

/* ---------- accesso ---------- */
function mostraForm(id) {
  ["f-entra", "f-reg", "f-reset", "f-nuova"].forEach(function (f) { $(f).hidden = f !== id; });
  $("seg-entra").setAttribute("aria-selected", String(id === "f-entra"));
  $("seg-reg").setAttribute("aria-selected", String(id === "f-reg"));
  document.querySelector("#v-accesso .seg").hidden = id === "f-nuova" || id === "f-reset";
  avvisoAuth("");
}
function avvisoAuth(t, tipo) { var e = $("auth-msg"); e.hidden = !t; e.textContent = t; e.className = "msgbox " + (tipo || "err"); }

function preparaAccesso() {
  opzioniReparti($("r-reparto"));
  $("seg-entra").onclick = function () { mostraForm("f-entra"); };
  $("seg-reg").onclick = function () { mostraForm("f-reg"); };
  $("b-dimenticata").onclick = function () { $("p-email").value = $("e-email").value; mostraForm("f-reset"); };
  $("b-torna").onclick = function () { mostraForm("f-entra"); };

  $("f-entra").onsubmit = function (e) {
    e.preventDefault(); var f = e.target; occupato(f, true); avvisoAuth("");
    sb.auth.signInWithPassword({ email: $("e-email").value.trim(), password: $("e-pass").value }).then(function (r) {
      occupato(f, false);
      if (r.error) avvisoAuth(errore(r.error));
    });
  };
  $("f-reg").onsubmit = function (e) {
    e.preventDefault(); var f = e.target; occupato(f, true); avvisoAuth("");
    sb.auth.signUp({
      email: $("r-email").value.trim(), password: $("r-pass").value,
      options: { data: { nome: $("r-nome").value.trim(), reparto: $("r-reparto").value }, emailRedirectTo: base() }
    }).then(function (r) {
      occupato(f, false);
      if (r.error) { avvisoAuth(errore(r.error)); return; }
      if (!r.data.session) { mostraForm("f-entra"); avvisoAuth("Account creato. Ti abbiamo mandato un'email: apri il link per confermare, poi accedi.", "info"); }
    });
  };
  $("f-reset").onsubmit = function (e) {
    e.preventDefault(); var f = e.target; occupato(f, true);
    sb.auth.resetPasswordForEmail($("p-email").value.trim(), { redirectTo: base() }).then(function (r) {
      occupato(f, false);
      if (r.error) avvisoAuth(errore(r.error));
      else { mostraForm("f-entra"); avvisoAuth("Se l'email è registrata, riceverai un link per scegliere una nuova password.", "info"); }
    });
  };
  $("f-nuova").onsubmit = function (e) {
    e.preventDefault(); var f = e.target; occupato(f, true);
    sb.auth.updateUser({ password: $("n-pass").value }).then(function (r) {
      occupato(f, false);
      if (r.error) { avvisoAuth(errore(r.error)); return; }
      history.replaceState(null, "", base());
      toast("Password aggiornata");
      sb.auth.getSession().then(function (s) { ultimaSessione = null; gestisciSessione(s.data.session); });
    });
  };
  $("b-ricontrolla").onclick = function () { if (S.me || ultimaSessione) { var id = ultimaSessione; S.caricato = false; caricaMe(id, 3); } };
  $("b-esci2").onclick = esci;
}
function esci() { staccaTempoReale(); S.caricato = false; sb.auth.signOut(); }

/* ---------- app ---------- */
function preparaApp() {
  opzioniReparti($("av-reparto"), [["tutti", "Tutta l'azienda"]]);
  opzioniReparti($("t-filtro"), [["tutti", "Tutti i reparti"], ["miei", "Solo i miei turni"]]);
  $("t-filtro").value = ls("tmr-filtro-turni") || "tutti";

  document.querySelectorAll(".nav button").forEach(function (b) { b.onclick = function () { vai(b.dataset.v); }; });
  document.querySelectorAll("[data-chiudi]").forEach(function (b) { b.onclick = function () { $(b.dataset.chiudi).hidden = true; }; });
  $("b-esci").onclick = esci;

  // avvisi
  $("av-miei").checked = ls("tmr-avvisi-miei") === "1";
  $("av-miei").onchange = function () { ls("tmr-avvisi-miei", this.checked ? "1" : "0"); renderAvvisi(); };
  $("b-nuovo-avviso").onclick = function () { $("f-avviso").hidden = false; $("av-titolo").focus(); };
  $("f-avviso").onsubmit = function (e) {
    e.preventDefault(); var f = e.target; occupato(f, true);
    sb.from("avvisi").insert({ titolo: $("av-titolo").value.trim(), testo: $("av-testo").value.trim(), reparto: $("av-reparto").value, urgente: $("av-urgente").checked, autore: S.me.id })
      .then(function (r) { occupato(f, false); if (r.error) return toast(errore(r.error)); f.reset(); f.hidden = true; toast("Avviso pubblicato"); ricarica("avvisi"); });
  };

  // turni
  $("t-filtro").onchange = function () { ls("tmr-filtro-turni", this.value); renderTurni(); };
  $("tu-persona").onchange = repartiTurno;
  $("t-prec").onclick = function () { S.sett--; renderTurni(); };
  $("t-succ").onclick = function () { S.sett++; renderTurni(); };
  $("t-oggi").onclick = function () { S.sett = 0; renderTurni(); };
  $("b-nuovo-turno").onclick = function () { $("f-turno").hidden = false; $("tu-giorno").value = S.sett === 0 ? iso(new Date()) : iso(lunedi(S.sett)); };
  $("f-turno").onsubmit = function (e) {
    e.preventDefault(); var f = e.target;
    var p = S.persone.filter(function (x) { return x.id === $("tu-persona").value; })[0];
    if (!p) return toast("Scegli la persona.");
    if ($("tu-fine").value <= $("tu-inizio").value) return toast("L'orario di fine deve essere dopo l'inizio.");
    var giorni = [$("tu-giorno").value];
    if ($("tu-ripeti").checked) { var l = lunedi(0, daIso($("tu-giorno").value)); giorni = []; for (var i = 0; i < 6; i++) { var d = new Date(l); d.setDate(l.getDate() + i); giorni.push(iso(d)); } }
    var righe = giorni.map(function (g) { return { persona: p.id, nome: p.nome, reparto: $("tu-reparto").value || p.reparto, giorno: g, inizio: $("tu-inizio").value, fine: $("tu-fine").value, autore: S.me.id }; });
    occupato(f, true);
    sb.from("turni").insert(righe).then(function (r) { occupato(f, false); if (r.error) return toast(errore(r.error)); toast(righe.length > 1 ? "Turni salvati" : "Turno salvato"); $("tu-ripeti").checked = false; ricarica("turni"); });
  };

  // permessi
  var oggi = iso(new Date()); $("pe-dal").value = oggi; $("pe-al").value = oggi;
  $("pe-dal").onchange = function () { if ($("pe-al").value < this.value) $("pe-al").value = this.value; };
  $("pe-solo-attesa").onchange = renderPermessi;
  $("f-permesso").onsubmit = function (e) {
    e.preventDefault(); var f = e.target;
    if ($("pe-al").value < $("pe-dal").value) return toast("La data di fine è prima di quella di inizio.");
    occupato(f, true);
    sb.from("permessi").insert({ tipo: $("pe-tipo").value, dal: $("pe-dal").value, al: $("pe-al").value, nota: $("pe-nota").value.trim(), autore: S.me.id })
      .then(function (r) { occupato(f, false); if (r.error) return toast(errore(r.error)); $("pe-nota").value = ""; toast("Richiesta inviata"); ricarica("permessi"); });
  };

  // chat
  $("f-msg").onsubmit = function (e) {
    e.preventDefault(); var t = $("c-testo").value.trim(); if (!t) return;
    $("c-testo").value = "";
    sb.from("messaggi").insert({ canale: S.canale, testo: t, autore: S.me.id }).then(function (r) {
      if (r.error) { $("c-testo").value = t; return toast(errore(r.error)); }
      ricarica("messaggi");
    });
  };

  document.addEventListener("visibilitychange", function () { if (!document.hidden && S.caricato) ricaricaTutto(); });
}

function entraNellApp() {
  $("me-nome").textContent = S.me.nome;
  $("me-rep").textContent = mieiReparti().map(nomeRep).join(" + ") + (S.me.ruolo !== "dipendente" ? " · " + RUOLI[S.me.ruolo] : "");
  document.querySelectorAll(".solo-resp").forEach(function (e) { e.hidden = !isResp(); });
  document.querySelectorAll(".solo-admin").forEach(function (e) { e.hidden = !isAdmin(); });
  $("pe-titolo-lista").textContent = isResp() ? "Tutte le richieste" : "Le mie richieste";
  S.canale = ls("tmr-canale") || "tutti";
  mostra("v-app");
  var hv = (location.hash || "").replace("#", "");
  vai(VISTE.indexOf(hv) >= 0 ? hv : (ls("tmr-vista") || "avvisi"));
  S.caricato = true;
  ricaricaTutto();
  attaccaTempoReale();
  pannelloNotifiche();
}

function vai(v) {
  if (VISTE.indexOf(v) < 0 || (v === "persone" && !isAdmin())) v = "avvisi";
  S.vista = v; ls("tmr-vista", v);
  VISTE.forEach(function (x) { $("s-" + x).hidden = x !== v; });
  document.querySelectorAll(".nav button").forEach(function (b) { if (b.dataset.v === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (v === "avvisi") segnaVisto("avvisi");
  if (v === "chat") { segnaVisto("chat-" + S.canale); renderChat(true); }
  aggiornaPallini();
  window.scrollTo(0, 0);
}

/* ---------- dati ---------- */
var QUERY = {
  persone: function () { return sb.from("persone").select("*").order("nome"); },
  avvisi: function () { return sb.from("avvisi").select("*").order("creato_il", { ascending: false }).limit(200); },
  turni: function () { var d = new Date(); d.setDate(d.getDate() - 120); return sb.from("turni").select("*").gte("giorno", iso(d)).order("giorno").limit(3000); },
  permessi: function () { return sb.from("permessi").select("*").order("creato_il", { ascending: false }).limit(300); },
  messaggi: function () { return sb.from("messaggi").select("*").order("creato_il", { ascending: false }).limit(600); }
};
var CHIAVE = { persone: "persone", avvisi: "avvisi", turni: "turni", permessi: "permessi", messaggi: "msg" };
var attese = {};
function ricarica(t) {
  clearTimeout(attese[t]);
  attese[t] = setTimeout(function () {
    QUERY[t]().then(function (r) {
      if (r.error) return;
      S[CHIAVE[t]] = r.data || [];
      if (t === "persone") {
        var io = S.persone.filter(function (p) { return p.id === S.me.id; })[0];
        if (!io) { esci(); return; }
        var cambiato = io.ruolo !== S.me.ruolo || io.approvato !== S.me.approvato || io.reparto !== S.me.reparto || String(io.reparti_extra) !== String(S.me.reparti_extra);
        S.me = io;
        if (!io.approvato) { S.caricato = false; staccaTempoReale(); $("att-nome").textContent = io.nome; mostra("v-attesa"); return; }
        if (cambiato) { entraNellApp(); return; }
      }
      renderTutto();
    });
  }, 150);
}
function ricaricaTutto() { Object.keys(QUERY).forEach(ricarica); }

function attaccaTempoReale() {
  staccaTempoReale();
  S.canaleRT = sb.channel("tmr-team")
    .on("postgres_changes", { event: "*", schema: "public" }, function (p) { if (QUERY[p.table]) ricarica(p.table); })
    .subscribe();
  // rete di sicurezza: ricontrolla ogni 30 secondi
  S.timer = setInterval(function () { if (!document.hidden) ricaricaTutto(); }, 30000);
}
function staccaTempoReale() {
  if (S.canaleRT && sb) { sb.removeChannel(S.canaleRT); S.canaleRT = null; }
  clearInterval(S.timer);
}

function renderTutto() { renderAvvisi(); renderTurni(); renderPermessi(); renderCanali(); renderChat(); renderPersone(); aggiornaPallini(); }

/* ---------- pallini "nuovi" ---------- */
function visto(k) { return ls("tmr-visto-" + k) || ""; }
function segnaVisto(k) { ls("tmr-visto-" + k, new Date().toISOString()); }
function aggiornaPallini() {
  function pall(id, n) { var e = $(id); e.hidden = !n; e.textContent = n > 9 ? "9+" : String(n); }
  var va = visto("avvisi");
  pall("nd-avvisi", S.vista === "avvisi" ? 0 : S.avvisi.filter(function (a) { return a.creato_il > va && a.autore !== S.me.id && (a.reparto === "tutti" || nelMioReparto(a.reparto)); }).length);
  var nuoviChat = canaliMiei().filter(function (c) { return canaleHaNuovi(c.id) && !(S.vista === "chat" && S.canale === c.id); }).length;
  pall("nd-chat", nuoviChat);
  pall("nd-permessi", isResp() ? S.permessi.filter(function (p) { return p.stato === "attesa"; }).length : 0);
  pall("nd-persone", isAdmin() ? S.persone.filter(function (p) { return !p.approvato; }).length : 0);
}
function canaleHaNuovi(c) {
  var v = visto("chat-" + c);
  return S.msg.some(function (m) { return m.canale === c && m.creato_il > v && m.autore !== S.me.id; });
}

/* ---------- avvisi ---------- */
function bottoneElimina(tabella, id, etichetta) {
  return h("button", { "class": "btn ghost", type: "button", text: etichetta || "Elimina", on: { click: function () {
    var b = this;
    if (b.dataset.conferma !== "1") { b.dataset.conferma = "1"; b.textContent = "Confermi?"; setTimeout(function () { b.dataset.conferma = ""; b.textContent = etichetta || "Elimina"; }, 3000); return; }
    sb.from(tabella).delete().eq("id", id).then(function (r) { if (r.error) return toast(errore(r.error)); toast("Eliminato"); ricarica(tabella); });
  } } });
}
function renderAvvisi() {
  var box = $("l-avvisi"); box.textContent = "";
  var solo = $("av-miei").checked;
  var l = S.avvisi.filter(function (a) { return !solo || a.reparto === "tutti" || nelMioReparto(a.reparto); });
  if (!l.length) { box.appendChild(h("div", { "class": "empty", text: isResp() ? "Nessun avviso. Premi \"+ Nuovo avviso\" per pubblicare il primo." : "Nessun avviso per ora." })); return; }
  l.forEach(function (a) {
    box.appendChild(h("article", { "class": "item" + (a.urgente ? " urgente" : "") }, [
      h("div", { "class": "meta" }, [pillRep(a.reparto), a.urgente ? h("span", { "class": "pill tag-red", text: "Urgente" }) : null]),
      h("h3", { text: a.titolo }),
      h("p", { text: a.testo }),
      h("div", { "class": "meta" }, [h("span", { text: nomeDi(a.autore) + " · " + fQuando(a.creato_il) }), h("span", { "class": "grow" }), isResp() ? bottoneElimina("avvisi", a.id) : null])
    ]));
  });
}

/* ---------- turni ---------- */
function renderTurni() {
  var lun = lunedi(S.sett), dom = new Date(lun); dom.setDate(lun.getDate() + 6);
  $("t-titolo").textContent = "Turni " + fData(iso(lun)) + " – " + fData(iso(dom));
  var filtro = $("t-filtro").value, oggi = iso(new Date()), box = $("t-settimana");
  box.textContent = "";
  for (var i = 0; i < 7; i++) {
    var d = new Date(lun); d.setDate(lun.getDate() + i); var k = iso(d);
    var del = S.turni.filter(function (t) {
      if (t.giorno !== k) return false;
      if (filtro === "miei") return t.persona === S.me.id;
      return filtro === "tutti" || t.reparto === filtro;
    }).sort(function (a, b) { return a.inizio < b.inizio ? -1 : a.inizio > b.inizio ? 1 : (a.nome < b.nome ? -1 : 1); });
    var riga = h("div", { "class": "s" });
    if (!del.length) riga.appendChild(h("span", { "class": "small muted", text: "Nessun turno" }));
    del.forEach(function (t) {
      riga.appendChild(h("span", { "class": "shift" + (t.persona === S.me.id ? " mio" : ""), title: nomeRep(t.reparto) }, [
        h("i", { "class": "rep-" + t.reparto }),
        h("b", { text: t.persona === S.me.id ? "Tu" : t.nome }),
        h("time", { text: ora(t.inizio) + "–" + ora(t.fine) }),
        isResp() ? h("button", { type: "button", "aria-label": "Elimina turno", text: "×", on: { click: function () {
          sb.from("turni").delete().eq("id", t.id).then(function (r) { if (r.error) return toast(errore(r.error)); toast("Turno eliminato"); ricarica("turni"); });
        } } }) : null
      ]));
    });
    var nomeG = d.toLocaleDateString("it-IT", { weekday: "long" });
    box.appendChild(h("div", { "class": "day" + (k === oggi ? " oggi" : "") }, [
      h("div", { "class": "d" }, [nomeG.charAt(0).toUpperCase() + nomeG.slice(1), h("span", { text: fData(k) + (k === oggi ? " · oggi" : "") })]),
      riga
    ]));
  }
  // elenco persone per il modulo
  var sel = $("tu-persona"), prima = sel.value; sel.textContent = "";
  REPARTI.forEach(function (r) {
    var ps = S.persone.filter(function (p) { return p.approvato && p.reparto === r.id; });
    if (!ps.length) return;
    var g = h("optgroup", { label: r.nome });
    ps.forEach(function (p) { g.appendChild(h("option", { value: p.id, text: p.nome })); });
    sel.appendChild(g);
  });
  if (prima) sel.value = prima;
  repartiTurno();
}
function repartiTurno() {
  var p = S.persone.filter(function (x) { return x.id === $("tu-persona").value; })[0];
  var sel = $("tu-reparto"), prima = sel.value; sel.textContent = "";
  if (!p) return;
  var rr = [p.reparto].concat(p.reparti_extra || []);
  rr.forEach(function (r) { sel.appendChild(h("option", { value: r, text: nomeRep(r) })); });
  if (prima && rr.indexOf(prima) >= 0) sel.value = prima;
}

/* ---------- permessi ---------- */
function renderPermessi() {
  var box = $("l-permessi"); box.textContent = "";
  var l = S.permessi;
  if (isResp() && $("pe-solo-attesa").checked) l = l.filter(function (p) { return p.stato === "attesa"; });
  if (!l.length) { box.appendChild(h("div", { "class": "empty", text: "Nessuna richiesta." })); return; }
  l.forEach(function (p) {
    var persona = S.persone.filter(function (x) { return x.id === p.autore; })[0];
    var periodo = p.dal === p.al ? fData(p.dal) : "dal " + fData(p.dal) + " al " + fData(p.al);
    var decidi = function (stato) { return function () {
      sb.from("permessi").update({ stato: stato }).eq("id", p.id).then(function (r) { if (r.error) return toast(errore(r.error)); toast(stato === "approvato" ? "Richiesta approvata" : "Richiesta rifiutata"); ricarica("permessi"); });
    }; };
    var puoDecidere = isResp() && p.autore !== S.me.id || isAdmin();
    box.appendChild(h("article", { "class": "item" }, [
      h("div", { "class": "meta" }, [h("span", { "class": "pill st-" + p.stato, text: STATI[p.stato] }), persona ? pillRep(persona.reparto) : null]),
      h("h3", { text: (isResp() ? nomeDi(p.autore) + " · " : "") + p.tipo + " · " + periodo }),
      p.nota ? h("p", { text: p.nota }) : null,
      h("div", { "class": "meta" }, [
        h("span", { text: "Inviata " + fQuando(p.creato_il) }), h("span", { "class": "grow" }),
        puoDecidere && p.stato === "attesa" ? h("button", { "class": "btn ok small", type: "button", text: "Approva", on: { click: decidi("approvato") } }) : null,
        puoDecidere && p.stato === "attesa" ? h("button", { "class": "btn no small", type: "button", text: "Rifiuta", on: { click: decidi("rifiutato") } }) : null,
        puoDecidere && p.stato !== "attesa" ? h("button", { "class": "btn ghost", type: "button", text: "Rimetti in attesa", on: { click: decidi("attesa") } }) : null,
        (p.autore === S.me.id && p.stato === "attesa") || isResp() ? bottoneElimina("permessi", p.id, p.autore === S.me.id ? "Annulla richiesta" : "Elimina") : null
      ])
    ]));
  });
}

/* ---------- chat ---------- */
function mieiReparti() { return [S.me.reparto].concat(S.me.reparti_extra || []); }
function nelMioReparto(r) { return mieiReparti().indexOf(r) >= 0; }
function canaliMiei() { return [{ id: "tutti", nome: "Tutti" }].concat(REPARTI.filter(function (r) { return isAdmin() || nelMioReparto(r.id); })); }
function renderCanali() {
  var box = $("c-canali"); box.textContent = ""; if (!canaliMiei().some(function (c) { return c.id === S.canale; })) S.canale = "tutti";
  canaliMiei().forEach(function (c) {
    var nuovi = c.id !== S.canale && canaleHaNuovi(c.id);
    box.appendChild(h("button", { type: "button", "aria-pressed": String(S.canale === c.id), "class": nuovi ? "nuovi" : null, text: c.nome + (nelMioReparto(c.id) ? " ★" : (c.id !== "tutti" ? " · in silenzio" : "")), on: { click: function () {
      S.canale = c.id; ls("tmr-canale", c.id); segnaVisto("chat-" + c.id); renderCanali(); renderChat(true); aggiornaPallini();
    } } }));
  });
}
function renderChat(inFondo) {
  var box = $("c-msgs"); if (!box) return;
  var giu = inFondo || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.textContent = "";
  var spett = S.canale !== "tutti" && !nelMioReparto(S.canale);
  $("c-testo").disabled = spett; $("f-msg").querySelector("button").disabled = spett;
  $("c-testo").placeholder = spett ? "Sola lettura: stai guardando in silenzio" : "Scrivi in " + (S.canale === "tutti" ? "Tutti" : nomeRep(S.canale));
  var l = S.msg.filter(function (m) { return m.canale === S.canale; }).slice().reverse();
  if (!l.length) box.appendChild(h("div", { "class": "empty", text: "Ancora nessun messaggio in " + (S.canale === "tutti" ? "Tutti" : nomeRep(S.canale)) + "." }));
  var ultimoGiorno = "";
  l.forEach(function (m) {
    var g = new Date(m.creato_il).toDateString();
    if (g !== ultimoGiorno) { ultimoGiorno = g; box.appendChild(h("div", { "class": "small muted", style: "text-align:center", text: new Date(m.creato_il).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }) })); }
    var mio = m.autore === S.me.id;
    box.appendChild(h("div", { "class": "msg" + (mio ? " mio" : "") }, [
      h("span", { "class": "small muted", text: (mio ? "Tu" : nomeDi(m.autore)) + " · " + new Date(m.creato_il).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) }),
      h("div", { "class": "b", text: m.testo })
    ]));
  });
  if (giu) box.scrollTop = box.scrollHeight;
  if (S.vista === "chat") segnaVisto("chat-" + S.canale);
}

/* ---------- persone ---------- */
function renderPersone() {
  if (!isAdmin()) return;
  var box = $("l-persone"); box.textContent = "";
  var l = S.persone.slice().sort(function (a, b) { return (a.approvato - b.approvato) || (a.nome < b.nome ? -1 : 1); });
  l.forEach(function (p) {
    var io = p.id === S.me.id;
    function salva(campi, msg) { sb.from("persone").update(campi).eq("id", p.id).then(function (r) { if (r.error) return toast(errore(r.error)); toast(msg || "Salvato"); ricarica("persone"); }); }
    var selRep = h("select", { "aria-label": "Reparto di " + p.nome, on: { change: function () { salva({ reparto: this.value, reparti_extra: (p.reparti_extra || []).filter(function (x) { return x !== selRep.value; }) }); } } });
    opzioniReparti(selRep); selRep.value = p.reparto;
    var selRuolo = h("select", { "aria-label": "Ruolo di " + p.nome, disabled: io, on: { change: function () { salva({ ruolo: this.value }); } } });
    Object.keys(RUOLI).forEach(function (k) { selRuolo.appendChild(h("option", { value: k, text: RUOLI[k] })); });
    selRuolo.value = p.ruolo;
    box.appendChild(h("article", { "class": "item" + (!p.approvato ? " urgente" : "") }, [
      h("div", { "class": "meta" }, [!p.approvato ? h("span", { "class": "pill tag-red", text: "Da approvare" }) : h("span", { "class": "pill st-approvato", text: "Attivo" }), io ? h("span", { "class": "pill", text: "Sei tu" }) : null]),
      h("h3", { text: p.nome }),
      h("p", { "class": "small muted", text: (p.email || "") + " · iscritto " + fQuando(p.creato_il) }),
      h("div", { "class": "row" }, [h("label", null, ["Reparto principale", selRep]), h("label", null, ["Ruolo", selRuolo])]),
      h("div", { "class": "actions" }, [h("span", { "class": "small muted", text: "Anche in:" })].concat(REPARTI.filter(function (r) { return r.id !== p.reparto; }).map(function (r) {
        var extra = p.reparti_extra || [];
        return h("label", { "class": "check" }, [h("input", { type: "checkbox", checked: extra.indexOf(r.id) >= 0, on: { change: function () {
          var box = this;
          var nuovi = REPARTI.map(function (x) { return x.id; }).filter(function (id) { return id !== p.reparto && (id === r.id ? box.checked : extra.indexOf(id) >= 0); });
          salva({ reparti_extra: nuovi }, nuovi.length ? p.nome + ": " + [p.reparto].concat(nuovi).map(nomeRep).join(" + ") : "Salvato");
        } } }), r.nome]);
      }))),
      h("div", { "class": "actions" }, [
        !p.approvato ? h("button", { "class": "btn red small", type: "button", text: "Approva", on: { click: function () { salva({ approvato: true }, p.nome + " può entrare"); } } }) : null,
        p.approvato && !io ? h("button", { "class": "btn small", type: "button", text: "Sospendi", on: { click: function () { salva({ approvato: false }, "Accesso sospeso"); } } }) : null,
        !io ? bottoneElimina("persone", p.id, "Rimuovi") : null
      ])
    ]));
  });
}

/* ---------- notifiche sul telefono ---------- */
function b64u(s) { var p = "=".repeat((4 - s.length % 4) % 4); var b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); var a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
function pushSupportato() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
function suIphone() { return /iPhone|iPad|iPod/.test(navigator.userAgent); }
function comeApp() { return window.navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches); }
function salvaIscrizione(sub) { var j = sub.toJSON(); return sb.from("push_iscrizioni").upsert({ endpoint: j.endpoint, persona: S.me.id, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: "endpoint" }); }
function pannelloNotifiche() {
  var box = $("notifiche-box");
  if (!box) { box = h("div", { id: "notifiche-box", "class": "panel" }); var sec = $("s-avvisi"); sec.insertBefore(box, sec.firstChild); }
  box.textContent = ""; box.hidden = true;
  var chiave = (window.TMR_CONFIG || {}).VAPID_PUBLIC;
  if (!chiave) return;
  if (!pushSupportato()) {
    if (suIphone() && !comeApp()) { box.hidden = false; box.appendChild(h("p", { "class": "small", text: "Per ricevere le notifiche su iPhone: apri questa pagina con Safari, tocca Condividi e poi \"Aggiungi alla schermata Home\". Poi apri TMR Team dall'icona." })); }
    return;
  }
  if (Notification.permission === "denied") { box.hidden = false; box.appendChild(h("p", { "class": "small", text: "Le notifiche sono bloccate. Per attivarle: Impostazioni del telefono → Notifiche → TMR Team." })); return; }
  navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
    if (sub && Notification.permission === "granted") { salvaIscrizione(sub); return; }
    box.hidden = false; box.textContent = "";
    box.appendChild(h("div", { "class": "actions" }, [
      h("span", { style: "flex:1;min-width:180px", text: "Ricevi sul telefono avvisi, messaggi e risposte ai permessi." }),
      h("button", { "class": "btn red small", type: "button", text: "Attiva notifiche", on: { click: attivaNotifiche } })
    ]));
  }).catch(function () {});
}
function attivaNotifiche() {
  var chiave = window.TMR_CONFIG.VAPID_PUBLIC;
  Notification.requestPermission().then(function (p) {
    if (p !== "granted") { pannelloNotifiche(); return; }
    return navigator.serviceWorker.ready
      .then(function (reg) { return reg.pushManager.getSubscription().then(function (s) { return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(chiave) }); }); })
      .then(salvaIscrizione)
      .then(function (r) { if (r && r.error) toast(errore(r.error)); else toast("Notifiche attivate"); pannelloNotifiche(); });
  }).catch(function () { toast("Non è stato possibile attivare le notifiche. Riprova."); });
}
window.addEventListener("hashchange", function () { var v = (location.hash || "").replace("#", ""); if (S.caricato && VISTE.indexOf(v) >= 0) vai(v); });

/* ---------- installazione come app ---------- */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
}

avvio();
})();
