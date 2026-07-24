/**
 * PIS Chat Widget — Chat User ↔ Admin Master
 * - Tombol chat SELALU terlihat (kanan-bawah), tidak lagi sembunyi.
 * - Master Admin: melihat daftar percakapan (thread) per user,
 *   lengkap dengan nama & area tugas pengirim otomatis, lalu bisa membalas.
 * - User biasa: chat langsung dengan Admin Master, melihat balasannya.
 * - Notifikasi (badge + browser notification) saat ada pesan baru masuk.
 * - Auto-reset 1x24 jam (percakapan otomatis terhapus tiap hari, sisi server).
 * Inject di bagian bawah <body>.
 */
(function () {
  "use strict";

  // ── Config ──────────────────────────────────────────────
  const API_BASE = "";           // sama domain (Cloudflare Worker)
  const POLL_INTERVAL = 15000;   // poll pesan baru tiap 15 detik
  const PANEL_IDLE_MS = 60000;   // panel auto-tertutup setelah 60 detik idle

  // Pilihan topik pertanyaan Acha — ditampilkan sebagai tombol DI DALAM
  // jendela chat, tepat setelah pesan terakhir dari Acha (bukan panel
  // terpisah di luar chat).
  const CHAT_OPTIONS = [
    { label: "🕐 Absensi", question: "Cara absensi?" },
    { label: "📅 Jadwal Shift", question: "Jadwal shift saya hari ini?" },
    { label: "💰 Slip Gaji", question: "Slip gaji saya?" },
    { label: "🌴 Cuti & Izin", question: "Cara ajukan cuti atau izin?" },
    { label: "🛡️ E-Patroli", question: "Cara menggunakan e-patroli?" },
    { label: "🔧 Lapor Kerusakan", question: "Cara lapor kerusakan fasilitas?" },
    { label: "🔑 Lupa Password", question: "Lupa password?" },
    { label: "📄 PKWT", question: "PKWT dan surat tugas?" },
    { label: "📊 Laporan", question: "Cara membuat laporan?" },
    { label: "📦 Inventaris", question: "Cara lihat inventaris?" },
    { label: "👤 Chat dengan Admin", question: "Saya ingin bertanya langsung ke Admin", askAdmin: true },
  ];
  let isSendingQuickReply = false;

  // ── State ────────────────────────────────────────────────
  let isOpen = false;
  let isMasterAdmin = false;
  let currentUser = null;        // { nik, role, nama, area_tugas }
  let pollTimer = null;
  let idleTimer = null;
  let notifPermissionAsked = false;

  // Admin-only state
  let allChats = [];             // seluruh pesan 24 jam terakhir (untuk dikelompokkan jadi thread)
  let activeThreadNik = null;    // thread yang sedang dibuka (Master Admin)
  let knownChatIds = new Set();  // untuk deteksi pesan baru (notifikasi)

  // User-only state
  let myChats = [];
  let myKnownIds = new Set();

  // ── Helpers ──────────────────────────────────────────────
  function getToken() {
    try {
      return localStorage.getItem("token") || sessionStorage.getItem("token") || null;
    } catch { return null; }
  }

  function getUserInfo() {
    try {
      const s = localStorage.getItem("pis_employee") || sessionStorage.getItem("pis_employee");
      if (!s) return null;
      const d = JSON.parse(s);
      if (!d || !d.nik_karyawan) return null;
      return { nik: d.nik_karyawan, role: d.role, nama: d.nama_lengkap, area_tugas: d.area_tugas || "-" };
    } catch { return null; }
  }

  async function apiCall(fnName, body = {}) {
    const token = getToken();
    try {
      const res = await fetch(`${API_BASE}/api/apps/functions/${fnName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "X-Employee-Token": token } : {}) },
        body: JSON.stringify(body),
      });
      return await res.json();
    } catch { return { success: false }; }
  }

  function escHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function timeStr(iso) {
    return iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";
  }

  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
  }

  // ── Notifikasi (badge + browser notification) ───────────
  function maybeAskNotifPermission() {
    if (notifPermissionAsked) return;
    notifPermissionAsked = true;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }

  function notify(title, body) {
    try {
      if ("Notification" in window && Notification.permission === "granted" && (document.hidden || !isOpen)) {
        new Notification(title, { body, icon: "/icons/icon-192.png" });
      }
    } catch {}
  }

  // ── Build UI ─────────────────────────────────────────────
  function buildWidget() {
    const old = document.getElementById("pis-chat-widget");
    if (old) old.remove();

    const wrap = document.createElement("div");
    wrap.id = "pis-chat-widget";
    wrap.innerHTML = `
      <style>
        #pis-chat-widget * { box-sizing: border-box; font-family: Arial, sans-serif; }
        #pis-chat-fab {
          position: fixed; bottom: 20px; right: 20px; z-index: 9999;
          width: 54px; height: 54px; border-radius: 50%;
          background: #7B1A2C; color: #fff; border: none; cursor: pointer;
          box-shadow: 0 4px 16px rgba(0,0,0,.3); display: flex; align-items: center; justify-content: center;
          transition: transform .2s;
        }
        #pis-chat-fab:hover { transform: scale(1.08); }
        #pis-chat-badge {
          position: absolute; top: -4px; right: -4px;
          background: #e53e3e; color: #fff; font-size: 11px; font-weight: bold;
          min-width: 20px; height: 20px; padding: 0 4px; border-radius: 10px; display: none; align-items: center; justify-content: center;
        }
        #pis-chat-panel {
          position: fixed; bottom: 86px; right: 20px; z-index: 9999;
          width: 340px; height: 460px; background: #fff;
          border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,.22);
          display: flex; flex-direction: column; overflow: hidden;
          transition: opacity .2s, transform .2s;
          opacity: 0; transform: translateY(20px) scale(.97); pointer-events: none;
        }
        #pis-chat-panel.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: all; }
        #pis-chat-header {
          background: #7B1A2C; color: #fff; padding: 12px 14px;
          display: flex; align-items: center; gap: 8px; flex-shrink: 0;
        }
        #pis-chat-back { background: none; border: none; color: #fff; cursor: pointer; font-size: 18px; padding: 0 4px; display: none; }
        #pis-chat-header-text { flex: 1; min-width: 0; }
        #pis-chat-header h4 { margin: 0; font-size: 14px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #pis-chat-header small { font-size: 11px; opacity: .85; }
        #pis-chat-close { background: none; border: none; color: #fff; cursor: pointer; font-size: 18px; padding: 0; }
        #pis-chat-body { flex: 1; overflow-y: auto; background: #fafafa; }

        /* Daftar thread (Master Admin) */
        .pis-thread-item {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f0f0f0;
        }
        .pis-thread-item:hover { background: #f5f0f0; }
        .pis-thread-avatar {
          width: 38px; height: 38px; border-radius: 50%; background: #7B1A2C; color: #fff;
          display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; flex-shrink: 0;
        }
        .pis-thread-info { flex: 1; min-width: 0; }
        .pis-thread-name { font-size: 13px; font-weight: 600; color: #222; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pis-thread-area { font-size: 11px; color: #7B1A2C; }
        .pis-thread-preview { font-size: 12px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pis-thread-meta { text-align: right; flex-shrink: 0; }
        .pis-thread-time { font-size: 10px; color: #aaa; }
        .pis-thread-unread {
          margin-top: 4px; background: #e53e3e; color: #fff; font-size: 10px; font-weight: bold;
          min-width: 16px; height: 16px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; padding: 0 4px;
        }

        /* Pesan */
        #pis-chat-messages { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
        .pis-msg { max-width: 78%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.4; }
        .pis-msg.mine { align-self: flex-end; background: #7B1A2C; color: #fff; border-bottom-right-radius: 4px; }
        .pis-msg.other { align-self: flex-start; background: #ede8e9; color: #333; border-bottom-left-radius: 4px; }
        .pis-msg .meta { font-size: 10px; opacity: .7; margin-top: 4px; }
        #pis-chat-empty { text-align: center; color: #aaa; font-size: 13px; margin: 30px 0; padding: 0 20px; }

        #pis-chat-footer { padding: 10px 12px; border-top: 1px solid #eee; display: flex; gap: 8px; flex-shrink: 0; background: #fff; }
        #pis-chat-input {
          flex: 1; border: 1px solid #ddd; border-radius: 20px; padding: 8px 14px; font-size: 13px; outline: none;
          resize: none; height: 36px; max-height: 80px; font-family: Arial, sans-serif;
        }
        #pis-chat-input:focus { border-color: #7B1A2C; }
        #pis-chat-send {
          background: #7B1A2C; color: #fff; border: none; border-radius: 50%; width: 36px; height: 36px;
          cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 16px;
        }
        #pis-chat-send:hover { background: #5a1320; }
        #pis-chat-send:disabled { opacity: .5; cursor: default; }
        .pis-reset-notice { text-align: center; font-size: 11px; color: #bbb; padding: 4px 0 8px; }

        /* Tombol pilihan topik Acha — dirender DI DALAM #pis-chat-body,
           menyatu dengan alur pesan (bukan panel mengambang terpisah). */
        .pis-quick-replies { align-self: flex-start; max-width: 92%; margin-top: 2px; }
        .pis-quick-title { font-size: 11px; color: #888; font-weight: 600; margin: 2px 2px 6px; }
        .pis-quick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .pis-quick-btn {
          padding: 8px 8px; border: 1px solid #e0d3d5; border-radius: 8px;
          background: #fff; font-size: 11.5px; font-weight: 600; color: #7B1A2C;
          cursor: pointer; text-align: center; transition: all .15s; font-family: Arial, sans-serif;
        }
        .pis-quick-btn:hover:not(:disabled) { background: #7B1A2C; color: #fff; border-color: #7B1A2C; }
        .pis-quick-btn:disabled { opacity: .5; cursor: default; }
        .pis-quick-btn.admin { grid-column: 1 / -1; background: #7B1A2C; color: #fff; border-color: #7B1A2C; }
        .pis-quick-btn.admin:hover:not(:disabled) { filter: brightness(1.1); }
      </style>

      <button id="pis-chat-fab" title="Chat dengan Admin Master">
        <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span id="pis-chat-badge"></span>
      </button>

      <div id="pis-chat-panel">
        <div id="pis-chat-header">
          <button id="pis-chat-back" title="Kembali">←</button>
          <div id="pis-chat-header-text">
            <h4 id="pis-chat-title">💬 Chat Admin Master</h4>
            <small id="pis-chat-subtitle">Pesan otomatis terhapus setiap 24 jam</small>
          </div>
          <button id="pis-chat-close" title="Tutup">✕</button>
        </div>
        <div id="pis-chat-body">
          <div id="pis-chat-empty">Belum ada pesan hari ini</div>
        </div>
        <div id="pis-chat-footer" style="display:none;">
          <textarea id="pis-chat-input" placeholder="Ketik pesan..." rows="1"></textarea>
          <button id="pis-chat-send">➤</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    document.getElementById("pis-chat-fab").addEventListener("click", () => { maybeAskNotifPermission(); togglePanel(); });
    document.getElementById("pis-chat-close").addEventListener("click", closePanel);
    document.getElementById("pis-chat-back").addEventListener("click", () => { activeThreadNik = null; renderAdminView(); resetIdleTimer(); });
    document.getElementById("pis-chat-send").addEventListener("click", sendMessage);
    document.getElementById("pis-chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      resetIdleTimer();
    });
    document.getElementById("pis-chat-panel").addEventListener("mousemove", resetIdleTimer);
  }

  // ── Panel controls ──────────────────────────────────────
  function togglePanel() { isOpen ? closePanel() : openPanel(); }

  function openPanel() {
    isOpen = true;
    document.getElementById("pis-chat-panel").classList.add("open");
    resetIdleTimer();
    refresh();
  }

  function closePanel() {
    isOpen = false;
    document.getElementById("pis-chat-panel").classList.remove("open");
    clearTimeout(idleTimer);
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (isOpen) idleTimer = setTimeout(() => { if (isOpen) closePanel(); }, PANEL_IDLE_MS);
  }

  // ── Data loading ─────────────────────────────────────────
  async function refresh() {
    if (isMasterAdmin) {
      const res = await apiCall("getChats", {});
      if (res.success && Array.isArray(res.chats)) {
        detectNewIncoming(res.chats, (m) => m.role_pengirim !== "Master Admin" && m.role_pengirim !== "master_admin");
        allChats = res.chats;
      }
      if (activeThreadNik) {
        await apiCall("markChatRead", { partner_nik: activeThreadNik });
      }
      renderAdminView();
    } else {
      const res = await apiCall("getMyChat", {});
      if (res.success && Array.isArray(res.chats)) {
        detectNewIncoming(res.chats, (m) => m.to_nik === currentUser.nik);
        myChats = res.chats;
      }
      renderUserView();
    }
  }

  function detectNewIncoming(freshList, isIncoming) {
    const seen = isMasterAdmin ? knownChatIds : myKnownIds;
    const firstLoad = seen.size === 0;
    freshList.forEach((m) => {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        if (!firstLoad && isIncoming(m)) {
          if (isMasterAdmin) {
            notify(`Pesan baru dari ${m.nama_pengirim}`, `(${m.area_tugas_pengirim || "-"}) ${m.pesan}`);
          } else {
            notify("Balasan dari Admin Master", m.pesan);
          }
        }
      }
    });
  }

  // ── Poll unread count (badge) tanpa membuka panel ────────
  // Catatan: dulu di sini ada 2 fetch terpisah tiap poll (getChatCount/
  // getMyChatUnreadCount DAN getChats/getMyChat) padahal jumlah unread bisa
  // dihitung langsung dari hasil getChats/getMyChat yang sama — jadi
  // digabung jadi 1 fetch saja per siklus poll (separuh dari jumlah request
  // sebelumnya), tanpa mengubah data/fungsi yang ditampilkan.
  async function pollBadge() {
    if (isMasterAdmin) {
      const res2 = await apiCall("getChats", {});
      if (res2.success && Array.isArray(res2.chats)) {
        detectNewIncoming(res2.chats, (m) => m.role_pengirim !== "Master Admin" && m.role_pengirim !== "master_admin");
        allChats = res2.chats;
        const unread = res2.chats.filter((m) => !m.dibaca_admin).length;
        updateBadge(unread);
      }
    } else {
      const res2 = await apiCall("getMyChat", {});
      if (res2.success && Array.isArray(res2.chats)) {
        detectNewIncoming(res2.chats, (m) => m.to_nik === currentUser.nik);
        myChats = res2.chats;
        const unread = res2.chats.filter((m) => m.to_nik === currentUser.nik && !m.dibaca_user).length;
        updateBadge(unread);
      }
    }
    if (isOpen) (isMasterAdmin ? renderAdminView : renderUserView)();
  }

  function updateBadge(count) {
    const badge = document.getElementById("pis-chat-badge");
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }

  // ── Render: Master Admin — daftar thread ────────────────
  function renderAdminView() {
    const back = document.getElementById("pis-chat-back");
    const footer = document.getElementById("pis-chat-footer");
    const title = document.getElementById("pis-chat-title");
    const subtitle = document.getElementById("pis-chat-subtitle");

    if (!activeThreadNik) {
      back.style.display = "none";
      footer.style.display = "none";
      title.textContent = "💬 Chat Admin Master";
      subtitle.textContent = "Pesan masuk dari semua user";
      renderThreadList();
      return;
    }

    back.style.display = "block";
    footer.style.display = "flex";
    const threadMsgs = allChats.filter((m) => m.nik_pengirim === activeThreadNik || m.to_nik === activeThreadNik);
    const partnerMsg = threadMsgs.find((m) => m.nik_pengirim === activeThreadNik);
    title.textContent = partnerMsg ? partnerMsg.nama_pengirim : activeThreadNik;
    subtitle.textContent = partnerMsg ? `Area tugas: ${partnerMsg.area_tugas_pengirim || "-"}` : "";
    renderMessageList(threadMsgs, activeThreadNik);
  }

  function renderThreadList() {
    const body = document.getElementById("pis-chat-body");
    const threads = new Map();
    allChats.forEach((m) => {
      const partnerNik = m.to_nik || m.nik_pengirim; // pesan admin → to_nik ; pesan user → nik_pengirim sendiri
      if (!partnerNik) return;
      const t = threads.get(partnerNik) || { nik: partnerNik, nama: partnerNik, area: "-", last: null, unread: 0 };
      if (m.nik_pengirim === partnerNik) { t.nama = m.nama_pengirim; t.area = m.area_tugas_pengirim || "-"; }
      if (!t.last || new Date(m.waktu || m.created_date) >= new Date(t.last.waktu || t.last.created_date)) t.last = m;
      if (m.nik_pengirim === partnerNik && !m.dibaca_admin) t.unread++;
      threads.set(partnerNik, t);
    });
    const list = Array.from(threads.values()).sort((a, b) => new Date(b.last?.waktu || 0) - new Date(a.last?.waktu || 0));

    if (list.length === 0) {
      body.innerHTML = `<div id="pis-chat-empty">Belum ada pesan hari ini</div>`;
      return;
    }

    body.innerHTML = list.map((t) => `
      <div class="pis-thread-item" data-nik="${escHtml(t.nik)}">
        <div class="pis-thread-avatar">${escHtml(initials(t.nama))}</div>
        <div class="pis-thread-info">
          <div class="pis-thread-name">${escHtml(t.nama)}</div>
          <div class="pis-thread-area">${escHtml(t.area)}</div>
          <div class="pis-thread-preview">${escHtml(t.last?.pesan || "")}</div>
        </div>
        <div class="pis-thread-meta">
          <div class="pis-thread-time">${timeStr(t.last?.waktu)}</div>
          ${t.unread > 0 ? `<div class="pis-thread-unread">${t.unread}</div>` : ""}
        </div>
      </div>
    `).join("");

    body.querySelectorAll(".pis-thread-item").forEach((el) => {
      el.addEventListener("click", () => {
        activeThreadNik = el.getAttribute("data-nik");
        apiCall("markChatRead", { partner_nik: activeThreadNik });
        renderAdminView();
        resetIdleTimer();
      });
    });
  }

  // ── Render: User biasa — 1 percakapan dengan Admin Master ─
  function renderUserView() {
    document.getElementById("pis-chat-back").style.display = "none";
    document.getElementById("pis-chat-footer").style.display = "flex";
    document.getElementById("pis-chat-title").textContent = "💬 Chat Admin Master";
    document.getElementById("pis-chat-subtitle").textContent = currentUser ? `${currentUser.nama} · ${currentUser.area_tugas}` : "";
    renderMessageList(myChats, currentUser?.nik);
  }

  // ── Render daftar pesan (dipakai admin & user) ──────────
  function renderMessageList(msgs, myNik) {
    const body = document.getElementById("pis-chat-body");
    if (!msgs || msgs.length === 0) {
      body.innerHTML = `<div id="pis-chat-empty">Belum ada pesan. Mulai percakapan di bawah 👇</div>`;
      return;
    }
    const rows = msgs.map((m) => {
      const isMe = m.nik_pengirim === myNik;
      return `<div class="pis-msg ${isMe ? "mine" : "other"}">${escHtml(m.pesan)}<div class="meta">${escHtml(m.nama_pengirim)}${m.area_tugas_pengirim ? " · " + escHtml(m.area_tugas_pengirim) : ""} · ${timeStr(m.waktu)}</div></div>`;
    }).join("");
    const showQuickReplies = shouldShowQuickReplies(msgs, myNik);
    const quickReplies = showQuickReplies ? renderQuickRepliesHtml() : "";
    body.innerHTML = `<div class="pis-reset-notice">↻ Pesan otomatis terhapus setiap 24 jam</div>${rows}${quickReplies}`;
    body.scrollTop = body.scrollHeight;
    if (showQuickReplies) bindQuickReplyEvents();
  }

  // ── Kirim pesan (dipakai baik dari input manual maupun tombol topik
  //    Acha, supaya keduanya melalui jalur & tampilan balasan yang sama) ──
  async function sendChatMessage(pesan, { askAdmin = false } = {}) {
    if (!pesan) return false;
    if (isMasterAdmin && !activeThreadNik) return false; // admin harus buka thread dulu sebelum membalas

    const payload = { pesan };
    if (isMasterAdmin) payload.to_nik = activeThreadNik;
    else if (askAdmin) payload.ask_admin = true;

    const res = await apiCall("sendChat", payload);
    if (!res.success || !res.chat) return false;

    (isMasterAdmin ? knownChatIds : myKnownIds).add(res.chat.id);
    if (isMasterAdmin) { allChats.push(res.chat); renderAdminView(); }
    else { myChats.push(res.chat); renderUserView(); }
    resetIdleTimer();

    // Balasan otomatis Acha (salam/auto-reply/notifikasi admin) dibuat di
    // server pada request yang sama, tapi tidak ikut dikembalikan di respons
    // ini — ambil ulang sebentar setelahnya supaya balasannya langsung
    // tersinkron di chat, tidak menunggu siklus polling 15 detik.
    if (!isMasterAdmin) {
      setTimeout(refresh, 500);
      setTimeout(refresh, 1500);
    }
    return true;
  }

  async function sendMessage() {
    const input = document.getElementById("pis-chat-input");
    const pesan = input?.value?.trim();
    if (!pesan) return;
    if (isMasterAdmin && !activeThreadNik) return;

    const sendBtn = document.getElementById("pis-chat-send");
    sendBtn.disabled = true;
    input.value = "";
    input.style.height = "36px";

    await sendChatMessage(pesan);
    sendBtn.disabled = false;
  }

  // ── Tombol pilihan topik Acha (klik = kirim pertanyaan siap pakai) ──
  async function sendQuickReply(idx) {
    if (isSendingQuickReply) return;
    const opt = CHAT_OPTIONS[idx];
    if (!opt) return;
    isSendingQuickReply = true;

    const grid = document.getElementById("pis-quick-replies");
    grid?.querySelectorAll(".pis-quick-btn").forEach((b) => { b.disabled = true; });

    await sendChatMessage(opt.question, { askAdmin: !!opt.askAdmin });
    isSendingQuickReply = false;
  }

  function bindQuickReplyEvents() {
    const wrap = document.getElementById("pis-quick-replies");
    if (!wrap) return;
    wrap.querySelectorAll(".pis-quick-btn").forEach((btn) => {
      btn.addEventListener("click", () => sendQuickReply(Number(btn.dataset.idx)));
    });
  }

  // Tombol topik hanya relevan kalau pesan TERAKHIR di chat berasal dari
  // Acha/Sistem (giliran user untuk merespons) — begitu user atau Admin
  // membalas, tombol otomatis hilang saat render berikutnya.
  function shouldShowQuickReplies(msgs, myNik) {
    if (isMasterAdmin || !msgs || msgs.length === 0) return false;
    const last = msgs[msgs.length - 1];
    return last.nik_pengirim !== myNik && last.nik_pengirim === "system";
  }

  function renderQuickRepliesHtml() {
    return `
      <div class="pis-quick-replies" id="pis-quick-replies">
        <div class="pis-quick-title">Pilih topik pertanyaan:</div>
        <div class="pis-quick-grid">
          ${CHAT_OPTIONS.map((o, i) => `<button type="button" class="pis-quick-btn${o.askAdmin ? " admin" : ""}" data-idx="${i}">${escHtml(o.label)}</button>`).join("")}
        </div>
      </div>
    `;
  }

  // ── Init ────────────────────────────────────────────────
  function init() {
    currentUser = getUserInfo();
    if (!currentUser) return; // belum login

    isMasterAdmin = ["Master Admin", "master_admin"].includes(currentUser.role);

    buildWidget();
    pollBadge();
    startPolling();
  }

  // Hemat request: jangan polling saat tab sedang tidak aktif/di-background
  // (mis. pengguna pindah tab lain atau minimize browser). Begitu tab aktif
  // kembali, langsung poll sekali lalu lanjut interval seperti biasa.
  function startPolling() {
    clearInterval(pollTimer);
    if (document.hidden) return; // tab tidak aktif, jangan mulai timer
    pollTimer = setInterval(pollBadge, POLL_INTERVAL);
  }
  document.addEventListener("visibilitychange", () => {
    if (!currentUser) return;
    if (document.hidden) {
      clearInterval(pollTimer);
      pollTimer = null;
    } else {
      pollBadge();
      startPolling();
    }
  });

  function waitForLogin() {
    const token = getToken();
    const user = getUserInfo();
    if (token && user) {
      init();
    } else {
      setTimeout(waitForLogin, 1000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForLogin);
  } else {
    waitForLogin();
  }

  window.addEventListener("beforeunload", () => clearInterval(pollTimer));

  // Expose untuk dipanggil manual (misalnya saat login berhasil, atau logout untuk reset state)
  window.PISChat = {
    init,
    reload: init,
    destroy() {
      clearInterval(pollTimer);
      document.getElementById("pis-chat-widget")?.remove();
      isOpen = false; isMasterAdmin = false; currentUser = null;
      allChats = []; myChats = []; activeThreadNik = null;
      knownChatIds = new Set(); myKnownIds = new Set();
    },
  };
})();
