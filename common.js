
(() => {
  const KEY = "sidebet_v4_state";
  const GROUPS = ["Family","Friends","Roommates","Work","Local Sports","Other"];

  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function demoSeries(seed, length=56, start=50) {
    let v = start;
    const a = [];
    for (let i=0;i<length;i++) {
      v += Math.sin((i+seed)*.66)*1.15 + Math.cos((i+seed)*.29)*.8 + ((i%5)-2)*.15;
      v = Math.max(4, Math.min(96, v));
      a.push(Number(v.toFixed(2)));
    }
    return a;
  }

  function isoOffset(days) {
    const d = new Date();
    d.setDate(d.getDate()+days);
    d.setHours(0,0,0,0);
    return d.toISOString();
  }

  function seed() {
    return {
      profile: { name: "Grady", handle: "@sidebet", initials: "GH" },
      markets: [
        {
          id:"m-ark",title:"Will Arkansas win Saturday?",question:"Will Arkansas win its football game this Saturday?",
          group:"Friends",unit:"$",deadline:isoOffset(2),payout:"parimutuel",
          description:"Game-day prediction with the group.",rules:"Entries lock at kickoff. Final score decides the market.",
          options:[{id:"ark-y",name:"Yes"},{id:"ark-n",name:"No"}],
          entries:[{id:"e1",name:"Grady",optionId:"ark-y",amount:35},{id:"e2",name:"Mike",optionId:"ark-y",amount:50},{id:"e3",name:"Tyler",optionId:"ark-n",amount:40}],
          resolution:null,closedAt:null,createdAt:isoOffset(-2),series:demoSeries(2,60,56)
        },
        {
          id:"m-baby",title:"Baby Boy or Girl?",question:"Will the baby be a boy or a girl?",
          group:"Family",unit:"$",deadline:isoOffset(16),payout:"parimutuel",
          description:"Family prediction pool.",rules:"Ultrasound result determines the market.",
          options:[{id:"bb",name:"Boy"},{id:"bg",name:"Girl"}],
          entries:[{id:"e4",name:"Grady",optionId:"bb",amount:30},{id:"e5",name:"Mom",optionId:"bg",amount:20},{id:"e6",name:"Dad",optionId:"bb",amount:25}],
          resolution:null,closedAt:null,createdAt:isoOffset(-4),series:demoSeries(8,60,48)
        },
        {
          id:"m-dishes",title:"Will Jake do the dishes tonight?",question:"Will Jake finish the dishes before midnight?",
          group:"Roommates",unit:"$",deadline:isoOffset(1),payout:"tracking-only",
          description:"Roommate accountability market.",rules:"Dishes must be fully washed and put away before midnight.",
          options:[{id:"dy",name:"Yes"},{id:"dn",name:"No"}],
          entries:[{id:"e7",name:"Grady",optionId:"dn",amount:10},{id:"e8",name:"Jake",optionId:"dy",amount:10}],
          resolution:null,closedAt:null,createdAt:isoOffset(-1),series:demoSeries(14,60,51)
        },
        {
          id:"m-lunch",title:"Will lunch arrive before noon?",question:"Will the office lunch order arrive before 12:00 PM?",
          group:"Work",unit:"$",deadline:isoOffset(-8),payout:"tracking-only",
          description:"Office delivery prediction.",rules:"Delivery timestamp decides the result.",
          options:[{id:"ly",name:"Yes"},{id:"ln",name:"No"}],
          entries:[{id:"e9",name:"Grady",optionId:"ly",amount:15}],
          resolution:{optionId:"ln",resolvedAt:isoOffset(-8)},closedAt:isoOffset(-8),createdAt:isoOffset(-10),series:demoSeries(20,48,58)
        },
        {
          id:"m-pole",title:"14'6 Pole Vault This Meet?",question:"Will Grady clear 14 feet 6 inches at the next meet?",
          group:"Local Sports",unit:"$",deadline:isoOffset(-21),payout:"tracking-only",
          description:"Track meet prediction.",rules:"Official meet result decides the market.",
          options:[{id:"py",name:"Yes"},{id:"pn",name:"No"}],
          entries:[{id:"e10",name:"Grady",optionId:"py",amount:20}],
          resolution:{optionId:"py",resolvedAt:isoOffset(-21)},closedAt:isoOffset(-21),createdAt:isoOffset(-28),series:demoSeries(33,48,41)
        }
      ]
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        const s = seed();
        save(s);
        return s;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.markets)) throw new Error();
      return parsed;
    } catch {
      const s = seed();
      save(s);
      return s;
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function getMarket(state,id) {
    return state.markets.find(m=>m.id===id) || null;
  }

  function isClosed(m) { return Boolean(m.closedAt || m.resolution); }
  function totalPledged(m) { return (m.entries||[]).reduce((s,e)=>s+(Number(e.amount)||0),0); }
  function currentPrice(m) {
    const s = Array.isArray(m.series)&&m.series.length ? m.series : [50];
    return Number(s[s.length-1])||50;
  }
  function prevPrice(m) {
    const s = Array.isArray(m.series)&&m.series.length>1 ? m.series : [50,50];
    return Number(s[s.length-2])||currentPrice(m);
  }
  function changePct(m) {
    const p = prevPrice(m), c = currentPrice(m);
    return p ? ((c-p)/p)*100 : 0;
  }
  function myEntries(state,m) {
    const n = (state.profile?.name||"").toLowerCase();
    return (m.entries||[]).filter(e=>String(e.name).toLowerCase()===n);
  }
  function myPledged(state,m) {
    return myEntries(state,m).reduce((s,e)=>s+(Number(e.amount)||0),0);
  }
  function myEquity(state,m) {
    return myPledged(state,m) * (.55 + currentPrice(m)/100);
  }
  function fmtMoney(v,unit="$") {
    const n=Number(v)||0;
    const f=n.toLocaleString(undefined,{maximumFractionDigits:2});
    return unit==="$" ? `$${f}` : `${f} ${unit}`;
  }
  function fmtDate(v,opts={month:"short",day:"numeric",year:"numeric"}) {
    const d=new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString([],opts);
  }
  function fmtDateTime(v) {
    const d=new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString([],{dateStyle:"medium",timeStyle:"short"});
  }
  function path(series,w=600,h=150,pad=8) {
    if (!series || series.length<2) return "";
    const min=Math.min(...series), max=Math.max(...series), spread=Math.max(1,max-min);
    return series.map((v,i)=>{
      const x=pad+(i/(series.length-1))*(w-pad*2);
      const y=h-pad-((v-min)/spread)*(h-pad*2);
      return `${i===0?"M":"L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ");
  }
  function outcomeName(m) {
    return m.resolution ? (m.options.find(o=>o.id===m.resolution.optionId)?.name||"Resolved") : "Unresolved";
  }
  function didWin(state,m) {
    if (!m.resolution) return null;
    const mine=myEntries(state,m);
    if (!mine.length) return null;
    return mine.some(e=>e.optionId===m.resolution.optionId);
  }
  function payoutName(v) {
    if (v==="winner-take-all") return "Winner Takes All";
    if (v==="tracking-only") return "Prediction Only";
    return "Pool Split";
  }

  window.SideBet = {
    KEY,GROUPS,makeId,demoSeries,load,save,getMarket,isClosed,totalPledged,currentPrice,changePct,myEntries,myPledged,myEquity,fmtMoney,fmtDate,fmtDateTime,path,outcomeName,didWin,payoutName
  };

  const menuBtn=document.querySelector(".menu-button");
  const panel=document.querySelector(".menu-panel");

  if (menuBtn && panel) {
    function closeMenu() {
      panel.classList.remove("open");
      menuBtn.setAttribute("aria-expanded","false");
    }
    menuBtn.addEventListener("click",e=>{
      e.stopPropagation();
      const open=!panel.classList.contains("open");
      panel.classList.toggle("open",open);
      menuBtn.setAttribute("aria-expanded",String(open));
    });
    document.addEventListener("click",e=>{
      if (!panel.contains(e.target) && e.target!==menuBtn) closeMenu();
    });
    document.addEventListener("keydown",e=>{
      if (e.key==="Escape") closeMenu();
    });
  }

  const current=document.body.dataset.page;
  document.querySelectorAll(".menu-panel a[data-page]").forEach(a=>{
    a.classList.toggle("current",a.dataset.page===current);
  });
})();
