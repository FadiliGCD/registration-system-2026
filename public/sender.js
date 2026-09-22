(() => {
  const QKEY = "sender_queue_v1";
  const HKEY = "sender_history_v1";

  let profile = null;
  let flushing = false;

  const $ = id => document.getElementById(id);

  const getJSON = (k, fallback) => {
    try {
      return JSON.parse(
        localStorage.getItem(k) || JSON.stringify(fallback)
      );
    } catch (_) {
      return fallback;
    }
  };

  const saveJSON = (k, v) =>
    localStorage.setItem(k, JSON.stringify(v));


  function setMsg(text, type) {
    const m = $("sendMsg");
    m.textContent = text;
    m.className = "msg " + type;
  }


  function addHistory(identifier, status) {
    const h = getJSON(HKEY, []);

    h.unshift({
      identifier,
      status,
      time: new Date().toLocaleTimeString(
        "ar-MA",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }
      )
    });

    saveJSON(HKEY, h.slice(0, 50));

    renderHistory();
  }


  function renderHistory() {
    const h = getJSON(HKEY, []);

    const labels = {
      registered: "✓ تم",
      already: "↺ مسجل",
      invalid: "✕ غير موجود",
      queued: "⏳ انتظار",
      error: "✕ خطأ"
    };

    const cls = {
      registered: "ok",
      already: "warn",
      invalid: "bad",
      queued: "wait",
      error: "bad"
    };

    $("history").innerHTML = h.length
      ? h
          .slice(0, 20)
          .map(
            x => `
              <div class="row">
                <span>${escapeHTML(x.identifier)}</span>
                <span class="tag ${cls[x.status] || ""}">
                  ${labels[x.status] || x.status}
                  ·
                  ${escapeHTML(x.time)}
                </span>
              </div>
            `
          )
          .join("")
      : '<div class="small">لا يوجد إرسال بعد.</div>';
  }


  function escapeHTML(s) {
    return String(s ?? "").replace(
      /[&<>"']/g,
      c =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        }[c])
    );
  }


  function parseValues(raw) {
    return String(raw || "")
      .split(/[\s,،;]+/)
      .map(x => x.trim())
      .filter(Boolean);
  }


  function queue(identifier) {
    const q = getJSON(QKEY, []);

    q.push({
      identifier,
      queued_at: Date.now()
    });

    saveJSON(QKEY, q);

    addHistory(identifier, "queued");
  }


  async function submitOne(identifier, fromQueue = false) {
    try {
      const result =
        await CloudAPI.registerPerson(identifier);

      const status =
        result?.status || "error";

      if (!fromQueue) {
        addHistory(identifier, status);
      }

      if (status === "registered") {
        setMsg("✓ تم الإرسال", "ok");
      }

      else if (status === "already") {
        setMsg("⚠ مسجل من قبل", "warn");
      }

      else if (status === "invalid") {
        setMsg("✕ الرقم غير موجود", "bad");
      }

      else {
        setMsg("حدث خطأ غير متوقع", "bad");
      }

      return true;

    } catch (e) {

      if (
        !fromQueue &&
        (e instanceof TypeError || !navigator.onLine)
      ) {
        queue(identifier);

        setMsg(
          "لا يوجد اتصال — تم حفظ الرقم وسيُرسل تلقائياً.",
          "warn"
        );

        return false;
      }

      if (!fromQueue) {

        addHistory(identifier, "error");

        setMsg(
          e.message === "AUTH_REQUIRED"
            ? "انتهت الجلسة. يجب إعادة تسجيل دخول الجهاز."
            : "تعذر الإرسال.",
          "bad"
        );
      }

      return false;
    }
  }


  async function sendCurrent() {
    const values =
      parseValues($("identifier").value);

    if (!values.length) {
      return setMsg(
        "أدخل رقماً أولاً.",
        "bad"
      );
    }

    $("sendBtn").disabled = true;

    for (const v of values) {
      await submitOne(v);
    }

    $("identifier").value = "";
    $("identifier").focus();

    $("sendBtn").disabled = false;

    flushQueue();
  }


  async function flushQueue() {
    if (
      flushing ||
      !navigator.onLine
    ) {
      return;
    }

    flushing = true;

    try {
      let q =
        getJSON(QKEY, []);

      const remaining = [];

      for (const item of q) {
        try {

          const result =
            await CloudAPI.registerPerson(
              item.identifier
            );

          addHistory(
            item.identifier,
            result?.status || "error"
          );

        } catch (_) {

          remaining.push(item);

          break;
        }
      }

      saveJSON(
        QKEY,
        remaining
      );

    } finally {

      flushing = false;

      renderHistory();
    }
  }


  function networkUI() {
    const online =
      navigator.onLine;

    $("netDot").className =
      "dot " +
      (online ? "online" : "offline");

    $("netText").textContent =
      online
        ? "متصل"
        : "بدون إنترنت";

    if (online) {
      flushQueue();
    }
  }


  async function showSender() {
    const p =
      await CloudAPI.getProfile();

    if (
      !p ||
      !p.active ||
      !["sender", "admin"].includes(p.role)
    ) {
      CloudAPI.signOut();

      throw new Error(
        "This account is not authorized as a sender."
      );
    }

    profile = p;

    $("deviceName").textContent =
      p.device_name || "Tablet";

    $("loginScreen").classList.add(
      "hidden"
    );

    $("senderScreen").classList.remove(
      "hidden"
    );

    renderHistory();

    networkUI();

    $("identifier").focus();
  }


  async function login() {
    const m =
      $("loginMsg");

    try {

      $("loginBtn").disabled = true;

      await CloudAPI.signIn(
        $("email").value.trim(),
        $("password").value
      );

      await showSender();

    } catch (e) {

      m.textContent =
        e.message ||
        "تعذر تسجيل الدخول";

      m.className =
        "msg bad";

    } finally {

      $("loginBtn").disabled = false;
    }
  }


  $("loginBtn").onclick =
    login;


  $("password").addEventListener(
    "keydown",
    e => {
      if (e.key === "Enter") {
        login();
      }
    }
  );


  $("sendBtn").onclick =
    sendCurrent;


  $("identifier").addEventListener(
    "keydown",
    e => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendCurrent();
      }
    }
  );


  addEventListener(
    "online",
    networkUI
  );


  addEventListener(
    "offline",
    networkUI
  );


  (async () => {

    if (!CloudAPI.configured()) {

      $("loginMsg").textContent =
        "يجب أولاً وضع Supabase URL و Anon Key داخل config.js";

      $("loginMsg").className =
        "msg bad";

      return;
    }

    const s =
      await CloudAPI.validSession();

    if (s) {
      try {
        await showSender();
      } catch (_) {}
    }

    renderHistory();

  })();

})();