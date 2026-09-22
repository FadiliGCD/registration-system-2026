(() => {
  let P = [];
  let registrations = [];
  let regByNo = new Map();
  let lastRegistrationId = 0;
  let resetVersion = 0;
  let pollTimer = null;
  let reportReady = false;

  const $ = id => document.getElementById(id);
  const e = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const nNo = v => String(v ?? "").trim().replace(/^0+(?=\d)/,"");
  const nId = v => String(v ?? "").trim().replace(/\s+/g,"").toUpperCase();

  function setCloud(text, ok=true) {
    const el = $("cloudStatus");
    el.textContent = text;
    el.className = ok ? "ok" : "bad";
  }

  function person(no) { return P.find(p => p.no === String(no)) || null; }
  function isR(p) { return regByNo.has(p.no); }
  function remainingOnly(){ return P.filter(p=>!isR(p)); }

  function normalizePeople(rows) {
    return rows.map(r => ({
      no: String(r.no ?? ""),
      first: r.first_name || "",
      last: r.last_name || "",
      birth: r.birth_date || "",
      id: r.id_number || "",
      district: r.district || "",
      office: r.office || "",
      school: r.school || "",
      supervisor: r.supervisor || "",
      assigned: r.assigned || ""
    })).sort((a,b)=>(Number(a.no)||0)-(Number(b.no)||0));
  }

  function rebuildRegMap() {
    regByNo = new Map(registrations.map(r => [String(r.person_no), r]));
    lastRegistrationId = registrations.reduce((m,r)=>Math.max(m,Number(r.id)||0),0);
  }

  function stats(){
    $("tot").textContent=P.length;
    $("done").textContent=registrations.length;
    $("left").textContent=P.length-registrations.length;
  }

  function sourceLabel(deviceName) {
    const name = String(deviceName || "").trim();

    const match = name.match(/(?:Tablet|Chef)\s*(\d+)/i);

    if (match) {
      return `Chef ${match[1]}`;
    }

    if (/Main Laptop/i.test(name)) {
      return "الإدارة";
    }

    return name || "غير معروف";
  }

  function history(){
    const box=$("historyChips");

    const recent=[...registrations]
      .sort((a,b)=>Number(b.id)-Number(a.id))
      .slice(0,80);

    box.innerHTML=recent.length
      ? recent.map(r => {
          const source=sourceLabel(r.device_name);

          return `<span class="chip ok" title="${e(r.device_name||source)}">
            ✓ ${e(r.person_no)} — ${e(source)}
          </span>`;
        }).join("")
      : '<span class="nohistory">لا يوجد تسجيل بعد</span>';
  }

  function msg(t,c){
    const x=$("msg");
    x.className="msg "+c;
    x.textContent=t;
  }

  function parseValues(raw){
    return String(raw??"")
      .split(/[\s,،;]+/)
      .map(x=>x.trim())
      .filter(Boolean);
  }

  async function addBatch(){
    const i=$("inp");
    const vals=parseValues(i.value);

    if(!vals.length){
      msg("اكتب No أو رقم بطاقة التعريف.","bad");
      return;
    }

    $("go").disabled=true;

    let ok=0,dup=0,bad=0,err=0;

    for(const v of vals){
      try{
        const r=await CloudAPI.registerPerson(v);

        if(r?.status==="registered")ok++;
        else if(r?.status==="already")dup++;
        else if(r?.status==="invalid")bad++;
        else err++;
      }catch(_){
        err++;
      }
    }

    i.value="";

    const parts=[];

    if(ok)parts.push("تم تسجيل "+ok);
    if(dup)parts.push("مسجل من قبل "+dup);
    if(bad)parts.push("غير موجود "+bad);
    if(err)parts.push("خطأ "+err);

    msg(parts.join(" | "), err||bad ? "warn" : "ok");

    $("go").disabled=false;

    await syncNew(true);

    i.focus();
  }

  function cmp(f){
    return(a,b)=>{
      const x=String(a[f]??"");
      const y=String(b[f]??"");
      const xn=Number(x);
      const yn=Number(y);

      if(x!==""&&y!==""&&!isNaN(xn)&&!isNaN(yn)){
        return xn-yn||Number(a.no)-Number(b.no);
      }

      return x.localeCompare(
        y,
        "ar",
        {
          numeric:true,
          sensitivity:"base"
        }
      )||Number(a.no)-Number(b.no);
    };
  }

  function groupByField(items, field){
    const map=new Map();

    for(const p of items){
      const k=String(p[field]??"").trim() || "غير محدد";

      if(!map.has(k)){
        map.set(k,[]);
      }

      map.get(k).push(p);
    }

    return [...map.entries()].sort(
      (a,b)=>a[0].localeCompare(
        b[0],
        "ar",
        {
          numeric:true,
          sensitivity:"base"
        }
      )
    );
  }

  function compactPeopleTable(items){
    const rows=items
      .slice()
      .sort(cmp("no"))
      .map(p=>`<tr>
        <td>${e(p.no)}</td>
        <td class="nm">${e(p.first)} ${e(p.last)}</td>
        <td dir="ltr">${e(p.id)}</td>
        <td>${e(p.school)}</td>
        <td>${e(p.district)}</td>
        <td>${e(p.office)}</td>
        <td>${e(p.supervisor)}</td>
        <td>${e(p.assigned)}</td>
      </tr>`)
      .join("");

    return `<div class="peopleList">
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>الاسم</th>
            <th>رقم البطاقة</th>
            <th>المدرسة</th>
            <th>الدائرة</th>
            <th>المكتب</th>
            <th>المؤطر</th>
            <th>المكلف</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;
  }

  function miniCards(items, field, title){
    const groups=groupByField(items,field);

    if(!groups.length){
      return "";
    }

    return `<div class="subSection">
      <div class="subTitle">${e(title)}</div>
      <div class="miniGrid">
        ${
          groups.map(([name,arr])=>`
            <div class="miniCard">
              <div class="nm2">${e(name)}</div>
              <div class="ct2">العدد الإجمالي: ${arr.length}</div>

              <details class="peopleBlock">
                <summary>عرض الأشخاص</summary>
                ${compactPeopleTable(arr)}
              </details>
            </div>
          `).join("")
        }
      </div>
    </div>`;
  }

  function nestedSummaryForSchool(items){
    const districts=groupByField(items,"district");

    let x=`
      <div class="subSection">
        <div class="subTitle">الدوائر داخل المدرسة</div>
        <div class="miniGrid">
    `;

    x+=districts.map(([d,arr])=>`
      <div class="miniCard">
        <div class="nm2">الدائرة ${e(d)}</div>
        <div class="ct2">العدد الإجمالي: ${arr.length}</div>

        <details class="peopleBlock">
          <summary>عرض المكلفين في الدائرة</summary>
          ${miniCards(arr,"assigned","المكلفون")}
        </details>

        <details class="peopleBlock">
          <summary>عرض المكاتب في الدائرة</summary>
          ${miniCards(arr,"office","المكاتب")}
        </details>

        <details class="peopleBlock">
          <summary>عرض الأشخاص في الدائرة</summary>
          ${compactPeopleTable(arr)}
        </details>
      </div>
    `).join("");

    x+=`</div></div>`;

    x+=miniCards(
      items,
      "assigned",
      "جميع المكلفين في المدرسة"
    );

    x+=miniCards(
      items,
      "office",
      "جميع المكاتب في المدرسة"
    );

    return x;
  }

  function nestedSummaryForAssigned(items){
    return miniCards(
      items,
      "school",
      "المدارس التابعة للمكلف"
    )+
    miniCards(
      items,
      "district",
      "الدوائر التابعة للمكلف"
    )+
    miniCards(
      items,
      "office",
      "المكاتب التابعة للمكلف"
    )+
    `<details class="peopleBlock">
      <summary>عرض جميع الأشخاص لهذا المكلف</summary>
      ${compactPeopleTable(items)}
    </details>`;
  }

  function nestedSummaryForDistrict(items){
    return miniCards(
      items,
      "school",
      "المدارس داخل الدائرة"
    )+
    miniCards(
      items,
      "assigned",
      "المكلفون داخل الدائرة"
    )+
    miniCards(
      items,
      "office",
      "المكاتب داخل الدائرة"
    )+
    `<details class="peopleBlock">
      <summary>عرض جميع الأشخاص في الدائرة</summary>
      ${compactPeopleTable(items)}
    </details>`;
  }

  function nestedSummaryForOffice(items){
    return miniCards(
      items,
      "school",
      "المدارس المرتبطة بالمكتب"
    )+
    miniCards(
      items,
      "assigned",
      "المكلفون في المكتب"
    )+
    miniCards(
      items,
      "district",
      "الدوائر المرتبطة بالمكتب"
    )+
    `<details class="peopleBlock">
      <summary>عرض جميع الأشخاص في المكتب</summary>
      ${compactPeopleTable(items)}
    </details>`;
  }

  function norm(v){
    return String(v??"")
      .trim()
      .replace(/\s+/g," ")
      .toLocaleLowerCase("ar");
  }

  function personMatches(p,raw){
    const q=norm(raw);

    if(!q){
      return true;
    }

    if(/^\d+$/.test(raw)&&nNo(p.no)===nNo(raw)){
      return true;
    }

    if(p.id&&nId(p.id)===nId(raw)){
      return true;
    }

    return [
      p.first,
      p.last,
      `${p.first} ${p.last}`,
      p.no,
      p.id,
      p.school,
      p.assigned,
      p.supervisor,
      p.district,
      p.office
    ]
      .map(norm)
      .join(" ")
      .includes(q);
  }

  function renderHierarchical(){
    const mode=$("hierMode").value;
    const raw=$("hierSearch").value.trim();
    const q=norm(raw);

    let groups=groupByField(
      remainingOnly(),
      mode
    );

    if(q){
      groups=groups
        .map(([name,arr])=>{
          if(norm(name).includes(q)){
            return [name,arr];
          }

          return [
            name,
            arr.filter(
              p=>personMatches(p,raw)
            )
          ];
        })
        .filter(([,arr])=>arr.length);
    }

    if(!groups.length){
      $("hierContent").innerHTML=
        '<div class="hierEmpty">لا توجد نتائج مطابقة.</div>';

      return;
    }

    const labels={
      school:"المدرسة",
      assigned:"المكلف",
      district:"الدائرة",
      office:"المكتب"
    };

    $("hierContent").innerHTML=
      groups.map(([name,arr])=>{
        let details=
          mode==="school"
            ? nestedSummaryForSchool(arr)
            : mode==="assigned"
            ? nestedSummaryForAssigned(arr)
            : mode==="district"
            ? nestedSummaryForDistrict(arr)
            : nestedSummaryForOffice(arr);

        return `
          <div class="groupCard${q?" open":""}">
            <div
              class="groupHeader"
              onclick="this.parentElement.classList.toggle('open')"
            >
              <div class="groupTitle">
                <span class="chev">▼</span>
                ${e(labels[mode])}: ${e(name)}
              </div>

              <div class="groupCount">
                ${q?"نتائج البحث":"العدد الإجمالي"}:
                ${arr.length}
              </div>
            </div>

            <div class="groupBody">
              ${details}
            </div>
          </div>
        `;
      }).join("");
  }

  function reg(){
    const q=norm($("rq").value);

    let rows=[...registrations]
      .sort((a,b)=>Number(b.id)-Number(a.id))
      .map(r=>({
        r,
        p:person(r.person_no)
      }))
      .filter(x=>x.p);

    if(q){
      rows=rows.filter(
        x=>
          personMatches(x.p,q) ||
          norm(x.r.device_name).includes(q) ||
          norm(sourceLabel(x.r.device_name)).includes(q)
      );
    }

    $("gb").innerHTML=rows.length
      ? rows.map(({r,p})=>`
        <tr>
          <td dir="ltr">
            ${e(
              new Date(
                r.registered_at
              ).toLocaleTimeString("ar-MA")
            )}
          </td>

          <td dir="ltr">
            <strong>${e(r.person_no)}</strong>
            <br>
            <small>${e(sourceLabel(r.device_name))}</small>
          </td>

          <td>${e(p.no)}</td>
          <td class="nm">${e(p.first)}</td>
          <td class="nm">${e(p.last)}</td>
          <td dir="ltr">${e(p.id)}</td>
          <td>${e(p.district)}</td>
          <td>${e(p.office)}</td>
          <td>${e(p.school)}</td>
          <td>${e(p.supervisor)}</td>
          <td>${e(p.assigned)}</td>
        </tr>
      `).join("")
      : `<tr>
          <td colspan="11" class="empty">
            لا يوجد تسجيل
          </td>
        </tr>`;

    $("gs").textContent=
      `المسجلون: ${registrations.length}`;
  }

  function groupStats(field){
    const m=new Map();

    for(const p of P){
      const k=
        String(p[field]??"").trim() ||
        "غير محدد";

      if(!m.has(k)){
        m.set(
          k,
          {
            name:k,
            total:0,
            done:0,
            left:0
          }
        );
      }

      const g=m.get(k);

      g.total++;

      if(isR(p)){
        g.done++;
      }
    }

    const a=[...m.values()];

    a.forEach(
      g=>g.left=g.total-g.done
    );

    return a.sort(
      (a,b)=>
        a.name.localeCompare(
          b.name,
          "ar",
          {
            numeric:true,
            sensitivity:"base"
          }
        )
    );
  }

  function renderSummaryTable(
    field,
    tbodyId,
    metaId
  ){
    const a=groupStats(field);

    $(metaId).textContent=
      a.length+" مجموعة";

    $(tbodyId).innerHTML=
      a.map(g=>`
        <tr>
          <td>${e(g.name)}</td>
          <td>${g.total}</td>
          <td>${g.done}</td>
          <td><b>${g.left}</b></td>
        </tr>
      `).join("");
  }

  function summaries(){
    renderSummaryTable(
      "assigned",
      "assignedSummary",
      "assignedMeta"
    );

    renderSummaryTable(
      "district",
      "districtSummary",
      "districtMeta"
    );

    renderSummaryTable(
      "office",
      "officeSummary",
      "officeMeta"
    );

    $("schoolSummary").innerHTML=
      '<div class="summaryScroll">'+
      '<table class="summaryTable">'+
      '<thead>'+
      '<tr>'+
      '<th>المدرسة</th>'+
      '<th>الإجمالي</th>'+
      '<th>مسجل</th>'+
      '<th>متبقي</th>'+
      '</tr>'+
      '</thead>'+
      '<tbody>'+
      groupStats("school")
        .map(g=>`
          <tr>
            <td>${e(g.name)}</td>
            <td>${g.total}</td>
            <td>${g.done}</td>
            <td><b>${g.left}</b></td>
          </tr>
        `)
        .join("")+
      '</tbody>'+
      '</table>'+
      '</div>';
  }

  const REPORT_COLUMNS={
    no:{
      label:"No",
      get:p=>p.no
    },

    fullName:{
      label:"الاسم الكامل",
      get:p=>`${p.first} ${p.last}`.trim()
    },

    id:{
      label:"رقم بطاقة التعريف",
      get:p=>p.id
    },

    district:{
      label:"الدائرة",
      get:p=>p.district
    },

    office:{
      label:"المكتب",
      get:p=>p.office
    },

    school:{
      label:"المدرسة",
      get:p=>p.school
    },

    supervisor:{
      label:"المؤطر",
      get:p=>p.supervisor
    },

    assigned:{
      label:"المكلف",
      get:p=>p.assigned
    },

    birth:{
      label:"تاريخ الازدياد",
      get:p=>p.birth
    }
  };

  function fillReportChecks(
    id,
    field
  ){
    const vals=[
      ...new Set(
        P.map(
          p=>
            String(
              p[field]??""
            ).trim()
        )
      )
    ].sort(
      (a,b)=>
        a.localeCompare(
          b,
          "ar",
          {
            numeric:true
          }
        )
    );

    $(id).innerHTML=
      vals.map(v=>`
        <label class="checkitem">
          <input
            type="checkbox"
            value="${e(v)}"
            data-report-filter="${field}"
          >
          <span>
            ${e(v||"غير محدد")}
          </span>
        </label>
      `).join("");
  }

  function initReportBuilder(){
    if(reportReady){
      return;
    }

    fillReportChecks(
      "reportAssigned",
      "assigned"
    );

    fillReportChecks(
      "reportDistrict",
      "district"
    );

    fillReportChecks(
      "reportOffice",
      "office"
    );

    fillReportChecks(
      "reportSchool",
      "school"
    );

    document
      .querySelectorAll(".reportSelectAll")
      .forEach(
        b=>b.onclick=ev=>{
          ev.preventDefault();

          document
            .querySelectorAll(
              `#${b.dataset.target} input`
            )
            .forEach(
              x=>x.checked=true
            );
        }
      );

    document
      .querySelectorAll(".reportClearAll")
      .forEach(
        b=>b.onclick=ev=>{
          ev.preventDefault();

          document
            .querySelectorAll(
              `#${b.dataset.target} input`
            )
            .forEach(
              x=>x.checked=false
            );
        }
      );

    reportReady=true;

    renderReportPreview();
  }

  function checkedValues(id){
    return new Set(
      [
        ...document.querySelectorAll(
          `#${id} input:checked`
        )
      ].map(
        x=>x.value
      )
    );
  }

  function reportPeople(){
    const type=$("reportType").value;

    let a=P.filter(
      p=>
        type==="all" ||
        type==="registered"
          ? isR(p)
          : !isR(p)
    );

    if(type==="all"){
      a=[...P];
    }

    for(
      const [field,id]
      of [
        ["assigned","reportAssigned"],
        ["district","reportDistrict"],
        ["office","reportOffice"],
        ["school","reportSchool"]
      ]
    ){
      const s=checkedValues(id);

      if(s.size){
        a=a.filter(
          p=>
            s.has(
              String(
                p[field]??""
              ).trim()
            )
        );
      }
    }

    return a.sort(
      cmp(
        $("reportSort").value
      )
    );
  }

  function reportSelectedColumns(){
    return [
      ...document.querySelectorAll(
        ".reportCol:checked"
      )
    ].map(
      x=>x.value
    );
  }

  function typeLabel(){
    return $("reportType").value==="registered"
      ? "المسجلون"
      : $("reportType").value==="all"
      ? "الجميع"
      : "المتبقون";
  }

  function renderReportPreview(){
    if(!reportReady){
      return;
    }

    const ps=reportPeople();
    const cols=reportSelectedColumns();

    if(!cols.length){
      $("reportPaper").innerHTML=
        '<div class="reportEmpty">اختر عموداً واحداً على الأقل.</div>';

      return;
    }

    $("reportPaper").innerHTML=`
      <h2>
        ${e(
          $("reportTitle").value ||
          "تقرير النتائج"
        )}
      </h2>

      <div class="reportSub">
        نوع القائمة:
        ${typeLabel()}
        |
        ${e(
          new Date().toLocaleString(
            "ar-MA"
          )
        )}
      </div>

      <div class="reportSummaryLine">
        <span>
          الإجمالي: ${P.length}
        </span>

        <span>
          المسجل: ${registrations.length}
        </span>

        <span>
          المتبقي:
          ${P.length-registrations.length}
        </span>

        <span>
          نتائج التقرير:
          ${ps.length}
        </span>
      </div>

      <table class="reportTable">
        <thead>
          <tr>
            ${
              cols.map(
                c=>`
                  <th>
                    ${e(
                      REPORT_COLUMNS[c].label
                    )}
                  </th>
                `
              ).join("")
            }
          </tr>
        </thead>

        <tbody>
          ${
            ps.map(
              p=>`
                <tr>
                  ${
                    cols.map(
                      c=>`
                        <td>
                          ${e(
                            REPORT_COLUMNS[c].get(p) ||
                            ""
                          )}
                        </td>
                      `
                    ).join("")
                  }
                </tr>
              `
            ).join("")
          }
        </tbody>
      </table>
    `;
  }

  function printReportNow(){
    renderReportPreview();

    const w=window.open(
      "",
      "_blank"
    );

    if(!w){
      return alert(
        "اسمح بالنوافذ المنبثقة للطباعة."
      );
    }

    w.document.write(`
      <!doctype html>
      <html lang="ar" dir="rtl">
      <meta charset="utf-8">

      <style>
        @page{
          size:A4 landscape;
          margin:9mm;
        }

        body{
          font-family:Tahoma,Arial,sans-serif;
          direction:rtl;
        }

        h2{
          text-align:center;
        }

        .reportSub,
        .reportSummaryLine{
          text-align:center;
          font-size:10px;
          margin:7px;
        }

        .reportSummaryLine{
          display:flex;
          justify-content:center;
          gap:18px;
        }

        table{
          width:100%;
          border-collapse:collapse;
          font-size:8.5px;
        }

        th,
        td{
          border:1px solid #888;
          padding:4px;
          text-align:right;
        }

        th{
          background:#eee;
        }
      </style>

      <body>
        ${$("reportPaper").innerHTML}
      </body>

      </html>
    `);

    w.document.close();
    w.focus();

    setTimeout(
      ()=>w.print(),
      250
    );
  }

  function renderAll(){
    stats();
    history();
    renderHierarchical();
    reg();
    summaries();

    if(reportReady){
      renderReportPreview();
    }
  }

  async function fullReload(){
    setCloud(
      "تحميل البيانات..."
    );

    const [regs,state]=
      await Promise.all([
        CloudAPI.getRegistrations(),
        CloudAPI.getSystemState()
      ]);

    registrations=regs;

    resetVersion=
      Number(
        state.reset_version
      )||0;

    rebuildRegMap();
    renderAll();

    setCloud(
      "متصل",
      true
    );
  }

  async function syncNew(force=false){
    try{
      const state=
        await CloudAPI.getSystemState();

      const rv=
        Number(
          state.reset_version
        )||0;

      if(rv!==resetVersion){
        await fullReload();
        return;
      }

      const newer=
        await CloudAPI.getRegistrationsAfter(
          lastRegistrationId
        );

      if(newer.length){
        registrations.push(
          ...newer
        );

        rebuildRegMap();
        renderAll();
      }else if(force){
        setCloud(
          "متصل",
          true
        );
      }
    }catch(e){
      setCloud(
        "انقطع الاتصال",
        false
      );
    }
  }

  async function startAdmin(){
    const p=
      await CloudAPI.getProfile();

    if(
      !p ||
      !p.active ||
      p.role!=="admin"
    ){
      throw new Error(
        "هذا الحساب ليس حساب إدارة."
      );
    }

    $("cloudLogin")
      .classList
      .add("hidden");

    setCloud(
      "تحميل قاعدة البيانات..."
    );

    P=normalizePeople(
      await CloudAPI.getPeople()
    );

    await fullReload();

    clearInterval(
      pollTimer
    );

    pollTimer=setInterval(
      ()=>syncNew(false),
      Number(
        APP_CONFIG.ADMIN_POLL_MS
      )||1000
    );
  }

  async function login(){
    $("adminLoginMsg").textContent="";

    try{
      $("adminLoginBtn").disabled=true;

      await CloudAPI.signIn(
        $("adminEmail").value.trim(),
        $("adminPassword").value
      );

      await startAdmin();
    }catch(e){
      $("adminLoginMsg").textContent=
        e.message ||
        "تعذر تسجيل الدخول";
    }finally{
      $("adminLoginBtn").disabled=false;
    }
  }

  $("adminLoginBtn").onclick=
    login;

  $("adminPassword")
    .addEventListener(
      "keydown",
      ev=>{
        if(ev.key==="Enter"){
          login();
        }
      }
    );

  $("cloudLogout").onclick=
    ()=>{
      CloudAPI.signOut();
      location.reload();
    };

  $("go").onclick=
    addBatch;

  $("inp")
    .addEventListener(
      "keydown",
      ev=>{
        if(
          (ev.ctrlKey||ev.metaKey) &&
          ev.key==="Enter"
        ){
          ev.preventDefault();
          addBatch();
        }
      }
    );

  $("rq").oninput=
    reg;

  $("hierMode").onchange=
    renderHierarchical;

  $("hierSearch").oninput=
    renderHierarchical;

  $("previewReport").onclick=
    ()=>{
      initReportBuilder();
      renderReportPreview();
    };

  $("printReport").onclick=
    printReportNow;

  [
    "reportTitle",
    "reportType",
    "reportSort"
  ].forEach(
    id=>
      $(id).addEventListener(
        id==="reportTitle"
          ? "input"
          : "change",
        ()=>{
          if(reportReady){
            renderReportPreview();
          }
        }
      )
  );

  document
    .querySelectorAll(".reportCol")
    .forEach(
      x=>
        x.onchange=()=>{
          if(reportReady){
            renderReportPreview();
          }
        }
    );

  $("copyHistory").onclick=
    ()=>
      navigator.clipboard?.writeText(
        [...registrations]
          .sort(
            (a,b)=>
              Number(a.id)-
              Number(b.id)
          )
          .map(
            r=>r.person_no
          )
          .join("\n")
      );

  $("copyRegistered").onclick=
    $("copyHistory").onclick;

  $("clearHistory").onclick=
    ()=>
      alert(
        "السجل المركزي لا يُمسح منفرداً. استخدم إعادة الضبط لمسح التسجيلات."
      );

  $("reset").onclick=
    async()=>{
      if(
        !confirm(
          "هل أنت متأكد؟ سيتم مسح كل التسجيلات من جميع الأجهزة."
        )
      ){
        return;
      }

      if(
        !confirm(
          "تأكيد أخير: إعادة الضبط ستعيد جميع الأشخاص إلى المتبقين. هل تريد المتابعة؟"
        )
      ){
        return;
      }

      try{
        await CloudAPI.resetRegistrations();
        await fullReload();

        msg(
          "تمت إعادة الضبط.",
          "ok"
        );
      }catch(e){
        alert(
          "تعذر إعادة الضبط: "+
          e.message
        );
      }
    };

  document
    .querySelectorAll(".tab")
    .forEach(
      b=>
        b.onclick=()=>{
          document
            .querySelectorAll(".tab")
            .forEach(
              x=>
                x.classList.remove(
                  "active"
                )
            );

          document
            .querySelectorAll(".panel")
            .forEach(
              x=>
                x.classList.remove(
                  "active"
                )
            );

          b.classList.add(
            "active"
          );

          $(b.dataset.tab)
            .classList
            .add("active");

          if(
            b.dataset.tab==="summary"
          ){
            summaries();
          }

          if(
            b.dataset.tab==="report"
          ){
            initReportBuilder();
            renderReportPreview();
          }
        }
    );

  (async()=>{
    if(
      !CloudAPI.configured()
    ){
      $("adminLoginMsg").textContent=
        "ضع Supabase URL و Anon Key داخل config.js أولاً.";

      return;
    }

    const s=
      await CloudAPI.validSession();

    if(s){
      try{
        await startAdmin();
      }catch(e){
        $("adminLoginMsg").textContent=
          e.message;
      }
    }
  })();
})();