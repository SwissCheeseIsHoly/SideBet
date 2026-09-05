
(() => {
  const SB=window.SideBet;
  let state=SB.load();

  function qs(id){ return document.getElementById(id); }

  if (document.body.dataset.page==="my-bets") {
    let metric="equity";

    function spark(m) {
      return `<svg viewBox="0 0 100 36"><path d="${SB.path(m.series,100,36,3)}" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`;
    }

    function render() {
      state=SB.load();
      const active=state.markets.filter(m=>!SB.isClosed(m));
      const groups=SB.GROUPS.filter(g=>active.some(m=>m.group===g));
      const equity=active.reduce((s,m)=>s+SB.myEquity(state,m),0);
      const pledged=active.reduce((s,m)=>s+SB.myPledged(state,m),0);
      const changes=active.map(SB.changePct);
      const avg=changes.length?changes.reduce((a,b)=>a+b,0)/changes.length:0;

      qs("equity").textContent=SB.fmtMoney(equity);
      qs("dayChange").textContent=`${avg>=0?"+":""}${avg.toFixed(1)}% today`;
      qs("dayChange").className=avg>=0?"positive":"negative";
      qs("openCount").textContent=active.length;
      qs("groupCount").textContent=groups.length;
      qs("pledged").textContent=SB.fmtMoney(pledged);

      const portfolioSeries=Array.from({length:60},(_,i)=>{
        const base=active.reduce((sum,m)=>{
          const s=m.series||[50];
          const idx=Math.floor((i/59)*(s.length-1));
          return sum+(s[idx]||0);
        },0);
        return base||(50+Math.sin(i/4)*4);
      });
      qs("portfolioPath").setAttribute("d",SB.path(portfolioSeries,600,150,7));

      const wrap=qs("groups");
      wrap.innerHTML="";
      if(!active.length){
        wrap.innerHTML=`<div class="empty">No active bets yet. <a href="create-bet.html" style="color:var(--gold-3);font-weight:800;">Create one.</a></div>`;
        return;
      }

      groups.forEach(g=>{
        const ms=active.filter(m=>m.group===g);
        const sec=document.createElement("section");
        sec.className="group-card";
        sec.innerHTML=`<div class="group-head"><h2>${g}</h2><span>${ms.length} ${ms.length===1?"market":"markets"}</span></div><div class="group-body"></div>`;
        const body=sec.querySelector(".group-body");

        ms.forEach(m=>{
          const ch=SB.changePct(m);
          let primary="",label="";
          if(metric==="equity"){primary=SB.fmtMoney(SB.myEquity(state,m),m.unit);label="my equity";}
          if(metric==="change"){primary=`${ch>=0?"+":""}${ch.toFixed(1)}%`;label="change";}
          if(metric==="price"){primary=`${SB.currentPrice(m).toFixed(0)}¢`;label="price";}
          if(metric==="pledged"){primary=SB.fmtMoney(SB.myPledged(state,m),m.unit);label="pledged";}

          const a=document.createElement("a");
          a.className="market-row";
          a.href=`market.html?id=${encodeURIComponent(m.id)}`;
          a.innerHTML=`
            <div><strong class="title"></strong><small></small></div>
            <div class="spark">${spark(m)}</div>
            <div class="metric change-col"><strong class="${ch>=0?"positive":"negative"}">${ch>=0?"+":""}${ch.toFixed(1)}%</strong><span>change</span></div>
            <div class="metric"><strong>${primary}</strong><span>${label}</span></div>`;
          a.querySelector(".title").textContent=m.title;
          a.querySelector("small").textContent=m.question;
          body.appendChild(a);
        });
        wrap.appendChild(sec);
      });
    }

    document.querySelectorAll("[data-metric]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        metric=btn.dataset.metric;
        document.querySelectorAll("[data-metric]").forEach(b=>b.classList.toggle("active",b===btn));
        render();
      });
    });

    render();
  }

  if (document.body.dataset.page==="past-bets") {
    let filter="all";

    const SYN={
      family:["family","baby","pregnancy","sister","mom","dad","parent","relative"],
      friends:["friends","friend","buddy","crew","group"],
      roommates:["roommate","roommates","roomie","house","apartment"],
      work:["work","office","coworker","job","boss"],
      sports:["sports","sport","football","basketball","baseball","game","team","track","pole","vault","arkansas"]
    };

    function norm(t){return String(t||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();}
    function lev(a,b){
      const m=a.length,n=b.length,d=Array.from({length:m+1},()=>Array(n+1).fill(0));
      for(let i=0;i<=m;i++)d[i][0]=i;
      for(let j=0;j<=n;j++)d[0][j]=j;
      for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){
        const c=a[i-1]===b[j-1]?0:1;
        d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);
      }
      return d[m][n];
    }
    function tokens(q){
      const base=norm(q).split(" ").filter(Boolean), out=new Set(base);
      Object.values(SYN).forEach(list=>{
        if(list.some(w=>base.some(t=>w.includes(t)||t.includes(w)))) list.forEach(w=>out.add(w));
      });
      return [...out];
    }
    function score(m,q){
      q=norm(q);
      if(!q)return 1;
      const hay=norm([m.title,m.question,m.group,m.description,m.rules,...m.options.map(o=>o.name)].join(" "));
      if(hay.includes(q))return 100;
      const ws=hay.split(" ");
      let s=0;
      tokens(q).forEach(t=>{
        if(hay.includes(t)){s+=12;return;}
        if(ws.some(w=>w.startsWith(t)||t.startsWith(w))){s+=7;return;}
        if(t.length>=4&&ws.some(w=>Math.abs(w.length-t.length)<=2&&lev(t,w)<=2))s+=4;
      });
      return s;
    }

    function render(){
      state=SB.load();
      const q=qs("search").value.trim();
      let closed=state.markets.filter(SB.isClosed).filter(m=>{
        const win=SB.didWin(state,m);
        if(filter==="won")return win===true;
        if(filter==="lost")return win===false;
        return true;
      });
      closed=closed.map(m=>({m,s:score(m,q)})).filter(x=>x.s>0).sort((a,b)=>{
        if(q&&b.s!==a.s)return b.s-a.s;
        return new Date(b.m.closedAt||b.m.resolution?.resolvedAt||0)-new Date(a.m.closedAt||a.m.resolution?.resolvedAt||0);
      }).map(x=>x.m);

      const out=qs("history");
      out.innerHTML="";
      if(!closed.length){
        out.innerHTML=`<div class="empty">No matching past bets. Try a broader word like “sports”, “family”, or “work”.</div>`;
        return;
      }

      const groups=new Map();
      closed.forEach(m=>{
        const key=SB.fmtDate(m.closedAt||m.resolution?.resolvedAt,{month:"long",year:"numeric"});
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(m);
      });

      groups.forEach((ms,label)=>{
        const sec=document.createElement("section");
        sec.className="month-group";
        sec.innerHTML=`<h2>${label}</h2>`;
        ms.forEach(m=>{
          const win=SB.didWin(state,m);
          const div=document.createElement("div");
          div.className="history-item";
          div.innerHTML=`
            <a href="market.html?id=${encodeURIComponent(m.id)}"><strong></strong><p></p></a>
            <div class="history-result"><strong class="${win===true?"positive":win===false?"negative":""}">${win===true?"Won":win===false?"Lost":"Closed"}</strong><div style="color:var(--muted);font-size:.76rem;margin-top:4px;">${SB.fmtMoney(SB.myPledged(state,m),m.unit)} pledged</div></div>`;
          div.querySelector("a strong").textContent=m.title;
          div.querySelector("a p").textContent=`${m.group} • ${SB.fmtDate(m.closedAt||m.resolution?.resolvedAt)} • Winner: ${SB.outcomeName(m)}`;
          sec.appendChild(div);
        });
        out.appendChild(sec);
      });
    }

    qs("search").addEventListener("input",render);
    document.querySelectorAll("[data-history-filter]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        filter=btn.dataset.historyFilter;
        document.querySelectorAll("[data-history-filter]").forEach(b=>b.classList.toggle("active",b===btn));
        render();
      });
    });
    render();
  }

  if (document.body.dataset.page==="profile") {
    function render(){
      state=SB.load();
      const active=state.markets.filter(m=>!SB.isClosed(m)).length;
      const closed=state.markets.filter(SB.isClosed);
      const mine=closed.filter(m=>SB.didWin(state,m)!==null);
      const wins=mine.filter(m=>SB.didWin(state,m)===true).length;
      qs("avatar").textContent=state.profile.initials;
      qs("name").textContent=state.profile.name;
      qs("handle").textContent=state.profile.handle;
      qs("active").textContent=active;
      qs("closed").textContent=closed.length;
      qs("winRate").textContent=`${mine.length?Math.round(wins/mine.length*100):0}%`;
      qs("profileName").value=state.profile.name;
      qs("profileHandle").value=state.profile.handle;
      qs("profileInitials").value=state.profile.initials;
    }

    qs("profileForm").addEventListener("submit",e=>{
      e.preventDefault();
      const h=qs("profileHandle").value.trim();
      state.profile={
        name:qs("profileName").value.trim()||"User",
        handle:h.startsWith("@")?h:`@${h}`,
        initials:qs("profileInitials").value.trim().toUpperCase()||"SB"
      };
      SB.save(state); render();
      qs("profileMessage").textContent="Profile saved.";
      setTimeout(()=>qs("profileMessage").textContent="",1800);
    });

    qs("export").addEventListener("click",()=>{
      const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;a.download="sidebet-v4-backup.json";
      document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    });

    qs("import").addEventListener("change",async e=>{
      const file=e.target.files?.[0];
      if(!file)return;
      try{
        const parsed=JSON.parse(await file.text());
        if(!parsed||!Array.isArray(parsed.markets))throw new Error();
        state=parsed;SB.save(state);render();alert("SideBet data imported.");
      }catch{alert("That does not look like a valid SideBet V4 backup.");}
      e.target.value="";
    });

    render();
  }

  if (document.body.dataset.page==="create") {
    let payout="parimutuel";
    const optWrap=qs("options");

    function addOption(value=""){
      if(optWrap.children.length>=8)return;
      const row=document.createElement("div");
      row.className="option-row";
      row.innerHTML=`<input class="option-input" maxlength="40" placeholder="Option name" required><button class="btn btn-outline btn-small remove" type="button">Remove</button>`;
      row.querySelector("input").value=value;
      row.querySelector(".remove").addEventListener("click",()=>{row.remove();syncRemove();});
      optWrap.appendChild(row);syncRemove();
    }
    function syncRemove(){
      const rows=[...optWrap.children];
      rows.forEach(r=>r.querySelector(".remove").disabled=rows.length<=2);
    }
    function setPayout(v){
      payout=v;
      document.querySelectorAll("[data-payout]").forEach(b=>b.classList.toggle("active",b.dataset.payout===v));
    }

    addOption("Yes"); addOption("No");
    qs("time").value="00:00";

    const params=new URLSearchParams(location.search);
    const g=params.get("group");
    const p=params.get("payout");
    if(g&&SB.GROUPS.includes(g))qs("group").value=g;
    if(["parimutuel","winner-take-all","tracking-only"].includes(p))setPayout(p);

    document.querySelectorAll("[data-payout]").forEach(b=>b.addEventListener("click",()=>setPayout(b.dataset.payout)));
    qs("addOption").addEventListener("click",()=>addOption(""));

    qs("createForm").addEventListener("submit",e=>{
      e.preventDefault();
      const title=qs("title").value.trim(), question=qs("question").value.trim(), unit=qs("unit").value.trim();
      const date=qs("date").value, time=qs("time").value, rules=qs("rules").value.trim();
      const names=[...document.querySelectorAll(".option-input")].map(i=>i.value.trim()).filter(Boolean);
      const msg=qs("message");

      if(!title)return msg.textContent="Bet title is required.";
      if(!question)return msg.textContent="Main question is required.";
      if(!unit)return msg.textContent="Unit label is required.";
      if(!date)return msg.textContent="Deadline date is required.";
      if(!time)return msg.textContent="Deadline time is required.";
      if(names.length<2)return msg.textContent="At least two options are required.";
      if(new Set(names.map(n=>n.toLowerCase())).size!==names.length)return msg.textContent="Options must be different.";
      if(!rules)return msg.textContent="Rules are required.";

      const deadline=new Date(`${date}T${time}:00`);
      if(Number.isNaN(deadline.getTime()))return msg.textContent="Enter a valid deadline.";

      const market={
        id:SB.makeId(),title,question,group:qs("group").value,unit,deadline:deadline.toISOString(),payout,
        description:qs("description").value.trim(),rules,
        options:names.map(name=>({id:SB.makeId(),name})),
        entries:[],resolution:null,closedAt:null,createdAt:new Date().toISOString(),
        series:SB.demoSeries(Math.floor(Math.random()*40),56,50)
      };
      state.markets.unshift(market);SB.save(state);
      location.href=`market.html?id=${encodeURIComponent(market.id)}`;
    });
  }

  if (document.body.dataset.page==="market") {
    const id=new URLSearchParams(location.search).get("id");
    const market=SB.getMarket(state,id);
    let range="1M";

    if(!market){
      qs("market").innerHTML=`<div class="empty">Market not found. <a href="my-bets.html" style="color:var(--gold-3);font-weight:800;">Return to My Bets.</a></div>`;
      return;
    }

    function render(){
      state=SB.load();
      const m=SB.getMarket(state,id);
      const total=SB.totalPledged(m), price=SB.currentPrice(m), ch=SB.changePct(m);
      qs("title").textContent=m.title;
      qs("question").textContent=m.question;
      qs("group").textContent=`${m.group.toUpperCase()} • ${SB.isClosed(m)?"CLOSED":"OPEN"}`;
      qs("price").textContent=`${price.toFixed(0)}¢`;
      qs("change").textContent=`${ch>=0?"+":""}${ch.toFixed(1)}%`;
      qs("change").className=ch>=0?"positive":"negative";
      qs("deadline").textContent=SB.fmtDateTime(m.deadline);
      qs("groupName").textContent=m.group;
      qs("total").textContent=SB.fmtMoney(total,m.unit);
      qs("settlement").textContent=SB.payoutName(m.payout);
      qs("mine").textContent=SB.fmtMoney(SB.myPledged(state,m),m.unit);
      qs("rules").textContent=m.rules;
      qs("join").style.display=SB.isClosed(m)?"none":"inline-flex";

      const outcomes=qs("outcomes");
      outcomes.innerHTML="";
      m.options.forEach(o=>{
        const pledged=(m.entries||[]).filter(e=>e.optionId===o.id).reduce((s,e)=>s+(Number(e.amount)||0),0);
        const share=total?(pledged/total)*100:0;
        const d=document.createElement("div");
        d.className="outcome";
        d.innerHTML=`<div><strong></strong><span></span></div><div class="price">${share.toFixed(0)}¢</div>`;
        d.querySelector("strong").textContent=o.name;
        d.querySelector("span").textContent=`${SB.fmtMoney(pledged,m.unit)} pledged`;
        outcomes.appendChild(d);
      });

      updateChart();
    }

    function updateChart(){
      const m=SB.getMarket(SB.load(),id);
      let s=m.series||[50,50], count=s.length;
      if(range==="1D")count=Math.min(8,s.length);
      if(range==="1W")count=Math.min(20,s.length);
      if(range==="1M")count=Math.min(40,s.length);
      s=s.slice(-count);
      qs("chartPath").setAttribute("d",SB.path(s,920,300,14));
      document.querySelectorAll("[data-range]").forEach(b=>b.classList.toggle("active",b.dataset.range===range));
    }

    document.querySelectorAll("[data-range]").forEach(b=>b.addEventListener("click",()=>{range=b.dataset.range;updateChart();}));

    qs("join").addEventListener("click",()=>{
      const m=SB.getMarket(SB.load(),id);
      const name=prompt("Name:",state.profile.name);
      if(!name)return;
      const pick=prompt(`Pick one: ${m.options.map(o=>o.name).join(", ")}`);
      if(!pick)return;
      const opt=m.options.find(o=>o.name.toLowerCase()===pick.trim().toLowerCase());
      if(!opt){alert("Pick one of the listed options.");return;}
      const amount=Number(prompt(`Pledge amount (${m.unit}):`));
      if(!Number.isFinite(amount)||amount<=0){alert("Enter a positive amount.");return;}
      m.entries.push({id:SB.makeId(),name:name.trim(),optionId:opt.id,amount,createdAt:new Date().toISOString()});
      const last=SB.currentPrice(m);
      m.series.push(Math.max(4,Math.min(96,last+(Math.random()*4-1.2))));
      SB.save(state);render();
    });

    render();
  }
})();
