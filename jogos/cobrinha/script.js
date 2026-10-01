// ============ CONFIGURAÇÕES ============
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const N = 20;                                   // quadrados por lado
const TAM = canvas.width / N;                   // tamanho de cada quadrado
const MACAS_POR_NIVEL = 5;

const DIFICULDADES = {
  facil:   { base: 220, min: 100, atravessa: true,  obstaculos: false },
  medio:   { base: 170, min: 70,  atravessa: false, obstaculos: false },
  dificil: { base: 130, min: 55,  atravessa: false, obstaculos: true  }
};

// ============ ESTADO ============
let cobra, direcao, filaDirecoes, comida, dourada, obstaculos;
let pontos, nivel, macasComidas, recorde, estado = 'parado';   // parado | jogando | pausado | fim | vitoria
let timer = null, config = DIFICULDADES.medio;
let mensagem = null;                            // { texto, ate }
let somLigado = true, audioCtx = null;

const el = id => document.getElementById(id);

// ============ RECORDE (separado por dificuldade) ============
function chaveRecorde() { return 'recordeCobrinha_' + el('dificuldade').value; }
function lerRecorde() {
  try { return parseInt(localStorage.getItem(chaveRecorde())) || 0; } catch (e) { return 0; }
}
function salvarRecorde() {
  try { localStorage.setItem(chaveRecorde(), recorde); } catch (e) {}
}
function mostrarRecorde() { recorde = lerRecorde(); el('recorde').textContent = recorde; }

// ============ SOM ============
function bip(freq, dur, tipo) {
  if (!somLigado) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = tipo || 'square'; o.frequency.value = freq;
    g.gain.value = 0.05;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}

// ============ INICIAR ============
function iniciarJogo() {
  config = DIFICULDADES[el('dificuldade').value];
  cobra = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  direcao = 'direita';
  filaDirecoes = [];
  pontos = 0; nivel = 1; macasComidas = 0;
  obstaculos = []; dourada = null; mensagem = null;
  estado = 'jogando';
  mostrarRecorde();
  atualizarPainel();
  el('dificuldade').disabled = true;
  comida = posLivre();
  agendar();
}

function atraso() {
  // Nunca fica abaixo do mínimo: corrige o bug da velocidade negativa
  return Math.max(config.min, config.base - (nivel - 1) * 12);
}
function agendar() {
  clearTimeout(timer);
  timer = setTimeout(passo, atraso());
}

// ============ POSIÇÃO LIVRE ============
function posLivre(distMinCabeca) {
  const ocupado = new Set();
  cobra.forEach(p => ocupado.add(p.x + ',' + p.y));
  obstaculos.forEach(p => ocupado.add(p.x + ',' + p.y));
  if (comida) ocupado.add(comida.x + ',' + comida.y);
  if (dourada) ocupado.add(dourada.x + ',' + dourada.y);
  const livres = [];
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
    if (ocupado.has(x + ',' + y)) continue;
    if (distMinCabeca && Math.abs(x - cobra[0].x) + Math.abs(y - cobra[0].y) < distMinCabeca) continue;
    livres.push({ x, y });
  }
  return livres.length ? livres[Math.floor(Math.random() * livres.length)] : null;
}

// ============ LOOP PRINCIPAL ============
function passo() {
  if (estado !== 'jogando') return;

  if (filaDirecoes.length) direcao = filaDirecoes.shift();

  const cabeca = { ...cobra[0] };
  if (direcao === 'cima') cabeca.y--;
  if (direcao === 'baixo') cabeca.y++;
  if (direcao === 'esquerda') cabeca.x--;
  if (direcao === 'direita') cabeca.x++;

  // Paredes: atravessa (fácil) ou morre
  if (config.atravessa) {
    cabeca.x = (cabeca.x + N) % N;
    cabeca.y = (cabeca.y + N) % N;
  } else if (cabeca.x < 0 || cabeca.x >= N || cabeca.y < 0 || cabeca.y >= N) {
    return fimDeJogo();
  }

  const comeu = comida && cabeca.x === comida.x && cabeca.y === comida.y;
  const comeuDourada = dourada && cabeca.x === dourada.x && cabeca.y === dourada.y;

  // Colisão com o corpo (a ponta do rabo libera espaço, a não ser que ela cresça)
  const corpo = comeu || comeuDourada ? cobra : cobra.slice(0, -1);
  if (corpo.some(p => p.x === cabeca.x && p.y === cabeca.y)) return fimDeJogo();
  if (obstaculos.some(p => p.x === cabeca.x && p.y === cabeca.y)) return fimDeJogo();

  cobra.unshift(cabeca);

  if (comeu) {
    pontos += 10 * nivel;
    macasComidas++;
    bip(660, 0.08);
    comida = null;
    if (macasComidas % MACAS_POR_NIVEL === 0) subirNivel();
    comida = posLivre();
    if (!dourada && Math.random() < 0.2) {
      const p = posLivre();
      if (p) dourada = { ...p, ate: Date.now() + 6000 };
    }
  } else if (comeuDourada) {
    pontos += 50 * nivel;
    bip(990, 0.15, 'triangle');
    dourada = null;
    mensagem = { texto: '+' + (50 * nivel) + ' \u2B50', ate: Date.now() + 900 };
  } else {
    cobra.pop();
  }

  if (dourada && Date.now() > dourada.ate) dourada = null;

  if (pontos > recorde) { recorde = pontos; salvarRecorde(); }
  atualizarPainel();

  if (!comida) return vitoria();   // tabuleiro cheio
  agendar();
}

function subirNivel() {
  nivel++;
  mensagem = { texto: 'N\u00CDVEL ' + nivel + '!', ate: Date.now() + 1200 };
  bip(880, 0.25, 'sawtooth');
  if (config.obstaculos) {
    const p = posLivre(5);            // obstáculo longe da cabeça
    if (p) obstaculos.push(p);
  }
}

function atualizarPainel() {
  el('pontos').textContent = pontos;
  el('nivel').textContent = nivel;
  el('recorde').textContent = recorde;
}

function fimDeJogo() {
  estado = 'fim';
  clearTimeout(timer);
  el('dificuldade').disabled = false;
  bip(150, 0.5, 'sawtooth');
}
function vitoria() {
  estado = 'vitoria';
  clearTimeout(timer);
  el('dificuldade').disabled = false;
}

// ============ PAUSA ============
function pausarJogo() {
  if (estado === 'jogando') { estado = 'pausado'; clearTimeout(timer); }
  else if (estado === 'pausado') { estado = 'jogando'; agendar(); }
}

// ============ DIREÇÃO (com fila para não perder viradas rápidas) ============
function mudarDirecao(nova) {
  if (estado !== 'jogando') return;
  const opostas = { cima: 'baixo', baixo: 'cima', esquerda: 'direita', direita: 'esquerda' };
  const ultima = filaDirecoes.length ? filaDirecoes[filaDirecoes.length - 1] : direcao;
  if (nova === ultima || nova === opostas[ultima]) return;
  if (filaDirecoes.length < 2) filaDirecoes.push(nova);
}

// ============ DESENHO (roda a 60fps, independente da lógica) ============
function desenhar() {
  ctx.fillStyle = '#f1f8e9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grade xadrez suave
  ctx.fillStyle = '#e4f0d8';
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++)
    if ((x + y) % 2) ctx.fillRect(x * TAM, y * TAM, TAM, TAM);

  if (cobra) {
    // Obstáculos
    ctx.fillStyle = '#546e7a';
    obstaculos.forEach(o => {
      ctx.fillRect(o.x * TAM + 1, o.y * TAM + 1, TAM - 2, TAM - 2);
      ctx.fillStyle = '#78909c';
      ctx.fillRect(o.x * TAM + 3, o.y * TAM + 3, TAM - 8, TAM - 8);
      ctx.fillStyle = '#546e7a';
    });

    // Maçã
    if (comida) {
      const cx = comida.x * TAM + TAM / 2, cy = comida.y * TAM + TAM / 2;
      ctx.fillStyle = '#dc3545';
      ctx.beginPath(); ctx.arc(cx, cy, TAM / 2 - 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2e7d32';
      ctx.fillRect(cx - 1, cy - TAM / 2, 3, 5);
    }

    // Maçã dourada (pulsa e pisca perto de sumir)
    if (dourada) {
      const resta = dourada.ate - Date.now();
      if (resta > 1500 || Math.floor(Date.now() / 150) % 2) {
        const pulso = 2 * Math.sin(Date.now() / 120);
        ctx.fillStyle = '#ffc107';
        ctx.beginPath();
        ctx.arc(dourada.x * TAM + TAM / 2, dourada.y * TAM + TAM / 2, TAM / 2 - 1 + pulso / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ff8f00'; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    // Cobra
    cobra.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? '#1b5e20' : (i % 2 ? '#43a047' : '#4caf50');
      ctx.beginPath();
      ctx.roundRect(p.x * TAM + 1, p.y * TAM + 1, TAM - 2, TAM - 2, i === 0 ? 7 : 4);
      ctx.fill();
    });

    // Olhos na cabeça
    const h = cobra[0];
    const d = { cima: [0, -1], baixo: [0, 1], esquerda: [-1, 0], direita: [1, 0] }[direcao];
    const perp = [-d[1], d[0]];
    const bx = h.x * TAM + TAM / 2 + d[0] * 4, by = h.y * TAM + TAM / 2 + d[1] * 4;
    [-1, 1].forEach(s => {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(bx + perp[0] * 4 * s, by + perp[1] * 4 * s, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(bx + perp[0] * 4 * s + d[0], by + perp[1] * 4 * s + d[1], 1.2, 0, Math.PI * 2); ctx.fill();
    });
  }

  // Mensagem temporária (nível, bônus)
  if (mensagem && Date.now() < mensagem.ate) {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, canvas.height / 2 - 30, canvas.width, 50);
    ctx.fillStyle = '#ffeb3b'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center';
    ctx.fillText(mensagem.texto, canvas.width / 2, canvas.height / 2 + 5);
  }

  // Telas de overlay
  if (estado === 'parado') overlay('JOGO DA COBRINHA', 'Pressione Enter ou "Iniciar Jogo"');
  if (estado === 'pausado') overlay('PAUSADO', 'Espa\u00E7o para continuar');
  if (estado === 'fim') overlay('FIM DE JOGO', 'Pontos: ' + pontos + (pontos >= recorde && pontos > 0 ? '  \uD83C\uDFC6 NOVO RECORDE!' : '') + '  \u2022  Enter reinicia');
  if (estado === 'vitoria') overlay('VOC\u00CA VENCEU! \uD83C\uDFC6', 'Pontos: ' + pontos + '  \u2022  Enter reinicia');

  requestAnimationFrame(desenhar);
}
function overlay(titulo, sub) {
  ctx.fillStyle = 'rgba(0,0,0,.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = 'bold 32px Arial';
  ctx.fillText(titulo, canvas.width / 2, canvas.height / 2 - 10);
  ctx.font = '16px Arial';
  ctx.fillText(sub, canvas.width / 2, canvas.height / 2 + 25);
}

// ============ CONTROLES ============
const mapaTeclas = {
  ArrowUp: 'cima', ArrowDown: 'baixo', ArrowLeft: 'esquerda', ArrowRight: 'direita',
  w: 'cima', s: 'baixo', a: 'esquerda', d: 'direita',
  W: 'cima', S: 'baixo', A: 'esquerda', D: 'direita'
};
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT') return;
  if (mapaTeclas[e.key]) { e.preventDefault(); mudarDirecao(mapaTeclas[e.key]); }
  else if (e.key === ' ') { e.preventDefault(); pausarJogo(); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (estado !== 'jogando' && estado !== 'pausado') iniciarJogo();
  }
});

// Botões (blur evita que a barra de espaço "clique" no botão focado)
el('btnIniciar').addEventListener('click', e => { e.target.blur(); iniciarJogo(); });
el('btnPausar').addEventListener('click', e => { e.target.blur(); pausarJogo(); });
el('btnSom').addEventListener('click', e => {
  somLigado = !somLigado;
  e.target.textContent = somLigado ? '\uD83D\uDD0A' : '\uD83D\uDD07';
  e.target.blur();
});
el('dificuldade').addEventListener('change', e => { mostrarRecorde(); e.target.blur(); });
document.querySelectorAll('.tecla[data-dir]').forEach(b =>
  b.addEventListener('click', () => mudarDirecao(b.dataset.dir)));

// Deslizar o dedo no tabuleiro (celular)
let toque = null;
canvas.addEventListener('touchstart', e => {
  toque = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (estado === 'parado' || estado === 'fim' || estado === 'vitoria') iniciarJogo();
}, { passive: true });
canvas.addEventListener('touchend', e => {
  if (!toque) return;
  const dx = e.changedTouches[0].clientX - toque.x;
  const dy = e.changedTouches[0].clientY - toque.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) {
    if (Math.abs(dx) > Math.abs(dy)) mudarDirecao(dx > 0 ? 'direita' : 'esquerda');
    else mudarDirecao(dy > 0 ? 'baixo' : 'cima');
  }
  toque = null;
}, { passive: true });

// Pausa automática ao trocar de aba
document.addEventListener('visibilitychange', () => { if (document.hidden && estado === 'jogando') pausarJogo(); });

// ============ START ============
mostrarRecorde();
desenhar();