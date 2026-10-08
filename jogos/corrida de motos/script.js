// ============ CONFIGURAÇÕES ============
const W = 640, H = 360, HORIZ = 150, LINHAS = H - HORIZ;
const ZS = 100;            // distância da "câmera" até a moto do jogador
const COMP = 30;           // comprimento das faixas vermelho/branco
const UK = 0.9;            // unidades de pista por (km/h) por segundo
const VMAX = 300;          // velocidade máxima (km/h)
const KK = 0.006;          // intensidade visual das curvas
const MAXH = W * 0.55;     // meia-largura da pista na base da tela
const CHECK = 6000;        // distância entre checkpoints
const SKYW = 1280;         // largura da imagem da cidade

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);

// ============ CIDADE NOTURNA (desenhada uma vez, fora da tela) ============
const cidade = document.createElement('canvas');
cidade.width = SKYW; cidade.height = 90;
(function () {
  const c = cidade.getContext('2d');
  let x = 0;
  while (x < SKYW) {
    const w = 22 + Math.floor(Math.random() * 34), h = 30 + Math.floor(Math.random() * 58);
    c.fillStyle = '#0a0a33';
    c.fillRect(x, 90 - h, w, h);
    for (let wy = 90 - h + 5; wy < 86; wy += 7)
      for (let wx = x + 3; wx < x + w - 3; wx += 6)
        if (Math.random() < 0.55) { c.fillStyle = Math.random() < 0.8 ? '#ffd54f' : '#ffb300'; c.fillRect(wx, wy, 3, 4); }
    x += w + Math.floor(Math.random() * 4);
  }
})();

// ============ TRILHA (retas e curvas, repete ao chegar no fim) ============
const trilha = (function () {
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const secoes = []; let total = 0;
  for (let i = 0; i < 40; i++) {
    const len = 1500 + r() * 2500;
    const c = i % 2 === 0 ? 0 : (r() < 0.5 ? -1 : 1) * (0.6 + r() * 1.1);
    secoes.push({ ini: total, len, c });
    total += len;
  }
  return { secoes, total };
})();
let escala = 1;   // curvas ficam mais fechadas a cada nível

function curvaEm(p) {
  p = ((p % trilha.total) + trilha.total) % trilha.total;
  for (const s of trilha.secoes) {
    if (p < s.ini + s.len) {
      const f = (p - s.ini) / s.len;
      return s.c * Math.min(1, f / 0.2, (1 - f) / 0.2) * escala;   // entra e sai da curva suavemente
    }
  }
  return 0;
}

// ============ ESTADO ============
const CORES = [
  { suit: '#1e3fd0', cap: '#ffd600' }, { suit: '#fbc02d', cap: '#222222' },
  { suit: '#2e7d32', cap: '#ffffff' }, { suit: '#7b1fa2', cap: '#ffeb3b' }
];
let estado = 'parado';     // parado | contagem | correndo | pausado | fim
let pos = 0, vel = 0, x = 0, skyX = 0, nivel = 1, tempo = 45, pontos = 0, recorde = 0;
let contagem = 0, batida = 0, proxCheck = CHECK, msg = { t: '', s: 0 };
let rivais = [];
const ctl = { esq: false, dir: false, acel: false, freio: false };
const CX = new Float32Array(H), HW = new Float32Array(H);
let somLigado = true, audioCtx = null, motor = null;

function lerRecorde() { try { return parseInt(localStorage.getItem('recordeMotos')) || 0; } catch (e) { return 0; } }
function salvarRecorde() { try { localStorage.setItem('recordeMotos', recorde); } catch (e) {} }

// ============ SOM ============
function ctxAudio() { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
function bip(freq, dur, tipo) {
  if (!somLigado) return;
  try {
    const a = ctxAudio(), o = a.createOscillator(), g = a.createGain();
    o.type = tipo || 'square'; o.frequency.value = freq; g.gain.value = 0.05;
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  } catch (e) {}
}
function ligarMotor() {
  if (!somLigado || motor) return;
  try {
    const a = ctxAudio(), o = a.createOscillator(), g = a.createGain();
    o.type = 'sawtooth'; g.gain.value = 0.025;
    o.connect(g); g.connect(a.destination); o.start(); motor = o;
  } catch (e) {}
}
function desligarMotor() { if (motor) { try { motor.stop(); } catch (e) {} motor = null; } }

// ============ RIVAIS ============
function novoRival(p) {
  const cor = CORES[Math.floor(Math.random() * CORES.length)];
  return { pos: p, x: rnd(-0.8, 0.8), alvo: 0, troca: 0, vel: rnd(90, 150 + nivel * 12), cor, passou: false };
}
function ajustarRivais() {
  while (rivais.length < Math.min(9, 3 + nivel)) rivais.push(novoRival(pos + rnd(3500, 5500)));
}

// ============ INÍCIO ============
function iniciarJogo() {
  pos = 0; vel = 0; x = 0; nivel = 1; escala = 1; tempo = 45; pontos = 0; batida = 0;
  proxCheck = CHECK; rivais = [];
  for (let i = 0; i < 4; i++) rivais.push(novoRival(500 + i * 650 + rnd(0, 300)));
  recorde = lerRecorde();
  estado = 'contagem'; contagem = 3;
  desligarMotor(); ligarMotor();
}
function pausarJogo() {
  if (estado === 'correndo') { estado = 'pausado'; desligarMotor(); }
  else if (estado === 'pausado') { estado = 'correndo'; ligarMotor(); }
}
function fimDeJogo() {
  estado = 'fim'; desligarMotor(); bip(150, 0.6, 'sawtooth');
}

// ============ ATUALIZAÇÃO (física e regras) ============
function atualizar(dt) {
  if (msg.s > 0) msg.s -= dt;
  if (batida > 0) batida -= dt;

  if (estado === 'contagem') {
    const antes = Math.ceil(contagem);
    contagem -= dt;
    if (Math.ceil(contagem) !== antes && contagem > 0) bip(440, 0.1);
    if (contagem <= 0) { estado = 'correndo'; msg = { t: 'VAI!', s: 0.9 }; bip(880, 0.3, 'triangle'); }
    return;
  }
  if (estado !== 'correndo') return;

  // velocidade
  if (ctl.freio) vel -= 300 * dt;
  else if (ctl.acel) vel += (130 - vel * 0.2) * dt;
  else vel -= 40 * dt;
  const fora = Math.abs(x) > 1.05;
  if (fora && vel > 90) vel -= 260 * dt;
  vel = Math.max(0, Math.min(VMAX, vel));
  const f = vel / VMAX;

  // direção + força centrífuga (a moto é empurrada para fora da curva)
  const volante = (ctl.dir ? 1 : 0) - (ctl.esq ? 1 : 0);
  if (vel > 5) x += volante * dt * (1.0 + 1.6 * f);
  x -= curvaEm(pos) * dt * f * f * 0.9;
  if (Math.abs(x) > 1.7) { x = Math.sign(x) * 1.7; vel = Math.max(0, vel - 400 * dt); }

  pos += vel * UK * dt;
  skyX += curvaEm(pos) * vel * dt * 0.08;
  tempo -= dt;
  pontos += vel * dt * 0.1;

  // rivais
  for (const r of rivais) {
    r.pos += r.vel * UK * dt;
    r.troca -= dt;
    if (r.troca <= 0) { r.alvo = rnd(-0.85, 0.85); r.troca = rnd(1.5, 4); }
    r.x += (r.alvo - r.x) * dt * 0.6;
    const dd = r.pos - pos;
    if (!r.passou && dd < 0) { r.passou = true; pontos += 100 * nivel; bip(700, 0.08); }
    if (dd < -500) {
      r.pos = pos + rnd(3000, 6000); r.passou = false; r.x = rnd(-0.8, 0.8);
      r.vel = rnd(90, 150 + nivel * 12);
    }
    if (batida <= 0 && dd > -30 && dd < 30 && Math.abs(r.x - x) < 0.22) {
      batida = 0.9; vel *= 0.3; r.pos += 90; bip(120, 0.35, 'sawtooth');
    }
  }

  // checkpoint
  if (pos >= proxCheck) {
    proxCheck += CHECK; tempo += 25; nivel++;
    escala = Math.min(1.4, 1 + 0.1 * (nivel - 1));
    msg = { t: 'CHECKPOINT! +25s', s: 2 };
    ajustarRivais();
    bip(990, 0.4, 'triangle');
  }

  if (pontos > recorde) { recorde = Math.floor(pontos); salvarRecorde(); }
  if (motor) motor.frequency.value = 50 + vel * 0.5;
  if (tempo <= 0) { tempo = 0; fimDeJogo(); }
}

// ============ DESENHO ============
function proj(dd) {
  const t = ZS / (dd + ZS);
  const y = HORIZ + t * LINHAS;
  const yi = Math.min(H - 1, Math.max(HORIZ + 1, Math.floor(y)));
  const half = t * MAXH;
  const base = CX[yi] + x * HW[yi];           // centro da pista sem o deslocamento do jogador
  return { t, y, half, c: base - x * half };
}

function desenharMoto(cx, by, s, suit, cap, lean, freando) {
  ctx.save();
  ctx.translate(cx, by); ctx.scale(s, s); ctx.rotate(lean);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 26, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.fillRect(-6, -32, 12, 32);                    // pneu
  ctx.fillStyle = suit; ctx.fillRect(-10, -52, 20, 24);                     // traseira
  ctx.fillStyle = '#fff'; ctx.fillRect(-2, -52, 4, 24);
  ctx.fillStyle = freando ? '#ff1744' : '#b71c1c'; ctx.fillRect(-5, -33, 10, 4);   // lanterna
  ctx.fillStyle = '#222'; ctx.fillRect(-15, -52, 7, 20); ctx.fillRect(8, -52, 7, 20);   // pernas
  ctx.fillStyle = suit; ctx.fillRect(-15, -88, 30, 40);                      // tronco
  ctx.fillStyle = '#fff'; ctx.fillRect(-3, -88, 6, 36);
  ctx.fillStyle = '#222'; ctx.fillRect(-23, -86, 8, 26); ctx.fillRect(15, -86, 8, 26);   // braços
  ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(0, -98, 12, 0, Math.PI * 2); ctx.fill();  // capacete
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-12, -100, 24, 4);
  ctx.restore();
}

function desenhar() {
  const offroad = estado === 'correndo' && Math.abs(x) > 1.05 && vel > 20;
  ctx.save();
  if (offroad) ctx.translate(rnd(-2, 2), rnd(-2, 2));

  // céu + cidade
  const g = ctx.createLinearGradient(0, 0, 0, HORIZ);
  g.addColorStop(0, '#00001f'); g.addColorStop(1, '#16167a');
  ctx.fillStyle = g; ctx.fillRect(-4, -4, W + 8, HORIZ + 5);
  const off = ((skyX % SKYW) + SKYW) % SKYW;
  ctx.drawImage(cidade, -off, HORIZ - 89);
  ctx.drawImage(cidade, SKYW - off, HORIZ - 89);

  // pista, linha por linha (do horizonte para a base)
  let dx = 0, xo = 0;
  for (let y = H - 1; y > HORIZ; y--) {
    const t = (y - HORIZ) / LINHAS;
    const dd = ZS / t - ZS;
    dx += curvaEm(pos + dd) * KK; xo += dx;
    const half = t * MAXH;
    const c = W / 2 + xo - x * half;
    CX[y] = c; HW[y] = half;
  }
  for (let y = HORIZ + 1; y < H; y++) {
    const t = (y - HORIZ) / LINHAS;
    const d = pos + ZS / t - ZS;
    const half = HW[y], c = CX[y];
    const faixa = Math.floor(d / COMP) % 2;
    ctx.fillStyle = Math.floor(d / 120) % 2 ? '#1a1ac8' : '#1616b0';
    ctx.fillRect(-4, y, W + 8, 1);
    ctx.fillStyle = faixa ? '#e53935' : '#f5f5f5';
    ctx.fillRect(c - half * 1.22, y, half * 2.44, 1);
    ctx.fillStyle = faixa ? '#5f5f66' : '#68686f';
    ctx.fillRect(c - half, y, half * 2, 1);
    const lw = Math.max(1, half * 0.03);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(c - half, y, lw, 1); ctx.fillRect(c + half - lw, y, lw, 1);
    if (Math.floor(d / 90) % 2 === 0) ctx.fillRect(c - lw * 0.7, y, lw * 1.4, 1);
  }

  // objetos (de longe para perto): postes, arco de checkpoint e rivais
  const itens = [];
  for (const r of rivais) { const dd = r.pos - pos; if (dd > -30 && dd < 4500) itens.push({ dd, tipo: 'r', r }); }
  for (let k = Math.floor((pos - 60) / 450); k * 450 - pos < 4500; k++) {
    const dd = k * 450 - pos; if (dd > -60) itens.push({ dd, tipo: 'p' });
  }
  const ddA = proxCheck - pos;
  if (ddA > -60 && ddA < 4500) itens.push({ dd: ddA, tipo: 'a' });
  itens.sort((a, b) => b.dd - a.dd);

  for (const it of itens) {
    const p = proj(it.dd), t = p.t;
    if (t < 0.03) continue;
    if (it.tipo === 'p') {                       // poste de luz à esquerda
      const px = p.c - p.half * 1.45, h = 150 * t, w = Math.max(1, 5 * t);
      ctx.fillStyle = '#8a8fa0'; ctx.fillRect(px - w / 2, p.y - h, w, h);
      ctx.fillRect(px, p.y - h, 55 * t, Math.max(1, 4 * t));
      ctx.fillStyle = 'rgba(255,224,130,.25)';
      ctx.beginPath(); ctx.arc(px + 56 * t, p.y - h + 3 * t, 20 * t, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe082'; ctx.fillRect(px + 45 * t, p.y - h, 22 * t, Math.max(2, 6 * t));
    } else if (it.tipo === 'a') {                // arco do checkpoint
      const l = p.c - p.half * 1.3, rr = p.c + p.half * 1.3, h = 130 * t, w = Math.max(2, 8 * t);
      ctx.fillStyle = '#fdd835';
      ctx.fillRect(l - w, p.y - h, w, h); ctx.fillRect(rr, p.y - h, w, h);
      ctx.fillRect(l - w, p.y - h, rr - l + 2 * w, 24 * t);
      if (t > 0.15) {
        ctx.fillStyle = '#000'; ctx.font = 'bold ' + Math.floor(15 * t) + 'px Arial'; ctx.textAlign = 'center';
        ctx.fillText('CHECKPOINT', p.c, p.y - h + 17 * t);
      }
    } else {                                     // moto rival
      desenharMoto(p.c + it.r.x * p.half, p.y, t, it.r.cor.suit, it.r.cor.cap, 0, false);
    }
  }

  // moto do jogador
  const lean = ((ctl.dir ? 1 : 0) - (ctl.esq ? 1 : 0)) * 0.16;
  const pisca = batida > 0 && Math.floor(batida * 12) % 2;
  if (!pisca) {
    const quique = Math.sin(pos * 0.5) * (vel / VMAX) * 1.5;
    desenharMoto(W / 2, H - 10 + quique, 1.05, '#d32f2f', '#ffffff', lean, ctl.freio);
  }
  ctx.restore();

  // mensagens e telas
  ctx.textAlign = 'center';
  if (estado === 'contagem') texto(String(Math.ceil(contagem)), 90, H / 2 - 10, '#ffeb3b');
  else if (msg.s > 0) texto(msg.t, 30, 70, '#ffeb3b');
  if (estado === 'parado') overlay('CORRIDA DE MOTOS', 'Enter ou "Iniciar Corrida"');
  if (estado === 'pausado') overlay('PAUSADO', 'Espa\u00E7o ou P continua');
  if (estado === 'fim') overlay('TEMPO ESGOTADO', 'Pontos: ' + Math.floor(pontos) + ' \u2022 ' + (pos * 0.0003).toFixed(1) + ' km \u2022 Enter reinicia');
}
function texto(t, tam, y, cor) {
  ctx.font = 'bold ' + tam + 'px Arial'; ctx.lineWidth = 5; ctx.strokeStyle = '#000';
  ctx.strokeText(t, W / 2, y); ctx.fillStyle = cor; ctx.fillText(t, W / 2, y);
}
function overlay(titulo, sub) {
  ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = 'bold 40px Arial'; ctx.fillText(titulo, W / 2, H / 2 - 10);
  ctx.font = '18px Arial'; ctx.fillText(sub, W / 2, H / 2 + 28);
}

// ============ PAINEL ============
const cache = {};
function painel(id, v) { if (cache[id] !== v) { cache[id] = v; el(id).textContent = v; } }
function atualizarPainel() {
  painel('pontos', Math.floor(pontos)); painel('tempo', Math.ceil(tempo));
  painel('vel', Math.round(vel)); painel('nivel', nivel); painel('recorde', recorde);
}

// ============ LOOP ============
let ultimo = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - ultimo) / 1000 || 0);
  ultimo = t;
  atualizar(dt);
  desenhar();
  atualizarPainel();
  requestAnimationFrame(loop);
}

// ============ CONTROLES ============
const mapa = {
  ArrowLeft: 'esq', a: 'esq', A: 'esq', ArrowRight: 'dir', d: 'dir', D: 'dir',
  ArrowUp: 'acel', w: 'acel', W: 'acel', ArrowDown: 'freio', s: 'freio', S: 'freio'
};
document.addEventListener('keydown', e => {
  if (mapa[e.key]) { e.preventDefault(); ctl[mapa[e.key]] = true; }
  else if (e.key === ' ' || e.key === 'p' || e.key === 'P') { e.preventDefault(); pausarJogo(); }
  else if (e.key === 'Enter' && (estado === 'parado' || estado === 'fim')) iniciarJogo();
});
document.addEventListener('keyup', e => { if (mapa[e.key]) ctl[mapa[e.key]] = false; });

document.querySelectorAll('.ctl').forEach(b => {
  const liga = v => e => { e.preventDefault(); ctl[b.dataset.ctl] = v; b.classList.toggle('ativo', v); };
  b.addEventListener('pointerdown', liga(true));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, liga(false)));
  b.addEventListener('contextmenu', e => e.preventDefault());
});

el('btnIniciar').addEventListener('click', e => { e.target.blur(); iniciarJogo(); });
el('btnPausar').addEventListener('click', e => { e.target.blur(); pausarJogo(); });
el('btnSom').addEventListener('click', e => {
  somLigado = !somLigado;
  e.target.textContent = somLigado ? '\uD83D\uDD0A' : '\uD83D\uDD07';
  if (!somLigado) desligarMotor(); else if (estado === 'correndo') ligarMotor();
  e.target.blur();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && estado === 'correndo') pausarJogo(); });

// ============ START ============
recorde = lerRecorde();
requestAnimationFrame(loop);