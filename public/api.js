(() => {
  const CFG = window.APP_CONFIG;
  const SESSION_KEY = "cloud_registration_supabase_session";

  function configured() {
    return CFG &&
      /^https:\/\/.+\.supabase\.co$/i.test(CFG.SUPABASE_URL || "") &&
      !String(CFG.SUPABASE_URL).includes("YOUR_PROJECT") &&
      CFG.SUPABASE_ANON_KEY &&
      !String(CFG.SUPABASE_ANON_KEY).includes("YOUR_SUPABASE");
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
    catch (_) { return null; }
  }

  function saveSession(s) {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  }

  function jwtPayload(token) {
    try {
      const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(
        atob(part).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
      ));
    } catch (_) { return {}; }
  }

  async function signIn(email, password) {
    if (!configured()) throw new Error("Supabase is not configured yet.");
    const r = await fetch(`${CFG.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "apikey": CFG.SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error_description || body.msg || "Login failed");
    saveSession(body);
    return body;
  }

  async function refreshSession() {
    const s = getSession();
    if (!s?.refresh_token) throw new Error("No saved session");
    const r = await fetch(`${CFG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "apikey": CFG.SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      saveSession(null);
      throw new Error("Session expired");
    }
    saveSession(body);
    return body;
  }

  async function validSession() {
    let s = getSession();
    if (!s?.access_token) return null;
    const payload = jwtPayload(s.access_token);
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now + 60) {
      try { s = await refreshSession(); }
      catch (_) { return null; }
    }
    return s;
  }

  async function authFetch(path, options = {}, retry = true) {
    let s = await validSession();
    if (!s) throw new Error("AUTH_REQUIRED");

    const headers = {
      "apikey": CFG.SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${s.access_token}`,
      ...(options.headers || {})
    };
    const r = await fetch(`${CFG.SUPABASE_URL}${path}`, { ...options, headers });

    if (r.status === 401 && retry) {
      await refreshSession();
      return authFetch(path, options, false);
    }
    return r;
  }

  async function jsonRequest(path, options = {}) {
    const r = await authFetch(path, options);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = body?.message || body?.hint || body?.details || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return body;
  }

  async function rpc(name, args = {}) {
    return jsonRequest(`/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
  }

  async function getProfile() {
    const s = await validSession();
    if (!s) return null;
    const uid = jwtPayload(s.access_token).sub;
    const rows = await jsonRequest(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(uid)}&select=role,device_name,active`);
    return rows?.[0] || null;
  }

  async function fetchPaged(table, select, extra = "", pageSize = 1000) {
    const all = [];
    for (let offset = 0; ; offset += pageSize) {
      const joiner = extra ? "&" : "";
      const path = `/rest/v1/${table}?select=${encodeURIComponent(select)}${extra}${joiner}limit=${pageSize}&offset=${offset}`;
      const batch = await jsonRequest(path);
      all.push(...batch);
      if (batch.length < pageSize) break;
    }
    return all;
  }

  async function getPeople() {
    return fetchPaged(
      "people",
      "no,first_name,last_name,birth_date,id_number,district,office,school,supervisor,assigned",
      "&order=no.asc"
    );
  }

  async function getRegistrations() {
    return fetchPaged(
      "registrations",
      "id,person_no,registered_at,sender_user_id,device_name",
      "&order=id.asc"
    );
  }

  async function getRegistrationsAfter(id) {
    return jsonRequest(`/rest/v1/registrations?select=id,person_no,registered_at,sender_user_id,device_name&id=gt.${Number(id)||0}&order=id.asc&limit=1000`);
  }

  async function getSystemState() {
    const rows = await jsonRequest("/rest/v1/system_state?id=eq.1&select=reset_version,updated_at");
    return rows?.[0] || { reset_version: 0 };
  }

  window.CloudAPI = {
    configured,
    getSession,
    saveSession,
    signIn,
    validSession,
    getProfile,
    getPeople,
    getRegistrations,
    getRegistrationsAfter,
    getSystemState,
    registerPerson: identifier => rpc("register_person", { p_identifier: String(identifier) }),
    resetRegistrations: () => rpc("reset_registrations", {}),
    signOut: () => saveSession(null)
  };
})();
