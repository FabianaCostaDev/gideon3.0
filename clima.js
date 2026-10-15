/* =========================================================
   CLIMA NO CABEÇALHO
   Desenha atrás do "Boa tarde, Fabiana!" o céu de agora:
   sol, nuvens, chuva, garoa, neblina, tempestade, estrelas...

   Dados: Open-Meteo (gratuito, sem chave).
   Localização: pede permissão ao navegador; se você negar,
   usa a cidade padrão abaixo.

   Para ver cada cena sem esperar o tempo mudar, abra o site
   com, por exemplo:  ?clima=chuva   ou   ?clima=limpo&periodo=noite
   Cenas: limpo, poucas-nuvens, nublado, neblina, garoa, chuva,
          tempestade, neve.  Períodos: dia, entardecer, noite.
   ========================================================= */

(() => {

/* ---------- Ajuste aqui se quiser ---------- */

const CIDADE_PADRAO = { nome: "São Paulo", lat: -23.55, lon: -46.63 };
const ATUALIZAR_A_CADA_MIN = 15;
const CHAVE_LOCAL = "personalOS_clima";


/* ---------- Estilos (injetados, não mexem no layout) ---------- */

const css = `
.top-header { position: relative; isolation: isolate; }
.top-header > :not(.clima-ceu) { position: relative; z-index: 1; }

.clima-ceu {
  position: absolute;
  inset: -32px -42px 0 -42px;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
  transition: opacity 1.4s ease;
  -webkit-mask-image: linear-gradient(180deg, #000 45%, transparent 100%);
          mask-image: linear-gradient(180deg, #000 45%, transparent 100%);
}
.clima-ceu.ativo { opacity: 1; }

.clima-fundo { position: absolute; inset: 0; transition: background 2s ease; }

.clima-astro {
  position: absolute;
  border-radius: 50%;
  transition: opacity 2s ease;
}
.clima-sol {
  width: 420px; height: 420px; right: 14%; top: -230px;
  background: radial-gradient(circle,
    rgba(255, 226, 160, .55) 0%,
    rgba(255, 190, 110, .22) 28%,
    rgba(255, 170, 90, .06) 50%,
    transparent 68%);
}
.clima-lua {
  width: 300px; height: 300px; right: 20%; top: -170px;
  background: radial-gradient(circle,
    rgba(220, 232, 255, .30) 0%,
    rgba(170, 195, 255, .10) 30%,
    transparent 62%);
}

.clima-nuvem {
  position: absolute;
  left: -40%;
  border-radius: 50%;
  filter: blur(14px);
  animation: clima-deriva linear infinite;
  will-change: transform;
}
@keyframes clima-deriva {
  from { transform: translateX(0); }
  to   { transform: translateX(180vw); }
}

.clima-nevoa {
  position: absolute;
  left: -20%;
  width: 140%;
  height: 46px;
  border-radius: 50%;
  background: linear-gradient(90deg, transparent, rgba(200, 212, 230, .16), transparent);
  filter: blur(10px);
  animation: clima-balanco ease-in-out infinite alternate;
}
@keyframes clima-balanco {
  from { transform: translateX(-6%); }
  to   { transform: translateX(6%); }
}

.clima-particulas { position: absolute; inset: 0; width: 100%; height: 100%; }

.clima-raio {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 60% 0%, rgba(210, 225, 255, .55), transparent 70%);
  opacity: 0;
}
.clima-raio.piscar { animation: clima-flash .9s ease-out; }
@keyframes clima-flash {
  0% { opacity: 0; } 6% { opacity: 1; } 14% { opacity: .15; }
  20% { opacity: .8; } 100% { opacity: 0; }
}

@media (max-width: 820px) {
  .clima-ceu { inset: -20px -15px 0 -15px; }
  .clima-sol { right: -10%; }
  .clima-lua { right: -5%; }
}

@media (prefers-reduced-motion: reduce) {
  .clima-nuvem, .clima-nevoa { animation: none !important; }
  .clima-raio.piscar { animation: none !important; }
}
`;


/* ---------- Céus por período e cobertura ---------- */

// Cores puxadas para o tema escuro: o texto branco continua legível.
const CEUS = {
  dia: {
    claro:   "linear-gradient(180deg, #1E5A9A 0%, #164577 40%, #0E2748 75%, rgba(7,11,20,0) 100%)",
    parcial: "linear-gradient(180deg, #2A5785 0%, #1D4269 40%, #10253F 75%, rgba(7,11,20,0) 100%)",
    fechado: "linear-gradient(180deg, #3B4A60 0%, #2C394D 40%, #18202F 75%, rgba(7,11,20,0) 100%)",
    escuro:  "linear-gradient(180deg, #2B3545 0%, #202938 40%, #131A26 75%, rgba(7,11,20,0) 100%)"
  },
  entardecer: {
    claro:   "linear-gradient(180deg, #3A2E5C 0%, #7A3E5A 30%, #A8564A 48%, #2A1E36 78%, rgba(7,11,20,0) 100%)",
    parcial: "linear-gradient(180deg, #33305A 0%, #663E5C 32%, #8A5050 50%, #241D33 78%, rgba(7,11,20,0) 100%)",
    fechado: "linear-gradient(180deg, #2F3245 0%, #4A3D4E 40%, #2A2433 75%, rgba(7,11,20,0) 100%)",
    escuro:  "linear-gradient(180deg, #252A38 0%, #322E3D 40%, #1C1B26 75%, rgba(7,11,20,0) 100%)"
  },
  noite: {
    claro:   "linear-gradient(180deg, #0C1838 0%, #0A1430 45%, #080F22 75%, rgba(7,11,20,0) 100%)",
    parcial: "linear-gradient(180deg, #111B36 0%, #0D162C 45%, #090F1F 75%, rgba(7,11,20,0) 100%)",
    fechado: "linear-gradient(180deg, #171E2E 0%, #121826 45%, #0B101B 75%, rgba(7,11,20,0) 100%)",
    escuro:  "linear-gradient(180deg, #141A27 0%, #0F1420 45%, #0A0E18 75%, rgba(7,11,20,0) 100%)"
  }
};

// O que cada cena desenha
const CENAS = {
  "limpo":         { ceu: "claro",   astro: 1,   nuvens: 0, tomNuvem: "clara",  particula: null,     estrelas: 140 },
  "poucas-nuvens": { ceu: "parcial", astro: .8,  nuvens: 3, tomNuvem: "clara",  particula: null,     estrelas: 80 },
  "nublado":       { ceu: "fechado", astro: .25, nuvens: 7, tomNuvem: "cinza",  particula: null,     estrelas: 0 },
  "neblina":       { ceu: "fechado", astro: .15, nuvens: 2, tomNuvem: "cinza",  particula: null,     estrelas: 0, nevoa: true },
  "garoa":         { ceu: "escuro",  astro: 0,   nuvens: 6, tomNuvem: "escura", particula: "garoa",  estrelas: 0 },
  "chuva":         { ceu: "escuro",  astro: 0,   nuvens: 7, tomNuvem: "escura", particula: "chuva",  estrelas: 0 },
  "tempestade":    { ceu: "escuro",  astro: 0,   nuvens: 8, tomNuvem: "escura", particula: "chuva",  estrelas: 0, raios: true },
  "neve":          { ceu: "fechado", astro: 0,   nuvens: 6, tomNuvem: "cinza",  particula: "neve",   estrelas: 0 }
};

const NOMES = {
  "limpo": "Céu limpo", "poucas-nuvens": "Poucas nuvens", "nublado": "Nublado",
  "neblina": "Neblina", "garoa": "Garoa", "chuva": "Chuva",
  "tempestade": "Tempestade", "neve": "Neve"
};

// Códigos WMO usados pelo Open-Meteo
function cenaPorCodigo(codigo) {
    if (codigo === 0) return "limpo";
    if (codigo === 1 || codigo === 2) return "poucas-nuvens";
    if (codigo === 3) return "nublado";
    if (codigo === 45 || codigo === 48) return "neblina";
    if (codigo >= 51 && codigo <= 57) return "garoa";
    if ((codigo >= 61 && codigo <= 67) || (codigo >= 80 && codigo <= 82)) return "chuva";
    if ((codigo >= 71 && codigo <= 77) || codigo === 85 || codigo === 86) return "neve";
    if (codigo >= 95) return "tempestade";
    return "poucas-nuvens";
}


/* ---------- Montagem da camada ---------- */

let camada, fundo, sol, lua, canvas, raio, grupoNuvens;
let cenaAtual = null;
let periodoAtual = null;
let animacao = null;
let timerRaio = null;
let particulas = [];

const reduzirMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function montarCamada() {
    const header = document.querySelector(".top-header");
    if (!header || header.querySelector(".clima-ceu")) return false;

    const estilo = document.createElement("style");
    estilo.textContent = css;
    document.head.appendChild(estilo);

    camada = document.createElement("div");
    camada.className = "clima-ceu";
    camada.setAttribute("aria-hidden", "true");
    camada.innerHTML = `
        <div class="clima-fundo"></div>
        <div class="clima-astro clima-sol"></div>
        <div class="clima-astro clima-lua"></div>
        <div class="clima-nuvens"></div>
        <canvas class="clima-particulas"></canvas>
        <div class="clima-raio"></div>`;
    header.prepend(camada);

    fundo = camada.querySelector(".clima-fundo");
    sol = camada.querySelector(".clima-sol");
    lua = camada.querySelector(".clima-lua");
    grupoNuvens = camada.querySelector(".clima-nuvens");
    canvas = camada.querySelector(".clima-particulas");
    raio = camada.querySelector(".clima-raio");

    if ("ResizeObserver" in window) {
        new ResizeObserver(ajustarCanvas).observe(camada);
    }
    ajustarCanvas();
    return true;
}

function ajustarCanvas() {
    if (!canvas) return;
    const escala = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = camada.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(width * escala));
    canvas.height = Math.max(1, Math.round(height * escala));
    canvas.getContext("2d").setTransform(escala, 0, 0, escala, 0, 0);
    if (cenaAtual) criarParticulas();
}


/* ---------- Nuvens e névoa ---------- */

const TONS_NUVEM = {
    clara:  [215, 228, 245, .16],
    cinza:  [170, 184, 205, .20],
    escura: [110, 124, 145, .30]
};

function desenharNuvens(cena) {
    grupoNuvens.innerHTML = "";
    const [r, g, b, a] = TONS_NUVEM[cena.tomNuvem];

    for (let i = 0; i < cena.nuvens; i++) {
        const nuvem = document.createElement("div");
        nuvem.className = "clima-nuvem";
        const largura = 320 + Math.random() * 380;
        const altura = 70 + Math.random() * 70;
        const alpha = a * (.6 + Math.random() * .5);
        nuvem.style.width = `${largura}px`;
        nuvem.style.height = `${altura}px`;
        nuvem.style.top = `${-20 + Math.random() * 110}px`;
        nuvem.style.background =
            `radial-gradient(ellipse at 50% 60%, rgba(${r},${g},${b},${alpha}) 0%, rgba(${r},${g},${b},${alpha * .45}) 45%, transparent 70%)`;
        const duracao = 90 + Math.random() * 110;
        nuvem.style.animationDuration = `${duracao}s`;
        nuvem.style.animationDelay = `${-Math.random() * duracao}s`;   // já começa espalhada
        grupoNuvens.appendChild(nuvem);
    }

    if (cena.nevoa) {
        [30, 75, 120].forEach((top, i) => {
            const faixa = document.createElement("div");
            faixa.className = "clima-nevoa";
            faixa.style.top = `${top}px`;
            faixa.style.animationDuration = `${14 + i * 5}s`;
            faixa.style.opacity = String(.9 - i * .2);
            grupoNuvens.appendChild(faixa);
        });
    }
}


/* ---------- Partículas: chuva, garoa, neve, estrelas ---------- */

function criarParticulas() {
    const { width, height } = camada.getBoundingClientRect();
    const cena = CENAS[cenaAtual];
    particulas = [];

    const quantidade = {
        chuva: Math.round(width / 9),
        garoa: Math.round(width / 16),
        neve: Math.round(width / 14)
    }[cena.particula] || 0;

    for (let i = 0; i < quantidade; i++) {
        particulas.push({
            tipo: cena.particula,
            x: Math.random() * width,
            y: Math.random() * height,
            v: cena.particula === "chuva" ? 9 + Math.random() * 6
             : cena.particula === "garoa" ? 4 + Math.random() * 2
             : .5 + Math.random() * .8,
            c: cena.particula === "chuva" ? 12 + Math.random() * 10
             : cena.particula === "garoa" ? 5 + Math.random() * 4
             : 1 + Math.random() * 1.8,
            a: .15 + Math.random() * .3,
            fase: Math.random() * Math.PI * 2
        });
    }

    if (periodoAtual === "noite" && cena.estrelas) {
        for (let i = 0; i < cena.estrelas * (width / 1200); i++) {
            particulas.push({
                tipo: "estrela",
                x: Math.random() * width,
                y: Math.random() * height * .75,
                r: Math.random() * 1.1 + .3,
                a: .3 + Math.random() * .6,
                fase: Math.random() * Math.PI * 2,
                ritmo: .6 + Math.random() * 1.6
            });
        }
    }
}

function quadro(tempo) {
    const ctx = canvas.getContext("2d");
    const { width, height } = camada.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);

    for (const p of particulas) {
        if (p.tipo === "estrela") {
            const brilho = p.a * (.6 + .4 * Math.sin(tempo / 1000 * p.ritmo + p.fase));
            ctx.fillStyle = `rgba(230, 238, 255, ${brilho})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            continue;
        }

        if (p.tipo === "neve") {
            p.y += p.v;
            p.x += Math.sin(tempo / 1400 + p.fase) * .4;
            ctx.fillStyle = `rgba(240, 246, 255, ${p.a + .2})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.c, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // chuva e garoa: traços levemente inclinados
            p.y += p.v;
            p.x -= p.v * .18;
            ctx.strokeStyle = `rgba(190, 210, 240, ${p.a})`;
            ctx.lineWidth = p.tipo === "chuva" ? 1.1 : .8;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.c * .18, p.y - p.c);
            ctx.stroke();
        }

        if (p.y - 30 > height) { p.y = -20; p.x = Math.random() * (width + 60); }
        if (p.x < -40) p.x = width + 20;
    }

    if (!reduzirMovimento) animacao = requestAnimationFrame(quadro);
}

function iniciarAnimacao() {
    cancelAnimationFrame(animacao);
    animacao = null;
    if (!particulas.length) {
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    if (reduzirMovimento) quadro(0);
    else animacao = requestAnimationFrame(quadro);
}


/* ---------- Raios ---------- */

function agendarRaio() {
    clearTimeout(timerRaio);
    if (!CENAS[cenaAtual]?.raios || reduzirMovimento) return;

    timerRaio = setTimeout(() => {
        raio.classList.remove("piscar");
        void raio.offsetWidth;   // reinicia a animação
        raio.classList.add("piscar");
        agendarRaio();
    }, 6000 + Math.random() * 9000);
}


/* ---------- Aplicar uma cena ---------- */

function aplicarCena(cena, periodo) {
    if (!camada || !CENAS[cena]) return;
    const mudouCena = cena !== cenaAtual || periodo !== periodoAtual;
    cenaAtual = cena;
    periodoAtual = periodo;

    const config = CENAS[cena];
    fundo.style.background = CEUS[periodo][config.ceu];

    // Passa a cor do céu para a barra lateral acompanhar (refinamento.css)
    const hex = CEUS[periodo][config.ceu].match(/#([0-9A-F]{6})/i)?.[1];
    if (hex) {
        const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
        document.documentElement.style.setProperty("--clima-topo", `rgba(${r}, ${g}, ${b}, .5)`);
    }

    const astro = config.astro;
    sol.style.opacity = periodo === "noite" ? "0" : String(periodo === "entardecer" ? astro * .8 : astro);
    lua.style.opacity = periodo === "noite" ? String(astro * .9) : "0";
    if (periodo === "entardecer") {
        sol.style.top = "-170px";
        sol.style.filter = "hue-rotate(-18deg) saturate(1.3)";
    } else {
        sol.style.top = "";
        sol.style.filter = "";
    }

    if (mudouCena) {
        desenharNuvens(config);
        criarParticulas();
        iniciarAnimacao();
        agendarRaio();
    }

    camada.classList.add("ativo");
}


/* ---------- Dados do tempo ---------- */

function lerCache() {
    try { return JSON.parse(localStorage.getItem(CHAVE_LOCAL)) || {}; } catch (e) { return {}; }
}

function salvarCache(dados) {
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify({ ...lerCache(), ...dados })); } catch (e) { /* ignora */ }
}

function obterLocal() {
    return new Promise(resolve => {
        const cache = lerCache();

        if (!navigator.geolocation) {
            resolve(cache.local || CIDADE_PADRAO);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            pos => {
                const local = {
                    nome: "Sua localização",
                    lat: Number(pos.coords.latitude.toFixed(2)),
                    lon: Number(pos.coords.longitude.toFixed(2))
                };
                salvarCache({ local });
                resolve(local);
            },
            () => resolve(cache.local || CIDADE_PADRAO),
            { timeout: 8000, maximumAge: 60 * 60 * 1000 }
        );
    });
}

function calcularPeriodo(dados) {
    const agora = Date.now();
    const nascer = dados?.daily?.sunrise?.[0] ? new Date(dados.daily.sunrise[0]).getTime() : null;
    const por = dados?.daily?.sunset?.[0] ? new Date(dados.daily.sunset[0]).getTime() : null;

    if (nascer && por) {
        const margem = 45 * 60 * 1000;
        if (Math.abs(agora - por) <= margem || Math.abs(agora - nascer) <= margem / 2) return "entardecer";
        return agora > nascer && agora < por ? "dia" : "noite";
    }

    if (dados?.current?.is_day === 0) return "noite";
    const hora = new Date().getHours();
    return hora >= 6 && hora < 18 ? "dia" : "noite";
}

let ultimosDados = null;

async function atualizarClima() {
    try {
        const local = await obterLocal();
        const url = "https://api.open-meteo.com/v1/forecast"
            + `?latitude=${local.lat}&longitude=${local.lon}`
            + "&current=temperature_2m,weather_code,is_day,cloud_cover"
            + "&daily=sunrise,sunset&timezone=auto&forecast_days=1";

        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error(`Open-Meteo ${resposta.status}`);
        const dados = await resposta.json();
        ultimosDados = dados;

        const cena = cenaPorCodigo(dados.current?.weather_code);
        const periodo = calcularPeriodo(dados);
        aplicarCena(cena, periodo);

        const temp = Math.round(dados.current?.temperature_2m);
        camada.dataset.descricao = `${NOMES[cena]} · ${temp}° · ${local.nome}`;
        salvarCache({ ultima: { cena, periodo, temp } });
    } catch (e) {
        console.warn("Clima indisponível:", e);
        // Sem internet: usa a última cena conhecida, se houver
        const ultima = lerCache().ultima;
        if (ultima) aplicarCena(ultima.cena, calcularPeriodo(null) === "noite" ? "noite" : ultima.periodo);
    }
}

// Exposto para o Jarvis ou outros módulos, se um dia quiserem
window.climaAtual = () => camada?.dataset.descricao || null;


/* ---------- Início ---------- */

document.addEventListener("DOMContentLoaded", () => {
    if (!montarCamada()) return;

    const params = new URLSearchParams(location.search);
    const forcarCena = params.get("clima");
    const forcarPeriodo = params.get("periodo");

    if (forcarCena && CENAS[forcarCena]) {
        aplicarCena(forcarCena, CEUS[forcarPeriodo] ? forcarPeriodo : "dia");
        return;
    }

    // Mostra a última cena conhecida na hora e atualiza em seguida
    const ultima = lerCache().ultima;
    if (ultima) aplicarCena(ultima.cena, calcularPeriodo(null) === "noite" ? "noite" : ultima.periodo);

    atualizarClima();
    setInterval(atualizarClima, ATUALIZAR_A_CADA_MIN * 60 * 1000);

    // Confere o período (dia → entardecer → noite) a cada 5 minutos
    setInterval(() => {
        if (cenaAtual && ultimosDados) aplicarCena(cenaAtual, calcularPeriodo(ultimosDados));
    }, 5 * 60 * 1000);

    // Economiza bateria: pausa a animação com a aba escondida
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            cancelAnimationFrame(animacao);
            animacao = null;
        } else if (cenaAtual) {
            iniciarAnimacao();
        }
    });
});

})();
