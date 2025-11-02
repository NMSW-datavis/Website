/* =================== CONFIG + HELPERS =================== */
const DATA_FILE_1 = "datas/acled_conflict_index_fullyear2024_allcolumns-2.csv";
const DATA_FILE_2 = "datas/number_of_reported_civilian_fatalities_by_country_year_as_of_17Oct2025.csv";
const DATA_FILE_3 = "datas/cumulative_deaths_in_armed_conflicts_by_country_region_and_type.csv";

// robust parsers
const num = v => {
    if (v == null) return 0;
    const n = +v.toString().trim().replace(/,/g, "");
    return Number.isFinite(n) ? n : 0;
};
const str = v => (v == null ? "" : v.toString().trim());

/* Colors for ACLED metrics (consistent across charts) */
const metricColors = d3.scaleOrdinal()
    .domain(["Deadliness", "Diffusion", "Danger", "Fragmentation"])
    .range(["#2a76b9", "#f08e39", "#7b6ce0", "#4caf50"]);

const fmtInt = d3.format(","), fmtPct = d3.format(".0%"), fmt12 = d3.format(".2f");

/* ---------- Tooltip factory (scoped to nearest card) ---------- */
function makeTooltip(containerSel) {
    const card = containerSel.node().closest(".chart-card") || containerSel.node();
    const root = d3.select(card).style("position", "relative");
    let tip = root.select(".viz-tooltip");
    if (tip.empty()) tip = root.append("div").attr("class", "viz-tooltip");
    return tip;
}

/* ---------- Legend helpers ---------- */
// Discrete legend (swatches)
function addDiscreteLegend(svg, items, color, x, y, gap = 18) {
    const g = svg.append("g").attr("transform", `translate(${x},${y})`).attr("class", "legend");
    const row = g.selectAll("g.l").data(items).join("g")
        .attr("class", "l")
        .attr("transform", (d, i) => `translate(0,${i * gap})`);
    row.append("rect").attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", d => color(d));
    row.append("text").attr("x", 16).attr("y", 10).text(d => d);
    return g;
}

// Continuous legend (gradient for scaleSequential)
function addContinuousLegend(svg, colorScale, domain, x, y, width = 220, height = 10, ticks = 4, title = null) {
    const defs = svg.append("defs");
    const gradId = `grad-${Math.random().toString(36).slice(2)}`;
    const grad = defs.append("linearGradient").attr("id", gradId).attr("x1", "0%").attr("x2", "100%");
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        grad.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", colorScale(domain[0] + t * (domain[1] - domain[0])));
    }
    if (title) svg.append("text").attr("x", x).attr("y", y - 6).style("font-weight", 600).text(title);
    svg.append("rect").attr("x", x).attr("y", y).attr("width", width).attr("height", height).attr("fill", `url(#${gradId})`);
    const scale = d3.scaleLinear().domain(domain).range([x, x + width]);
    const axis = d3.axisBottom(scale).ticks(ticks).tickFormat(d => fmtInt(Math.round(d)));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${y + height})`).call(axis);
}

/* =================== LOAD ALL =================== */
let A1 = [], A2 = [], A3 = [];
Promise.all([
    d3.csv(DATA_FILE_1, d => ({
        Country: str(d.Country), IndexLevel: str(d["Index Level"]), TotalScore: num(d["Total Score"]),
        Deadliness: num(d["Deadliness Value Scaled"]), Diffusion: num(d["Diffusion Value Scaled"]),
        Danger: num(d["Danger Value Scaled"]), Fragmentation: num(d["Fragmentation Value Scaled"])
    })),
    d3.csv(DATA_FILE_2, d => ({ COUNTRY: str(d.COUNTRY || d.Country), YEAR: num(d.YEAR || d.Year), FATALITIES: num(d.FATALITIES || d.Fatalities) })),
    d3.csv(DATA_FILE_3, d => ({
        Entity: str(d.Entity), Code: str(d.Code),
        deaths_intrastate: num(d["Cumulative deaths in intrastate conflicts"]),
        deaths_onesided: num(d["Cumulative deaths from one-sided violence"]),
        deaths_nonstate: num(d["Cumulative deaths in non-state conflicts"]),
        deaths_interstate: num(d["Cumulative deaths in interstate conflicts"])
    }))
]).then(([acled, annual, cum]) => {
    A1 = acled; A2 = annual; A3 = cum;
    setupUI();
    observeLazy();
}).catch(e => console.error("Data load error:", e));

/* =================== UI (tabs/theme/download) =================== */
function setupUI() {
    // Tabs
    document.querySelectorAll(".tabs button").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(btn.dataset.tab).classList.add("active");
        });
    });
    // Theme
    document.getElementById("theme").addEventListener("click", () => {
        document.documentElement.classList.toggle("dark");
    });
    // PNG download
    document.querySelectorAll(".dl-png").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-target");
            const svg = document.querySelector(`#${id} svg`);
            if (!svg) return alert("Chart not rendered yet.");
            svgToPng(svg, `conflictviz-${id}.png`);
        });
    });
}

// SVG → PNG
function svgToPng(svgNode, filename = "chart.png") {
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgNode);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = function () {
        const r = svgNode.getBoundingClientRect();
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1200, Math.round(r.width));
        canvas.height = Math.max(700, Math.round(r.height));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(b); a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        }, "image/png", 1);
    };
    img.src = url;
}

/* =================== LAZY RENDER =================== */
function observeLazy() {
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                const el = e.target;
                renderById(el.id);
                io.unobserve(el);
            }
        });
    }, { rootMargin: "0px 0px -10% 0px" });
    document.querySelectorAll(".chart.lazy").forEach(el => io.observe(el));
    document.querySelectorAll(".sm-grid.lazy").forEach(el => io.observe(el));
}

function renderById(id) {
    if (!A1.length || !A2.length || !A3.length) return;
    switch (id) {
        case "chart-1-bar": drawChart1(); break;
        case "chart-2-grouped-bar": drawChart2(); break;
        case "chart-3-heatmap": drawChart3(); break;
        case "chart-4-stacked-100": drawChart4(); break;
        case "chart-5-waffle": drawChart5(); break;
        case "chart-6-circle-packing": drawCirclePacking(); break;
        case "chart-7-dumbbell": drawDumbbell(); break;
        case "chart-8-small-multiples": drawSmallMultiples(); break;
    }
}

/* =================== CHART 1 – Bar (Top10 Extreme) =================== */
function drawChart1() {
    const data = A1.filter(d => d.IndexLevel.toLowerCase() === "extreme")
        .sort((a, b) => b.TotalScore - a.TotalScore).slice(0, 10);

    const el = d3.select("#chart-1-bar"); const tip = makeTooltip(el);
    const m = { t: 20, r: 20, b: 110, l: 60 }, W = 700, H = 420, w = W - m.l - m.r, h = H - m.t - m.b;

    const svg = el.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

    const x = d3.scaleBand().domain(data.map(d => d.Country)).range([0, w]).padding(0.2);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.TotalScore) || 1]).nice().range([h, 0]);

    g.append("g").attr("transform", `translate(0,${h})`).attr("class", "axis").call(d3.axisBottom(x))
        .selectAll("text").attr("transform", "rotate(-45)").style("text-anchor", "end");
    g.append("g").attr("class", "axis").call(d3.axisLeft(y));

    const bars = g.selectAll("rect").data(data).join("rect")
        .attr("x", d => x(d.Country)).attr("y", d => y(d.TotalScore))
        .attr("width", x.bandwidth()).attr("height", d => h - y(d.TotalScore))
        .attr("fill", "#2a5599").attr("opacity", 0.9);

    g.selectAll(".val").data(data).join("text").attr("class", "val")
        .attr("x", d => x(d.Country) + x.bandwidth() / 2).attr("y", d => y(d.TotalScore) - 6)
        .attr("text-anchor", "middle").style("font-size", "11px").text(d => fmt12(d.TotalScore));

    bars.on("mouseenter", (ev, d) => {
        bars.transition().duration(120).style("opacity", b => b === d ? 1 : 0.35);
        tip.style("display", "block").style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px")
            .html(`<b>${d.Country}</b><br>Total Score: ${fmt12(d.TotalScore)}`);
    })
        .on("mousemove", ev => tip.style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px"))
        .on("mouseleave", () => { bars.transition().duration(120).style("opacity", 0.9); tip.style("display", "none"); });
}

/* =================== CHART 2 – Grouped Bar (Top3 Dimensions) =================== */
function drawChart2() {
    const top3 = A1.filter(d => d.IndexLevel.toLowerCase() === "extreme")
        .sort((a, b) => b.TotalScore - a.TotalScore).slice(0, 3).map(d => d.Country);

    const melted = [];
    A1.filter(d => top3.includes(d.Country)).forEach(row => {
        ["Deadliness", "Diffusion", "Danger", "Fragmentation"].forEach(m => {
            melted.push({ Country: row.Country, Metric: m, Value: row[m] });
        });
    });

    const el = d3.select("#chart-2-grouped-bar"); const tip = makeTooltip(el);
    const m = { t: 46, r: 20, b: 60, l: 60 }, W = 720, H = 420, w = W - m.l - m.r, h = H - m.t - m.b;

    const svg = el.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

    const x0 = d3.scaleBand().domain(top3).range([0, w]).padding(0.2);
    const x1 = d3.scaleBand().domain(metricColors.domain()).range([0, x0.bandwidth()]).padding(0.05);
    const y = d3.scaleLinear().domain([0, 1]).range([h, 0]);

    g.append("g").attr("transform", `translate(0,${h})`).attr("class", "axis").call(d3.axisBottom(x0));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y));

    const rects = g.selectAll("rect").data(melted).join("rect")
        .attr("x", d => x0(d.Country) + x1(d.Metric)).attr("y", d => y(d.Value))
        .attr("width", x1.bandwidth()).attr("height", d => h - y(d.Value))
        .attr("fill", d => metricColors(d.Metric)).attr("opacity", 0.9);

    // legend (discrete) — top-left of chart area
    addDiscreteLegend(svg, metricColors.domain(), metricColors, m.l, 18);

    rects.on("mouseenter", (ev, d) => {
        rects.transition().duration(120).style("opacity", r => (r.Country === d.Country && r.Metric === d.Metric) ? 1 : 0.35);
        tip.style("display", "block").style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px")
            .html(`<b>${d.Country}</b><br>${d.Metric}: ${fmt12(d.Value)}`);
    })
        .on("mousemove", ev => tip.style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px"))
        .on("mouseleave", () => { rects.transition().duration(120).style("opacity", 0.9); tip.style("display", "none"); });
}

/* =================== CHART 3 – Heatmap Country×Year (with gradient legend) =================== */
function drawChart3() {
    const el = d3.select("#chart-3-heatmap"); const tip = makeTooltip(el);
    const yearMax = d3.max(A2, d => d.YEAR) || 2025;
    const cand = d3.rollups(A2, v => d3.sum(v.filter(x => x.YEAR >= yearMax - 4), d => d.FATALITIES), d => d.COUNTRY)
        .sort((a, b) => b[1] - a[1]).slice(0, 15).map(d => d[0]);
    const data = A2.filter(d => cand.includes(d.COUNTRY));
    const years = Array.from(new Set(data.map(d => d.YEAR))).sort((a, b) => a - b);
    const countries = cand;

    const m = { t: 64, r: 20, b: 70, l: 150 }, W = 1000, H = 560, w = W - m.l - m.r, h = H - m.t - m.b;
    const svg = el.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

    const x = d3.scaleBand().domain(years).range([0, w]).padding(0.05);
    const y = d3.scaleBand().domain(countries).range([0, h]).padding(0.05);
    const maxV = d3.max(data, d => d.FATALITIES) || 1;
    const col = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, maxV]);

    g.append("g").attr("transform", `translate(0,${h})`).attr("class", "axis")
        .call(d3.axisBottom(x).tickValues(years.filter((d, i) => i % 2 === 0)));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y));

    const cells = g.selectAll("rect").data(data).join("rect")
        .attr("x", d => x(d.YEAR)).attr("y", d => y(d.COUNTRY))
        .attr("width", x.bandwidth()).attr("height", y.bandwidth())
        .attr("fill", d => col(d.FATALITIES)).attr("stroke", "#fff").attr("stroke-width", 0.5);

    // gradient legend repositioned - top center with better spacing
    addContinuousLegend(svg, col, [0, maxV], W / 2 - 110, 18, 220, 12, 4, "Civilian Fatalities");

    cells.on("mouseenter", (ev, d) => {
        tip.style("display", "block").style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px")
            .html(`<b>${d.COUNTRY}</b> — ${d.YEAR}<br>Fatalities: ${fmtInt(d.FATALITIES)}`);
    })
        .on("mousemove", ev => tip.style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px"))
        .on("mouseleave", () => tip.style("display", "none"));
}

/* =================== CHART 4 – 100% Stacked by Region (with legend) =================== */
function drawChart4() {
    const regions = A3.filter(d => d.Code === ""); // region rows
    const keys = ["deaths_intrastate", "deaths_onesided", "deaths_nonstate", "deaths_interstate"];
    const labels = ["Intrastate", "One-sided", "Non-state", "Interstate"];
    const color = d3.scaleOrdinal().domain(labels).range(["#20c997", "#ff8787", "#748ffc", "#f783ac"]);

    const el = d3.select("#chart-4-stacked-100"); const tip = makeTooltip(el);
    const m = { t: 54, r: 20, b: 80, l: 70 }, W = 720, H = 420, w = W - m.l - m.r, h = H - m.t - m.b;

    const svg = el.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

    const x = d3.scaleBand().domain(regions.map(d => d.Entity)).range([0, w]).padding(0.28);
    const y = d3.scaleLinear().domain([0, 1]).range([h, 0]);

    const stack = d3.stack().keys(keys).offset(d3.stackOffsetExpand);
    const series = stack(regions);

    g.append("g").attr("transform", `translate(0,${h})`).attr("class", "axis")
        .call(d3.axisBottom(x))
        .selectAll("text").attr("transform", "rotate(-35)").style("text-anchor", "end");
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickFormat(fmtPct));

    // legend repositioned - top center horizontal layout
    const legG = svg.append("g").attr("transform", `translate(${W / 2 - 160},18)`).attr("class", "legend");
    labels.forEach((label, i) => {
        const lx = i * 80;
        legG.append("rect").attr("x", lx).attr("y", 0).attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", color(label));
        legG.append("text").attr("x", lx + 16).attr("y", 10).style("font-size", "11px").text(label);
    });

    const groups = g.selectAll(".s").data(series).join("g").attr("fill", (d, i) => color(labels[i]));
    const rects = groups.selectAll("rect").data(d => d).join("rect")
        .attr("x", d => x(d.data.Entity)).attr("width", x.bandwidth())
        .attr("y", d => y(d[1])).attr("height", d => y(d[0]) - y(d[1]))
        .attr("opacity", 0.9).attr("stroke", "#fff").attr("stroke-width", 1);

    rects.on("mouseenter", (ev, d) => {
        const key = d3.select(ev.currentTarget.parentNode).datum().key;
        groups.selectAll("rect").transition().duration(120).style("opacity", r => (r === d ? 1 : 0.3));
        const total = keys.reduce((s, k) => s + d.data[k], 0);
        const label = labels[keys.indexOf(key)];
        const value = d.data[key];
        tip.style("display", "block").style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px")
            .html(`<b>${d.data.Entity}</b><br>${label}: ${fmtInt(value)}<br>Share: ${(value / total * 100).toFixed(1)}%`);
    })
        .on("mousemove", ev => tip.style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px"))
        .on("mouseleave", () => { groups.selectAll("rect").transition().duration(120).style("opacity", 0.9); tip.style("display", "none"); });
}

/* =================== CHART 5 – Waffle 10×10 (with legend) =================== */
function drawChart5() {
    const world = A3.find(d => d.Entity === "World");
    if (!world) return;
    const types = [
        { key: "deaths_intrastate", label: "Intrastate" },
        { key: "deaths_onesided", label: "One-sided" },
        { key: "deaths_nonstate", label: "Non-state" },
        { key: "deaths_interstate", label: "Interstate" },
    ];
    const total = d3.sum(types, t => world[t.key]);
    const color = d3.scaleOrdinal().domain(types.map(t => t.label)).range(["#20c997", "#ff8787", "#748ffc", "#f783ac"]);

    // build 100 tiles
    let data = []; let cur = 0;
    types.forEach(t => {
        const n = Math.round(world[t.key] / total * 100);
        for (let i = 0; i < n && data.length < 100; i++) data.push({ type: t.label, idx: cur++ });
    });
    while (data.length < 100) data.push({ type: "Other", idx: data.length });

    const el = d3.select("#chart-5-waffle"); const tip = makeTooltip(el);
    const m = { t: 64, r: 20, b: 20, l: 20 }, W = 420, H = 380, w = W - m.l - m.r, h = H - m.t - m.b;
    const svg = el.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

    // legend repositioned - top center horizontal
    const legG = svg.append("g").attr("transform", `translate(${W / 2 - 140},18)`);
    types.forEach((t, i) => {
        const lx = i * 70;
        legG.append("rect").attr("x", lx).attr("y", 0).attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", color(t.label));
        legG.append("text").attr("x", lx + 16).attr("y", 10).style("font-size", "10px").text(t.label);
    });

    const cols = 10, size = Math.min((w) / cols, (h - 20) / cols), pad = 3;
    const tiles = g.selectAll("rect").data(data).join("rect")
        .attr("x", d => (d.idx % cols) * (size))
        .attr("y", d => Math.floor(d.idx / cols) * (size))
        .attr("width", size - pad).attr("height", size - pad)
        .attr("fill", d => color(d.type) || "#ccc").attr("opacity", 0.95)
        .attr("rx", 3).attr("stroke", "#fff").attr("stroke-width", 0.5);

    tiles.on("mouseenter", (ev, d) => {
        tiles.transition().duration(100).style("opacity", t => t === d ? 1 : 0.2);
        const perTile = total / 100;
        tip.style("display", "block").style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px")
            .html(`${d.type}<br>≈ ${fmtInt(Math.round(perTile))} deaths per tile`);
    })
        .on("mousemove", ev => tip.style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px"))
        .on("mouseleave", () => { tiles.transition().duration(100).style("opacity", 0.95); tip.style("display", "none"); });
}

/* =================== CHART 6 – Circle Packing (with threshold-based gradients) =================== */
function drawCirclePacking() {
    const items = A3.filter(d => d.Code !== "" && d.Entity !== "World")
        .map(d => ({ name: d.Entity, value: d.deaths_intrastate + d.deaths_onesided + d.deaths_nonstate + d.deaths_interstate }))
        .filter(d => d.value > 0);

    const el = d3.select("#chart-6-circle-packing"); const tip = makeTooltip(el);
    const W = 980, H = 560, legendW = 280;
    const svg = el.append("svg").attr("viewBox", `0 0 ${W} ${H}`);

    // Three-tier color scheme based on thresholds
    const thresholdHigh = 400000;
    const thresholdMed = 100000;

    const colorRed = d3.scaleSequential(d3.interpolateReds).domain([thresholdHigh, d3.max(items, d => d.value) || thresholdHigh]);
    const colorOrange = d3.scaleSequential(d3.interpolateOranges).domain([thresholdMed, thresholdHigh]);
    const colorBlue = d3.scaleSequential(d3.interpolateBlues).domain([1, thresholdMed]);

    const getColor = (val) => {
        if (val >= thresholdHigh) return colorRed(val);
        if (val >= thresholdMed) return colorOrange(val);
        return colorBlue(val);
    };

    // circle pack area (leave space for legend on the right)
    const pack = d3.pack().size([W - legendW, H]).padding(3);
    const root = d3.hierarchy({ children: items }).sum(d => d.value);
    const nodes = pack(root).leaves();

    const g = svg.append("g");
    const node = g.selectAll("g.node").data(nodes, d => d.data.name).join("g")
        .attr("class", "node").attr("transform", d => `translate(${d.x},${d.y})`);

    const circles = node.append("circle")
        .attr("r", d => d.r).attr("fill", d => getColor(d.data.value))
        .attr("stroke", "#fff").attr("stroke-width", 1.5).attr("opacity", 0.9);

    const labels = node.append("text")
        .attr("text-anchor", "middle").attr("dy", ".35em").style("pointer-events", "none")
        .style("fill", "#fff").style("font-weight", 700).style("text-shadow", "0 1px 3px rgba(0,0,0,0.8)")
        .style("font-size", d => Math.max(9, Math.min(13, d.r / 3.5)) + "px")
        .text(d => d.data.name)
        .each(function (d) {
            const fits = this.getComputedTextLength() < d.r * 1.7;
            d3.select(this).style("display", fits ? "block" : "none");
        });

    circles.on("mouseenter", function (ev, d) {
        d3.select(this.parentNode).raise();
        circles.transition().duration(140).style("opacity", c => c === d ? 1 : 0.2);
        labels.transition().duration(140).style("opacity", c => c === d ? 1 : 0.15);
        d3.select(this).transition().duration(140).attr("stroke", "#333").attr("stroke-width", 3);
        d3.select(this.parentNode).transition().duration(140).attr("transform", `translate(${d.x},${d.y}) scale(1.1)`);
        tip.style("display", "block").style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px")
            .html(`<b>${d.data.name}</b><br>Total deaths: ${fmtInt(d.data.value)}`);
    })
        .on("mousemove", ev => tip.style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px"))
        .on("mouseleave", function (ev, d) {
            circles.transition().duration(140).style("opacity", 0.9).attr("stroke", "#fff").attr("stroke-width", 1.5);
            labels.transition().duration(140).style("opacity", 1);
            d3.select(this.parentNode).transition().duration(140).attr("transform", `translate(${d.x},${d.y}) scale(1)`);
            tip.style("display", "none");
        });

    // Three-tier legend (right side)
    const legX = W - legendW + 10, legY = 30;
    const legG = svg.append("g").attr("transform", `translate(${legX},${legY})`);
    legG.append("text").attr("x", 0).attr("y", 0).style("font-weight", 700).style("font-size", "13px").text("Death Toll Categories");

    const legendData = [
        { label: `High (≥${fmtInt(thresholdHigh)})`, color: "#c92a2a", y: 25 },
        { label: `Medium (${fmtInt(thresholdMed)}-${fmtInt(thresholdHigh)})`, color: "#e67700", y: 50 },
        { label: `Low (<${fmtInt(thresholdMed)})`, color: "#1c7ed6", y: 75 }
    ];

    legendData.forEach(item => {
        legG.append("circle").attr("cx", 8).attr("cy", item.y).attr("r", 8).attr("fill", item.color).attr("opacity", 0.9);
        legG.append("text").attr("x", 24).attr("y", item.y + 4).style("font-size", "11px").text(item.label);
    });
}

/* =================== CHART 7 – Dumbbell =================== */
function drawDumbbell() {
    const rows = A1.filter(d => d.IndexLevel.toLowerCase() === "extreme")
        .sort((a, b) => (b.Danger - b.Deadliness) - (a.Danger - a.Deadliness))
        .slice(0, 10)
        .map(d => ({ Country: d.Country, Deadliness: d.Deadliness, Danger: d.Danger }));

    const el = d3.select("#chart-7-dumbbell"); const tip = makeTooltip(el);
    const m = { t: 30, r: 20, b: 40, l: 120 }, W = 760, H = 360, w = W - m.l - m.r, h = H - m.t - m.b;

    const svg = el.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

    const x = d3.scaleLinear().domain([0, 1]).range([0, w]);
    const y = d3.scaleBand().domain(rows.map(d => d.Country)).range([0, h]).padding(0.45);

    g.append("g").attr("transform", `translate(0,${h})`).attr("class", "axis").call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".1f")));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y));

    const bars = g.selectAll(".db").data(rows).join("g").attr("class", "db")
        .attr("transform", d => `translate(0,${y(d.Country) + y.bandwidth() / 2})`);

    bars.append("line")
        .attr("x1", d => x(d.Deadliness)).attr("x2", d => x(d.Danger))
        .attr("y1", 0).attr("y2", 0).attr("stroke", "#9aa7d7").attr("stroke-width", 3).attr("opacity", 0.85);

    bars.append("circle").attr("cx", d => x(d.Deadliness)).attr("cy", 0).attr("r", 5).attr("fill", metricColors("Deadliness"));
    bars.append("circle").attr("cx", d => x(d.Danger)).attr("cy", 0).attr("r", 5).attr("fill", metricColors("Danger"));

    bars.on("mouseenter", function (ev, d) {
        d3.select(this).raise();
        g.selectAll(".db").transition().duration(120).style("opacity", 0.25);
        d3.select(this).transition().duration(120).style("opacity", 1);
        d3.select(this).select("line").transition().duration(120).attr("stroke", "#6f7dd7").attr("stroke-width", 6);
        d3.select(this).selectAll("circle").transition().duration(120).attr("r", 7);
        const delta = Math.abs(d.Danger - d.Deadliness);
        tip.style("display", "block").style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px")
            .html(`<b>${d.Country}</b><br>Deadliness: ${fmt12(d.Deadliness)}<br>Danger: ${fmt12(d.Danger)}<br>Δ: ${fmt12(delta)}`);
    })
        .on("mousemove", ev => tip.style("left", (ev.offsetX + 14) + "px").style("top", (ev.offsetY - 10) + "px"))
        .on("mouseleave", function () {
            g.selectAll(".db").transition().duration(120).style("opacity", 1);
            d3.select(this).select("line").transition().duration(120).attr("stroke", "#9aa7d7").attr("stroke-width", 3);
            d3.select(this).selectAll("circle").transition().duration(120).attr("r", 5);
            tip.style("display", "none");
        });
}

/* =================== CHART 8 – Small Multiples Stacked (with legend) =================== */
function drawSmallMultiples() {
    const keys = ["deaths_intrastate", "deaths_onesided", "deaths_nonstate", "deaths_interstate"];
    const labels = ["Intrastate", "One-sided", "Non-state", "Interstate"];
    const color = d3.scaleOrdinal().domain(labels).range(["#20c997", "#ff8787", "#748ffc", "#f783ac"]);
    const regions = A3.filter(d => d.Code === "").map(d => ({ name: d.Entity, ...d }));

    const root = d3.select("#chart-8-small-multiples"); const tip = makeTooltip(root);

    // legend above cards - centered horizontal layout
    const svgLegend = root.append("svg").attr("viewBox", "0 0 400 40");
    const legG = svgLegend.append("g").attr("transform", "translate(20,18)");
    labels.forEach((label, i) => {
        const lx = i * 90;
        legG.append("rect").attr("x", lx).attr("y", 0).attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", color(label));
        legG.append("text").attr("x", lx + 16).attr("y", 10).style("font-size", "12px").text(label);
    });

    const cardW = 320, cardH = 220, m = { t: 28, r: 16, b: 35, l: 52 }, w = cardW - m.l - m.r, h = cardH - m.t - m.b;
    const stack = d3.stack().keys(keys);
    const yMax = d3.max(regions, r => keys.reduce((s, k) => s + r[k], 0)) || 1;
    const y = d3.scaleLinear().domain([0, yMax]).range([h, 0]);

    regions.forEach(group => {
        const svg = root.append("div").attr("class", "sm-card").append("svg")
            .attr("viewBox", `0 0 ${cardW} ${cardH}`);
        const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);

        const x = d3.scaleBand().domain([group.name]).range([0, w]).padding(0.25);
        g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(3).tickFormat(d3.format(".2s")));
        g.append("g").attr("transform", `translate(0,${h})`).attr("class", "axis").call(d3.axisBottom(x));
        svg.append("text").attr("x", m.l).attr("y", 20).text(group.name).style("font-weight", 700).style("font-size", "14px");

        const ser = stack([group]);
        const rects = g.append("g").attr("transform", `translate(${x(group.name)},0)`)
            .selectAll("rect").data(ser).join("rect")
            .attr("x", 0).attr("width", x.bandwidth())
            .attr("y", d => y(d[0][1])).attr("height", d => y(d[0][0]) - y(d[0][1]))
            .attr("fill", (d, i) => color(labels[i])).attr("opacity", 0.9)
            .attr("stroke", "#fff").attr("stroke-width", 1.2);

        rects.on("mouseenter", (ev, seg) => {
            rects.transition().duration(120).style("opacity", r => r.key === seg.key ? 1 : 0.3);
            const v = seg[0][1] - seg[0][0];
            const total = keys.reduce((s, k) => s + group[k], 0);
            const p = v / total * 100;
            const label = labels[keys.indexOf(seg.key)];
            tip.style("display", "block").style("left", (ev.offsetX + 16) + "px").style("top", (ev.offsetY - 10) + "px")
                .html(`<b>${group.name}</b><br>${label}: ${fmtInt(v)}<br>Share: ${p.toFixed(1)}%`);
        })
            .on("mousemove", ev => tip.style("left", (ev.offsetX + 16) + "px").style("top", (ev.offsetY - 10) + "px"))
            .on("mouseleave", () => { rects.transition().duration(120).style("opacity", 0.9); tip.style("display", "none"); });
    });
}