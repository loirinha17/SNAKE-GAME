// ============ CONFIGURAÇÕES ============
const COLUNAS = 10, LINHAS = 20, TAM = 30;
const canvas = document.getElementById('tabuleiro');
const ctx = canvas.getContext('2d');
const proxCanvas = document.getElementById('proxima');
const pctx = proxCanvas.getContext('2d');

const PECAS = {
  I: { cor: '#00bcd4', forma: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
  O: { cor: '#ffeb3b', forma: [[1,1],[1,1]] },
  T: { cor: '#9c27b0', forma: [[0,1,0],[1,1,1],[0,0,0]] },
  S: { cor: '#4caf50', forma: [[0,1,1],[1,1,0],[0,0,0]] },
  Z: { cor: '#f44336', forma: [[1,1,0],[0,1,1],[0,0,0]] },
  J: { cor: '#2196f3', forma: [[1,0,0],[1,1,1],[0,0,0]] },
  L: { cor: '#ff9800', forma: [[0,0,1],[1,1,1],[0,0,0]] }
};
const PONTOS_LINHAS = [0, 100, 300, 500, 800];

// ============ ESTADO ============
let tabuleiro, peca, proxima, saco = [];
let pontos, nivel, linhas, recorde = 0;
let estado = 'parado';              // parado | jogando | pausado | fim
let acumulado = 0, ultimoTempo = 0;
let somLigado = true, audioCtx = null;

const el = id => document.getElementById(id);

// ============ RECORDE ============
function lerRecorde() { try { return parseInt(localStorage.getItem('recordeTetris')) || 0; } catch (e) { return 0; } }
function salvarRecorde() { try { localStorage.setItem('recordeTetris', recorde); } catch (e) {} }

// ============ SOM ============
function bip(freq, dur, tipo) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = tipo || 'square'; o.frequency.value = freq; g.gain.value = 0.04;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}

// ============ PEÇAS (sorteio em "saco": as 7 peças saem uma vez cada) ============
function proximaDoSaco() {
  if (!saco.length) {
    saco = Object.keys(PECAS);
    for (let i = saco.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [saco[i], saco[j]] = [saco[j], saco[i]];
    }
  }
  return saco.pop();
}
function criarPeca(nome) {
  const forma = PECAS[nome].forma.map(l => [...l]);
  return { forma, cor: PECAS[nome].cor, x: Math.floor((COLUNAS - forma[0].length) / 2), y: 0 };
}

// ============ COLISÃO ============
function colide(forma, px, py) {
  for (let y = 0; y < forma.length; y++)
    for (let x = 0; x < forma[y].length; x++) {
      if (!forma[y][x]) continue;
      const nx = px + x, ny = py + y;
      if (nx < 0 || nx >= COLUNAS || ny >= LINHAS) return true;
      if (ny >= 0 && tabuleiro[ny][nx]) return true;
    }
  return false;
}

// ============ INÍCIO ============
function iniciarJogo() {
  tabuleiro = Array.from({ length: LINHAS }, () => Array(COLUNAS).fill(0));
  saco = [];
  pontos = 0; nivel = 1; linhas = 0; acumulado = 0;
  recorde = lerRecorde();
  proxima = criarPeca(proximaDoSaco());
  novaPeca();
  estado = 'jogando';
  atualizarPainel();
}
function novaPeca() {
  peca = proxima;
  proxima = criarPeca(proximaDoSaco());
  if (colide(peca.forma, peca.x, peca.y)) fimDeJogo();
}
function intervalo() { return Math.max(80, 800 - (nivel - 1) * 70); }

// ============ AÇÕES ============
function mover(dx) {
  if (estado !== 'jogando') return;
  if (!colide(peca.forma, peca.x + dx, peca.y)) peca.x += dx;
}
function descer(manual) {
  if (estado !== 'jogando') return;
  if (!colide(peca.forma, peca.x, peca.y + 1)) { peca.y++; if (manual) pontos++; atualizarPainel(); }
  else travar();
}
function quedaRapida() {
  if (estado !== 'jogando') return;
  while (!colide(peca.forma, peca.x, peca.y + 1)) { peca.y++; pontos += 2; }
  bip(180, 0.06);
  travar();
}
function girar() {
  if (estado !== 'jogando') return;
  const nova = peca.forma[0].map((_, i) => peca.forma.map(l => l[i]).reverse());
  for (const desloc of [0, -1, 1, -2, 2]) {          // "wall kick": tenta empurrar da parede
    if (!colide(nova, peca.x + desloc, peca.y)) { peca.forma = nova; peca.x += desloc; bip(440, 0.03); return; }
  }
}
function travar() {
  peca.forma.forEach((linha, y) => linha.forEach((v, x) => {
    if (v && peca.y + y >= 0) tabuleiro[peca.y + y][peca.x + x] = peca.cor;
  }));
  limparLinhas();
  acumulado = 0;
  if (estado === 'jogando') novaPeca();
  atualizarPainel();
}
function limparLinhas() {
  let removidas = 0;
  for (let y = LINHAS - 1; y >= 0; y--) {
    if (tabuleiro[y].every(c => c)) {
      tabuleiro.splice(y, 1);
      tabuleiro.unshift(Array(COLUNAS).fill(0));
      removidas++; y++;
    }
  }
  if (removidas) {
    pontos += PONTOS_LINHAS[removidas] * nivel;
    linhas += removidas;
    const novo = Math.floor(linhas / 10) + 1;
    if (novo > nivel) { nivel = novo; bip(880, 0.25, 'sawtooth'); }
    else bip(removidas === 4 ? 990 : 660, 0.15, 'triangle');
  }
}
function pausarJogo() {
  if (estado === 'jogando') estado = 'pausado';
  else if (estado === 'pausado') estado = 'jogando';
}
function fimDeJogo() { estado = 'fim'; bip(150, 0.5, 'sawtooth'); }

function atualizarPainel() {
  if (pontos > recorde) { recorde = pontos; salvarRecorde(); }
  el('pontos').textContent = pontos;
  el('nivel').textContent = nivel;
  el('linhas').textContent = linhas;
  el('recorde').textContent = recorde;
}

// ============ DESENHO ============
function bloco(c, x, y, cor, tam, alfa) {
  c.globalAlpha = alfa || 1;
  c.fillStyle = cor;
  c.fillRect(x * tam + 1, y * tam + 1, tam - 2, tam - 2);
  c.fillStyle = 'rgba(255,255,255,.3)';
  c.fillRect(x * tam + 1, y * tam + 1, tam - 2, 4);
  c.fillStyle = 'rgba(0,0,0,.25)';
  c.fillRect(x * tam + 1, y * tam + tam - 5, tam - 2, 4);
  c.globalAlpha = 1;
}
function desenharForma(c, forma, px, py, cor, tam, alfa) {
  forma.forEach((l, y) => l.forEach((v, x) => { if (v) bloco(c, px + x, py + y, cor, tam, alfa); }));
}
function desenhar(t) {
  ctx.fillStyle = '#101820';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
  for (let i = 1; i < COLUNAS; i++) { ctx.beginPath(); ctx.moveTo(i * TAM, 0); ctx.lineTo(i * TAM, canvas.height); ctx.stroke(); }
  for (let i = 1; i < LINHAS; i++) { ctx.beginPath(); ctx.moveTo(0, i * TAM); ctx.lineTo(canvas.width, i * TAM); ctx.stroke(); }

  if (tabuleiro) {
    tabuleiro.forEach((l, y) => l.forEach((cor, x) => { if (cor) bloco(ctx, x, y, cor, TAM); }));
    if (peca && estado !== 'fim') {
      let gy = peca.y;
      while (!colide(peca.forma, peca.x, gy + 1)) gy++;      // peça fantasma
      desenharForma(ctx, peca.forma, peca.x, gy, peca.cor, TAM, 0.25);
      desenharForma(ctx, peca.forma, peca.x, peca.y, peca.cor, TAM);
    }
  }

  // Próxima peça
  pctx.fillStyle = '#101820';
  pctx.fillRect(0, 0, proxCanvas.width, proxCanvas.height);
  if (proxima) {
    const f = proxima.forma, tam = 24, off = (4 - f.length) / 2;
    desenharForma(pctx, f, off, off, proxima.cor, tam);
  }

  if (estado === 'parado') overlay('TETRIS', 'Enter ou "Iniciar Jogo"');
  if (estado === 'pausado') overlay('PAUSADO', 'P ou Espa\u00E7o continua');
  if (estado === 'fim') overlay('FIM DE JOGO', 'Pontos: ' + pontos + (pontos > 0 && pontos >= recorde ? ' \uD83C\uDFC6 RECORDE!' : '') + ' \u2022 Enter reinicia');
}
function overlay(titulo, sub) {
  ctx.fillStyle = 'rgba(0,0,0,.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = 'bold 32px Arial';
  ctx.fillText(titulo, canvas.width / 2, canvas.height / 2 - 10);
  ctx.font = '15px Arial';
  ctx.fillText(sub, canvas.width / 2, canvas.height / 2 + 24);
}

// ============ LOOP ============
function loop(t) {
  const dt = t - ultimoTempo;
  ultimoTempo = t;
  if (estado === 'jogando') {
    acumulado += dt;
    if (acumulado >= intervalo()) { acumulado = 0; descer(false); }
  }
  desenhar(t);
  requestAnimationFrame(loop);
}

// ============ CONTROLES ============
const acoes = {
  esquerda: () => mover(-1), direita: () => mover(1),
  girar, baixo: () => descer(true), queda: quedaRapida
};
const teclas = { ArrowLeft: 'esquerda', ArrowRight: 'direita', ArrowUp: 'girar', ArrowDown: 'baixo', ' ': 'queda' };

document.addEventListener('keydown', e => {
  if (teclas[e.key]) {
    e.preventDefault();
    if (estado === 'pausado' && e.key === ' ') return pausarJogo();
    acoes[teclas[e.key]]();
  } else if (e.key === 'p' || e.key === 'P') pausarJogo();
  else if (e.key === 'Enter' && (estado === 'parado' || estado === 'fim')) iniciarJogo();
});
el('btnIniciar').addEventListener('click', e => { e.target.blur(); iniciarJogo(); });
el('btnPausar').addEventListener('click', e => { e.target.blur(); pausarJogo(); });
document.querySelectorAll('.tecla').forEach(b =>
  b.addEventListener('click', () => acoes[b.dataset.acao]()));
document.addEventListener('visibilitychange', () => { if (document.hidden && estado === 'jogando') pausarJogo(); });

// ============ START ============
recorde = lerRecorde();
el('recorde').textContent = recorde;
requestAnimationFrame(loop);