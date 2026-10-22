/* Painel do Quiabo — app (PWA) sobre Supabase */
(function () {
  "use strict";
  const CFG = window.QUIABO_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  /* ---------- formatação ---------- */
  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
  const NUM2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PCT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, signDisplay: "always" });
  const brl = (v) => (v == null || isNaN(v) ? "—" : BRL.format(v));
  const kg = (v) => (v == null || isNaN(v) ? "—" : NUM.format(v) + " kg");
  const pl = (n, a, b) => n + " " + (n === 1 ? a : b);
  const today = () => new Date().toLocaleDateString("sv-SE");
  const parseD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtD = (s, opt) => parseD(s).toLocaleDateString("pt-BR", opt || { day: "2-digit", month: "2-digit", year: "numeric" });
  const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : NaN; };
  const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  const ym = (s) => s.slice(0, 7);
  const SIT = { MFI: "Mercado firme", MFR: "Mercado fraco", ME: "Mercado estável", MES: "Mercado estável" };
  const REF = { min: "mínimo", comum: "comum", max: "máximo" };

  /* ---------- estado ---------- */
  const S = {
    series: [], cfg: { fonte: "ceasa", ref: "comum", preco_proprio: null, kg_por_caixa: 14 }, cfgLoaded: false,
    colheitas: [], vendas: [], despesas: [], range: "90", filter: "todas", view: "inicio", sb: null, user: null,
  };
  try { const r = localStorage.getItem("quiabo-range"); if (r) S.range = r; } catch (e) {}

  document.querySelectorAll("[data-logo]").forEach((el) => el.append($("logo-tpl").content.cloneNode(true)));

  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600); }
  function setSync(state, txt) { $("sync-dot").className = "dot " + state; $("sync-txt").textContent = txt; }

  /* ---------- cálculos ---------- */
  const latest = () => (S.series.length ? S.series[S.series.length - 1] : null);
  function precoEmUso() {
    if (S.cfg.fonte === "proprio" && Number(S.cfg.preco_proprio) > 0) return { v: Number(S.cfg.preco_proprio), label: "Meu preço de venda" };
    const l = latest(); if (!l) return { v: null, label: "Aguardando cotação" };
    const ref = S.cfg.ref || "comum";
    return { v: l[ref] ?? l.comum, label: "CEASA, " + REF[ref] + " de " + fmtD(l.d, { day: "2-digit", month: "short" }) };
  }

  /* ---------- telas ---------- */
  function renderQuote() {
    const l = latest(); if (!l) return;
    const prev = S.series.length > 1 ? S.series[S.series.length - 2] : null;
    $("q-price").firstChild.textContent = brl(l.comum);
    $("q-date").textContent = "Boletim de " + fmtD(l.d, { weekday: "long", day: "2-digit", month: "long" });
    const v = $("q-var");
    if (prev && prev.comum) {
      const p = (l.comum / prev.comum - 1) * 100;
      v.className = "chip " + (p > 0.05 ? "up" : p < -0.05 ? "down" : "flat");
      v.textContent = (p > 0.05 ? "▲ " : p < -0.05 ? "▼ " : "") + PCT.format(p) + "% vs " + fmtD(prev.d, { day: "2-digit", month: "2-digit" });
    } else { v.className = "chip flat"; v.textContent = "sem boletim anterior"; }
    $("q-sit").textContent = l.sit ? SIT[l.sit] || l.sit : "situação não informada";
    $("q-range").textContent = brl(l.min) + " a " + NUM2.format(l.max);
    const end = parseD(l.d);
    const inLast = (days) => S.series.filter((x) => (end - parseD(x.d)) / 864e5 < days);
    const s30 = inLast(30), s365 = inLast(365);
    $("q-m30").textContent = brl(s30.length ? sum(s30, (x) => x.comum) / s30.length : null); $("q-m30s").textContent = pl(s30.length, "boletim", "boletins");
    $("q-m12").textContent = brl(s365.length ? sum(s365, (x) => x.comum) / s365.length : null); $("q-m12s").textContent = pl(s365.length, "boletim", "boletins");
    if (s365.length > 5) {
      const pct = Math.round((s365.filter((x) => x.comum < l.comum).length / s365.length) * 100);
      $("q-pct").textContent = pct + "%"; $("q-pcts").textContent = "dos dias do último ano tiveram preço menor";
    }
  }

  function renderKpis() {
    const p = precoEmUso();
    $("k-preco").textContent = p.v ? brl(p.v) + "/kg" : "—"; $("k-preco-s").textContent = p.label;
    const has = S.colheitas.length || S.vendas.length;
    const ent = sum(S.colheitas, (x) => x.kg), sai = sum(S.vendas, (x) => x.kg), est = ent - sai;
    $("k-estoque").textContent = has ? kg(est) : "—";
    $("k-estoque-s").textContent = has ? kg(ent) + " entraram · " + kg(sai) + " vendidos" : "entradas menos vendas";
    $("k-valor").textContent = p.v && has ? brl(Math.max(est, 0) * p.v) : "—";
    const mes = ym(today());
    const vm = S.vendas.filter((x) => ym(x.data) === mes), dm = S.despesas.filter((x) => ym(x.data) === mes);
    const tv = sum(vm, (x) => x.total), td = sum(dm, (x) => x.valor);
    $("k-vendas").textContent = brl(tv); $("k-vendas-s").textContent = pl(vm.length, "venda", "vendas") + " · " + kg(sum(vm, (x) => x.kg));
    $("k-desp").textContent = brl(td); $("k-desp-s").textContent = pl(dm.length, "lançamento", "lançamentos");
    const ks = $("k-saldo"); ks.textContent = brl(tv - td); ks.className = "v " + (tv - td >= 0 ? "pos" : "neg");
    const pend = S.vendas.filter((x) => !x.pago);
    $("k-receber").textContent = brl(sum(pend, (x) => x.total));
    $("k-receber-s").textContent = pend.length ? pl(pend.length, "venda não paga", "vendas não pagas") : "nada pendente";
  }

  function renderPriceCfg() {
    const p = precoEmUso();
    $("p-now").textContent = p.v ? brl(p.v) + "/kg" : "—"; $("p-now-s").textContent = p.label;
    document.querySelectorAll("#p-src button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.src === S.cfg.fonte)));
    $("p-ceasa-opts").hidden = S.cfg.fonte !== "ceasa";
    $("p-own-opts").hidden = S.cfg.fonte !== "proprio";
    if (document.activeElement !== $("p-ref")) $("p-ref").value = S.cfg.ref || "comum";
    if (document.activeElement !== $("p-own") && S.cfg.preco_proprio != null) $("p-own").value = Number(S.cfg.preco_proprio);
    if (document.activeElement !== $("p-cx")) $("p-cx").value = Number(S.cfg.kg_por_caixa) || 14;
    const semPreco = S.cfg.fonte === "proprio" && !(Number(S.cfg.preco_proprio) > 0);
    $("p-hint").textContent = semPreco ? "Informe e salve seu preço; até lá, o app usa o preço comum da CEASA." : "O peso da caixa converte lançamentos feitos em caixas. A CEASA-ES usava a caixa de 14 kg.";
    $("p-hint").className = "hint" + (semPreco ? " err" : "");
    const vp = $("v-preco"); if (!vp.dataset.touched && p.v) vp.value = p.v.toFixed(2);
    updVendaTotal();
    $("lg-own").hidden = !(Number(S.cfg.preco_proprio) > 0);
  }

  function drawChart() {
    const box = $("chart"), tip = $("tip");
    d3.select(box).select("svg").remove();
    if (!S.series.length || box.clientWidth === 0) { $("chart-empty").hidden = !!S.series.length; return; }
    $("chart-empty").hidden = true;
    const end = parseD(latest().d);
    const data = S.range === "all" ? S.series : S.series.filter((x) => (end - parseD(x.d)) / 864e5 < Number(S.range));
    if (!data.length) return;
    const W = Math.max(280, box.clientWidth), H = W < 520 ? 230 : 280, m = { t: 14, r: 12, b: 28, l: 62 };
    const x = d3.scaleTime().domain(d3.extent(data, (d) => parseD(d.d))).range([m.l, W - m.r]);
    const [x0, x1] = x.domain();
    const sales = S.vendas.filter((v) => v.preco_kg > 0 && parseD(v.data) >= x0 && parseD(v.data) <= x1);
    const own = Number(S.cfg.preco_proprio) > 0 ? Number(S.cfg.preco_proprio) : null;
    const lo = d3.min([d3.min(data, (d) => d.min), d3.min(sales, (s) => s.preco_kg), own].filter((v) => v != null));
    const hi = d3.max([d3.max(data, (d) => d.max), d3.max(sales, (s) => s.preco_kg), own].filter((v) => v != null));
    const y = d3.scaleLinear().domain([Math.max(0, lo * 0.9), hi * 1.06]).nice().range([H - m.b, m.t]);
    const svg = d3.select(box).insert("svg", ":first-child").attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%").attr("role", "img").attr("aria-label", "Preço do quiabo na CEASA por dia");
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat("")).call((g) => g.select(".domain").remove());
    const short = S.range === "30" || S.range === "90";
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 520 ? 4 : 7).tickFormat((d) => d.toLocaleDateString("pt-BR", short ? { day: "2-digit", month: "2-digit" } : { month: "short", year: "2-digit" }).replace(". de ", "/").replace(".", "")));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => "R$ " + v.toFixed(v < 10 ? 2 : 0).replace(".", ","))).call((g) => g.select(".domain").remove());
    svg.append("path").datum(data).attr("fill", "var(--band)").attr("d", d3.area().x((d) => x(parseD(d.d))).y0((d) => y(d.min)).y1((d) => y(d.max)).curve(d3.curveMonotoneX));
    svg.append("path").datum(data).attr("fill", "none").attr("stroke", "var(--leaf)").attr("stroke-width", 2).attr("d", d3.line().x((d) => x(parseD(d.d))).y((d) => y(d.comum)).curve(d3.curveMonotoneX));
    if (own) {
      svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(own)).attr("y2", y(own)).attr("stroke", "var(--eye)").attr("stroke-width", 1.5).attr("stroke-dasharray", "5 4");
      svg.append("text").attr("x", m.l + 6).attr("y", y(own) - 5).attr("fill", "var(--eye)").attr("font-size", 11).attr("font-family", "var(--f-data)").text("meu preço " + brl(own));
    }
    svg.append("g").selectAll("circle").data(sales).join("circle").attr("cx", (s) => x(parseD(s.data))).attr("cy", (s) => y(s.preco_kg)).attr("r", 4).attr("fill", "var(--flower)").attr("stroke", "var(--panel)").attr("stroke-width", 1.5);
    const l = data[data.length - 1];
    svg.append("circle").attr("cx", x(parseD(l.d))).attr("cy", y(l.comum)).attr("r", 5).attr("fill", "var(--leaf)").attr("stroke", "var(--panel)").attr("stroke-width", 2);
    const cross = svg.append("line").attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "var(--muted)").attr("opacity", 0);
    const hov = svg.append("circle").attr("r", 4).attr("fill", "var(--leaf)").attr("opacity", 0);
    const bis = d3.bisector((d) => parseD(d.d)).center;
    svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent").style("touch-action", "pan-y")
      .on("pointermove", (ev) => {
        const [px] = d3.pointer(ev); const d = data[bis(data, x.invert(px))]; if (!d) return;
        const cx = x(parseD(d.d)), cy = y(d.comum);
        cross.attr("x1", cx).attr("x2", cx).attr("opacity", 0.5); hov.attr("cx", cx).attr("cy", cy).attr("opacity", 1);
        const a = document.createElement("div"); a.textContent = fmtD(d.d, { weekday: "short", day: "2-digit", month: "short", year: "numeric" }); a.style.opacity = ".75";
        const b = document.createElement("div"); b.textContent = "Comum " + brl(d.comum);
        const c = document.createElement("div"); c.textContent = "Mín " + brl(d.min) + " · Máx " + brl(d.max);
        tip.replaceChildren(a, b, c);
        const scale = box.clientWidth / W; const half = 90;
        tip.style.left = Math.min(Math.max(cx * scale, half), box.clientWidth - half) + "px";
        tip.style.top = cy * scale - 10 + "px"; tip.hidden = false;
      })
      .on("pointerleave", () => { tip.hidden = true; cross.attr("opacity", 0); hov.attr("opacity", 0); });
  }

  function drawBars() {
    const box = $("bars"); d3.select(box).select("svg").remove();
    const empty = box.querySelector(".empty");
    if ((!S.vendas.length && !S.despesas.length) || box.clientWidth === 0) { empty.hidden = !!(S.vendas.length || S.despesas.length); return; }
    empty.hidden = true;
    const t = parseD(today()), months = [];
    for (let i = 5; i >= 0; i--) months.push(new Date(t.getFullYear(), t.getMonth() - i, 1).toLocaleDateString("sv-SE").slice(0, 7));
    const rows = months.map((k) => ({ k, v: sum(S.vendas.filter((x) => ym(x.data) === k), (x) => x.total), d: sum(S.despesas.filter((x) => ym(x.data) === k), (x) => x.valor) }));
    const W = Math.max(260, box.clientWidth), H = 210, m = { t: 12, r: 8, b: 26, l: 68 };
    const x = d3.scaleBand().domain(months).range([m.l, W - m.r]).padding(0.28);
    const xi = d3.scaleBand().domain(["v", "d"]).range([0, x.bandwidth()]).padding(0.12);
    const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => Math.max(r.v, r.d)) || 1]).nice().range([H - m.b, m.t]);
    const svg = d3.select(box).insert("svg", ":first-child").attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%").attr("role", "img").attr("aria-label", "Vendas e despesas por mês");
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat("")).call((g) => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickFormat((k) => parseD(k + "-01").toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => (v >= 1000 ? "R$ " + NUM.format(v / 1000) + " mil" : "R$ " + v))).call((g) => g.select(".domain").remove());
    const g = svg.append("g").selectAll("g").data(rows).join("g").attr("transform", (r) => `translate(${x(r.k)},0)`);
    g.append("rect").attr("x", xi("v")).attr("width", xi.bandwidth()).attr("y", (r) => y(r.v)).attr("height", (r) => y(0) - y(r.v)).attr("rx", 3).attr("fill", "var(--flower)").append("title").text((r) => "Vendas " + brl(r.v));
    g.append("rect").attr("x", xi("d")).attr("width", xi.bandwidth()).attr("y", (r) => y(r.d)).attr("height", (r) => y(0) - y(r.d)).attr("rx", 3).attr("fill", "var(--eye)").append("title").text((r) => "Despesas " + brl(r.d));
  }

  function renderMoves() {
    const items = [
      ...S.colheitas.map((x) => ({ tipo: "colheita", ...x })),
      ...S.vendas.map((x) => ({ tipo: "venda", ...x })),
      ...S.despesas.map((x) => ({ tipo: "despesa", ...x })),
    ].filter((x) => S.filter === "todas" || x.tipo === S.filter)
      .sort((a, b) => b.data.localeCompare(a.data) || String(b.criado_em || "").localeCompare(String(a.criado_em || ""))).slice(0, 60);
    const list = $("mv-list"); list.replaceChildren();
    $("mv-empty").hidden = items.length > 0;
    const label = { colheita: "Entrada", venda: "Venda", despesa: "Despesa" };
    for (const it of items) {
      const li = document.createElement("li");
      const d = document.createElement("span"); d.className = "d"; d.textContent = fmtD(it.data, { day: "2-digit", month: "2-digit" });
      const det = document.createElement("div"); det.className = "det";
      const tag = document.createElement("span"); tag.className = "tag " + it.tipo; tag.textContent = label[it.tipo]; det.append(tag);
      if (it.tipo === "venda" && !it.pago) { const p = document.createElement("span"); p.className = "tag pend"; p.textContent = "a receber"; det.append(p); }
      let txt = "", val = "";
      if (it.tipo === "colheita") txt = kg(it.kg) + (it.caixas ? ` (${NUM.format(it.caixas)} cx)` : "") + (it.obs ? " · " + it.obs : "");
      if (it.tipo === "venda") { txt = kg(it.kg) + " a " + brl(it.preco_kg) + "/kg" + (it.cliente ? " · " + it.cliente : ""); val = brl(it.total); }
      if (it.tipo === "despesa") { txt = (it.categoria || "") + (it.descricao ? " · " + it.descricao : ""); val = "− " + brl(it.valor); }
      det.append(document.createTextNode(txt));
      const v = document.createElement("span"); v.className = "val"; v.textContent = val;
      const acts = document.createElement("div"); acts.className = "acts";
      if (it.tipo === "venda" && !it.pago) { const b = document.createElement("button"); b.className = "lnk"; b.type = "button"; b.textContent = "Marcar recebido"; b.onclick = () => markPaid(it.id); acts.append(b); }
      const del = document.createElement("button"); del.className = "lnk danger"; del.type = "button"; del.textContent = "Excluir";
      del.onclick = () => {
        if (del.dataset.arm) return remove(it.tipo, it.id);
        del.dataset.arm = "1"; del.textContent = "Toque de novo para excluir";
        setTimeout(() => { if (del.isConnected) { delete del.dataset.arm; del.textContent = "Excluir"; } }, 4000);
      };
      acts.append(del);
      li.append(d, det, v, acts); list.append(li);
    }
  }

  function renderAll() { renderQuote(); renderKpis(); renderPriceCfg(); drawChart(); drawBars(); renderMoves(); }

  /* ---------- navegação ---------- */
  function go(view) {
    S.view = view;
    document.querySelectorAll("[data-view]").forEach((s) => (s.hidden = s.dataset.view !== view));
    document.querySelectorAll(".tabs button").forEach((b) => (b.dataset.go === view ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
    window.scrollTo(0, 0);
    if (view === "precos") drawChart();
    if (view === "financas") drawBars();
  }
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => go(b.dataset.go)));

  document.querySelectorAll("#range button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.r === S.range));
    b.onclick = () => { S.range = b.dataset.r; try { localStorage.setItem("quiabo-range", S.range); } catch (e) {} document.querySelectorAll("#range button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); drawChart(); };
  });
  document.querySelectorAll("#mv-filter button").forEach((b) => (b.onclick = () => { S.filter = b.dataset.f; document.querySelectorAll("#mv-filter button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); renderMoves(); }));
  document.querySelectorAll("#lanc-tipo button").forEach((b) => (b.onclick = () => {
    document.querySelectorAll("#lanc-tipo button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("f-col").hidden = b.dataset.t !== "col"; $("f-ven").hidden = b.dataset.t !== "ven"; $("f-des").hidden = b.dataset.t !== "des";
  }));

  /* ---------- gravações ---------- */
  function errMsg(e) {
    const m = String((e && (e.message || e.error_description)) || "");
    if (/row-level security|permission/i.test(m)) return "Este usuário não tem permissão para gravar.";
    if (/JWT|session/i.test(m)) return "Sua sessão expirou. Saia e entre de novo.";
    if (/fetch|network/i.test(m)) return "Sem internet. Tente de novo quando tiver sinal.";
    return "Não foi possível salvar. Tente de novo.";
  }
  async function saveCfg(patch, msg) {
    const prev = S.cfg; S.cfg = { ...S.cfg, ...patch }; renderAll();
    const { error } = await S.sb.from("config").update({ ...patch, atualizado_em: new Date().toISOString(), atualizado_por: S.user?.email || null }).eq("id", 1);
    if (error) { S.cfg = prev; renderAll(); toast(errMsg(error)); } else if (msg) toast(msg);
  }
  document.querySelectorAll("#p-src button").forEach((b) => (b.onclick = () => saveCfg({ fonte: b.dataset.src }, b.dataset.src === "ceasa" ? "Usando o preço da CEASA" : "Usando o seu preço de venda")));
  $("p-ref").onchange = (e) => saveCfg({ ref: e.target.value }, "Referência da CEASA: " + REF[e.target.value]);
  $("p-own-save").onclick = () => {
    const v = num($("p-own").value);
    if (!(v > 0)) { $("p-hint").textContent = "Digite um preço maior que zero."; $("p-hint").className = "hint err"; return; }
    saveCfg({ preco_proprio: Math.round(v * 100) / 100 }, "Seu preço foi salvo");
  };
  $("p-cx").onchange = (e) => { const v = num(e.target.value); if (v > 0) saveCfg({ kg_por_caixa: v }, "Peso da caixa: " + NUM.format(v) + " kg"); };

  ["c-data", "v-data", "d-data"].forEach((id) => ($(id).value = today()));
  $("c-un").onchange = () => { $("c-q-lbl").textContent = $("c-un").value === "cx" ? "Quantidade (caixas)" : "Quantidade (kg)"; updColHint(); };
  $("c-q").oninput = updColHint;
  function updColHint() {
    const q = num($("c-q").value), cx = $("c-un").value === "cx", k = Number(S.cfg.kg_por_caixa) || 14;
    $("c-hint").textContent = cx ? (q > 0 ? `${NUM.format(q)} cx × ${NUM.format(k)} kg = ${kg(q * k)}` : `Cada caixa conta ${NUM.format(k)} kg.`) : "Fica registrado em kg; caixas são convertidas pelo peso da caixa.";
    $("c-hint").className = "hint";
  }
  function updVendaTotal() { const t = num($("v-kg").value) * num($("v-preco").value); $("v-total").value = isFinite(t) ? brl(t) : brl(0); }
  $("v-kg").oninput = updVendaTotal;
  $("v-preco").oninput = () => { $("v-preco").dataset.touched = "1"; updVendaTotal(); };

  async function insert(table, row, form, hintId, okMsg) {
    const btn = form.querySelector("button[type=submit]"), hint = $(hintId);
    btn.disabled = true;
    try {
      const { error } = await S.sb.from(table).insert(row);
      if (error) { hint.textContent = errMsg(error); hint.className = "hint err"; return false; }
      toast(okMsg); await reload(table); return true;
    } catch (e) { hint.textContent = errMsg(e); hint.className = "hint err"; return false; }
    finally { btn.disabled = false; }
  }
  $("f-col").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = num($("c-q").value), cx = $("c-un").value === "cx", k = Number(S.cfg.kg_por_caixa) || 14;
    if (!(q > 0)) { $("c-hint").textContent = "Informe uma quantidade maior que zero."; $("c-hint").className = "hint err"; return; }
    const kgv = Math.round((cx ? q * k : q) * 10) / 10;
    if (await insert("colheitas", { data: $("c-data").value, kg: kgv, caixas: cx ? q : null, obs: $("c-obs").value.trim() || null }, e.target, "c-hint", "Entrada de " + kg(kgv) + " lançada")) {
      $("c-q").value = ""; $("c-obs").value = ""; updColHint();
    }
  });
  $("f-ven").addEventListener("submit", async (e) => {
    e.preventDefault();
    const k = num($("v-kg").value), p = num($("v-preco").value);
    if (!(k > 0) || !(p > 0)) { $("v-hint").textContent = "Informe quantidade e preço maiores que zero."; $("v-hint").className = "hint err"; return; }
    const pago = $("v-pago").checked;
    if (await insert("vendas", { data: $("v-data").value, kg: k, preco_kg: Math.round(p * 100) / 100, cliente: $("v-cli").value.trim() || null, pago, pago_em: pago ? new Date().toISOString() : null }, e.target, "v-hint", "Venda de " + brl(k * p) + " lançada")) {
      $("v-kg").value = ""; $("v-cli").value = ""; delete $("v-preco").dataset.touched;
      $("v-hint").textContent = "O preço vem preenchido com o preço em uso."; $("v-hint").className = "hint"; renderPriceCfg();
    }
  });
  $("f-des").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = num($("d-valor").value);
    if (!(v > 0)) { $("d-hint").textContent = "Informe um valor maior que zero."; $("d-hint").className = "hint err"; return; }
    if (await insert("despesas", { data: $("d-data").value, valor: Math.round(v * 100) / 100, categoria: $("d-cat").value, descricao: $("d-desc").value.trim() || null }, e.target, "d-hint", "Despesa de " + brl(v) + " lançada")) {
      $("d-valor").value = ""; $("d-desc").value = ""; $("d-hint").textContent = "";
    }
  });
  async function markPaid(id) {
    const { error } = await S.sb.from("vendas").update({ pago: true, pago_em: new Date().toISOString() }).eq("id", id);
    if (error) toast(errMsg(error)); else { toast("Venda marcada como recebida"); reload("vendas"); }
  }
  async function remove(tipo, id) {
    const table = { colheita: "colheitas", venda: "vendas", despesa: "despesas" }[tipo];
    const { error } = await S.sb.from(table).delete().eq("id", id);
    if (error) toast(errMsg(error)); else { toast("Lançamento excluído"); reload(table); }
  }

  /* ---------- leitura ---------- */
  async function fetchAll(table, cols, order) {
    const out = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await S.sb.from(table).select(cols).order(order, { ascending: table === "precos" }).range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }
  const n = (v) => (v == null ? null : Number(v));
  async function reload(table) {
    if (table === "precos") {
      const rows = await fetchAll("precos", "data,min,comum,max,sit", "data");
      S.series = rows.filter((r) => r.comum != null).map((r) => ({ d: r.data, min: n(r.min ?? r.comum), comum: n(r.comum), max: n(r.max ?? r.comum), sit: r.sit }));
    } else if (table === "config") {
      const { data, error } = await S.sb.from("config").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      S.cfgLoaded = !!data; if (data) S.cfg = { ...S.cfg, ...data };
    } else if (table === "colheitas") {
      S.colheitas = (await fetchAll("colheitas", "id,data,kg,caixas,obs,criado_em", "data")).map((r) => ({ ...r, kg: n(r.kg), caixas: n(r.caixas) }));
    } else if (table === "vendas") {
      S.vendas = (await fetchAll("vendas", "id,data,kg,preco_kg,total,cliente,pago,criado_em", "data")).map((r) => ({ ...r, kg: n(r.kg), preco_kg: n(r.preco_kg), total: n(r.total) }));
    } else if (table === "despesas") {
      S.despesas = (await fetchAll("despesas", "id,data,valor,categoria,descricao,criado_em", "data")).map((r) => ({ ...r, valor: n(r.valor) }));
    }
    renderAll(); updateSync();
  }
  function updateSync() {
    const l = latest();
    if (!l) return setSync("warn", "Sem cotações");
    const age = (parseD(today()) - parseD(l.d)) / 864e5;
    setSync(age > 4 ? "warn" : "ok", "Cotação " + fmtD(l.d, { day: "2-digit", month: "2-digit" }));
  }
  async function loadEverything() {
    setSync("", "Carregando…");
    try {
      await reload("config");
      if (!S.cfgLoaded) {
        $("banner").textContent = "Este usuário entrou, mas não está liberado para ver os dados. Confira o e-mail cadastrado na tabela de sócios do Supabase.";
        $("banner").hidden = false; setSync("bad", "Sem acesso"); return;
      }
      $("banner").hidden = true;
      await Promise.all(["precos", "colheitas", "vendas", "despesas"].map(reload));
    } catch (e) { setSync("bad", "Falha ao carregar"); $("banner").textContent = errMsg(e).replace("salvar", "carregar os dados"); $("banner").hidden = false; }
  }
  let channel = null;
  function subscribe() {
    if (channel) return;
    const pending = {};
    channel = S.sb.channel("quiabo")
      .on("postgres_changes", { event: "*", schema: "public" }, (p) => {
        const t = p.table; clearTimeout(pending[t]);
        pending[t] = setTimeout(() => reload(t).catch(() => {}), 400);
      })
      .subscribe();
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.user) loadEverything(); });

  /* ---------- login ---------- */
  function showLogin(msg) {
    $("tela-app").hidden = true; $("tela-login").hidden = false;
    if (!$("l-user").value) $("l-user").value = CFG.USUARIO_PADRAO || "";
    $("l-hint").textContent = msg || ""; $("l-hint").className = "hint" + (msg ? " err" : "");
    ($("l-user").value ? $("l-pass") : $("l-user")).focus();
  }
  function showApp() {
    $("tela-login").hidden = true; $("tela-app").hidden = false;
    go(["inicio", "precos", "lancar", "financas"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "inicio");
    loadEverything(); subscribe();
  }
  $("f-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = $("l-user").value.trim().toLowerCase(), pw = $("l-pass").value;
    if (!u || !pw) return;
    const email = u.includes("@") ? u : u + "@" + (CFG.DOMINIO_LOGIN || "painel-quiabo.app");
    $("l-btn").disabled = true; $("l-hint").textContent = "Entrando…"; $("l-hint").className = "hint";
    try {
      const { error } = await S.sb.auth.signInWithPassword({ email, password: pw });
      if (error) showLogin(/invalid/i.test(error.message) ? "Usuário ou senha incorretos." : errMsg(error).replace("salvar", "entrar"));
      else $("l-pass").value = "";
    } catch (err) { showLogin("Sem internet. Tente de novo quando tiver sinal."); }
    finally { $("l-btn").disabled = false; }
  });
  $("btn-sair").onclick = async () => { await S.sb.auth.signOut(); };

  /* ---------- instalação (PWA) ---------- */
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; $("btn-install").hidden = false; });
  $("btn-install").onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $("btn-install").hidden = true; };
  window.addEventListener("appinstalled", () => { $("btn-install").hidden = true; toast("App instalado"); });
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (ios && !standalone) { try { if (!localStorage.getItem("quiabo-ios-hint")) { $("ios-hint").hidden = false; localStorage.setItem("quiabo-ios-hint", "1"); } } catch (e) { $("ios-hint").hidden = false; } }
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { drawChart(); drawBars(); }, 150); });

  /* ---------- início ---------- */
  if (!window.supabase || !CFG.SUPABASE_URL || CFG.SUPABASE_URL.startsWith("COLE")) {
    $("tela-login").hidden = false;
    $("l-hint").textContent = "O app ainda não foi ligado ao Supabase. Preencha o arquivo config.js.";
    $("l-hint").className = "hint err"; $("l-btn").disabled = true;
    return;
  }
  S.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  S.sb.auth.onAuthStateChange((event, session) => {
    const had = !!S.user; S.user = session ? session.user : null;
    if (S.user && !had) showApp();
    if (!S.user) { if (channel) { S.sb.removeChannel(channel); channel = null; } showLogin(); }
  });
})();
