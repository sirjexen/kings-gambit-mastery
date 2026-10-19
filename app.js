/* King's Gambit Mastery v2 — app logic (vanilla JS) */
(function(){
'use strict';

/* ---------- helpers ---------- */
function $(s){return document.querySelector(s);}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

/* ---------- health check ---------- */
var health=$('#health');
if(typeof Chess==='undefined'||typeof jQuery==='undefined'||typeof Chessboard==='undefined'||typeof LINES==='undefined'||typeof createEngine==='undefined'){
  var missing=[];
  if(typeof Chess==='undefined')missing.push('chess.js');
  if(typeof jQuery==='undefined')missing.push('jQuery');
  if(typeof Chessboard==='undefined')missing.push('chessboard.js');
  if(typeof LINES==='undefined')missing.push('data.js');
  if(typeof createEngine==='undefined')missing.push('engine.js');
  health.classList.remove('hidden');
  health.textContent='Gagal memuat: '+missing.join(', ')+'. Periksa koneksi internet lalu muat ulang halaman.';
  return;
}

/* ---------- state ---------- */
var S={mode:'belajar',gen:0};
var game=new Chess();
var board=null;

/* ---------- engine service (worker + fallback) ---------- */
var Engine={
  worker:null,seq:0,pending:{},local:null,
  init:function(){
    try{this.local=createEngine(Chess);}catch(e){this.local=null;}
    try{
      var code="importScripts('https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js','engine.js');\n"+
        "var ENG=createEngine(Chess);\n"+
        "onmessage=function(e){var d=e.data;try{var r=ENG.analyze(d.fen,{depth:d.depth,timeMs:d.timeMs});"+
        "postMessage({id:d.id,ok:true,r:r});}catch(err){postMessage({id:d.id,ok:false,error:String((err&&err.message)||err)});}};";
      var w=new Worker(URL.createObjectURL(new Blob([code],{type:'text/javascript'})));
      var self=this;
      w.onmessage=function(e){var d=e.data,p=self.pending[d.id];if(p){delete self.pending[d.id];p(d);}};
      w.onerror=function(){self.worker=null;};
      this.worker=w;
    }catch(e){this.worker=null;}
  },
  analyze:function(fen,depth,timeMs){
    var self=this;
    return new Promise(function(res){
      if(self.worker){
        var id=++self.seq;self.pending[id]=res;
        try{self.worker.postMessage({id:id,fen:fen,depth:depth,timeMs:timeMs});}
        catch(e){delete self.pending[id];fallback();}
        setTimeout(function(){var p=self.pending[id];if(p){delete self.pending[id];fallback();}},timeMs+5000);
        function fallback(){
          if(self.local){try{res({id:0,ok:true,r:self.local.analyze(fen,{depth:depth,timeMs:timeMs})});return;}catch(e){}}
          res({id:0,ok:false,error:'engine-gagal'});
        }
      }else if(self.local){
        try{res({id:0,ok:true,r:self.local.analyze(fen,{depth:depth,timeMs:timeMs})});}
        catch(e){res({id:0,ok:false,error:String(e)});}
      }else res({id:0,ok:false,error:'no-engine'});
    });
  }
};

/* ---------- book index from LINES ---------- */
var Book={byFen:{}};
LINES.forEach(function(L){
  var g=new Chess();
  L.moves.forEach(function(san,i){
    var fen=g.fen();
    var mv=g.move(san);
    if(!mv)return;
    (Book.byFen[fen]=Book.byFen[fen]||[]).push({line:L.id,san:mv.san,from:mv.from,to:mv.to,tag:L.tags[i]||'',ply:i});
  });
});
function lineById(id){for(var i=0;i<LINES.length;i++)if(LINES[i].id===id)return LINES[i];return null;}

var DEFENSES=[
  {id:'kg-g5',     label:'Terima — Klasik: 2...exf4 lalu 3...g5'},
  {id:'kg-fischer',label:'Terima — Fischer: 3...d6'},
  {id:'kg-cunning',label:'Terima — Cunningham: 3...Be7'},
  {id:'kg-d5',     label:'Terima — Modern: 3...d5'},
  {id:'kg-berlin', label:'Terima — Berlin: 3...Nf6'},
  {id:'kgd-class', label:'Tolak — Klasik: 2...Bc5'},
  {id:'kgd-falk',  label:'Tolak — Falkbeer: 2...d5'}
];

/* ---------- board ---------- */
function clearHl(){document.querySelectorAll('.square-hl,.square-last').forEach(function(el){el.classList.remove('square-hl');el.classList.remove('square-last');});}
function hl(sq,cls){var el=document.querySelector('.square-'+sq);if(el)el.classList.add(cls||'square-hl');}

var evalTimer=null;
function refresh(){
  board.position(game.fen());
  var t=game.turn()==='w'?'Putih':'Hitam';
  var extra='';
  if(game.in_checkmate())extra=' — MAT!';
  else if(game.in_stalemate())extra=' — remis (stalemate)';
  else if(game.in_draw())extra=' — remis';
  else if(game.in_check())extra=' — skak';
  $('#turnBadge').textContent='Giliran: '+t+extra;
  clearTimeout(evalTimer);
  evalTimer=setTimeout(updateEval,700);
}
function updateEval(){
  $('#evalBadge').textContent='evaluasi: …';
  Engine.analyze(game.fen(),2,500).then(function(d){
    if(!d.ok)return;
    var s=d.r.score; // sudut pandang sisi yang melangkah
    var txt;
    if(Math.abs(s)>90000)txt='mat';
    else{
      var w=(game.turn()==='w'?s:-s)/100;
      if(Math.abs(w)<0.15)txt='seimbang';
      else txt=(w>0?'+':'')+w.toFixed(1)+' untuk '+(w>0?'Putih':'Hitam');
    }
    $('#evalBadge').textContent='evaluasi: '+txt;
  });
}

board=Chessboard('board',{draggable:true,position:'start',
  pieceTheme:'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
  onDrop:onDrop,onSnapEnd:function(){refresh();}});
function onDrop(src,tgt){
  var mv=game.move({from:src,to:tgt,promotion:'q'});
  if(!mv)return 'snapback';
  game.undo(); // biarkan mode yang aktif memvalidasi & menerapkan
  routeUserMove(src,tgt);
}
function routeUserMove(src,tgt){
  if(S.mode==='belajar')Learn.userMove(src,tgt);
  else if(S.mode==='sparring')Sparring.userMove(src,tgt);
  else if(S.mode==='puzzle')Puzzle.userMove(src,tgt);
}
function applyUserMove(src,tgt){
  var mv=game.move({from:src,to:tgt,promotion:'q'});
  if(!mv)return null;
  Sfx.play(!!mv.captured);
  clearHl();hl(mv.from,'square-last');hl(mv.to,'square-last');
  refresh();return mv;
}
/* ---------- sound (WebAudio, tanpa aset) ---------- */
var Sfx={on:true,ctx:null,
  init:function(){try{this.on=localStorage.getItem('kgm_sfx')!=='off';}catch(e){this.on=true;}},
  play:function(captured){
    if(!this.on)return;
    try{
      var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      this.ctx=this.ctx||new AC();
      if(this.ctx.state==='suspended')this.ctx.resume();
      var o=this.ctx.createOscillator(),g=this.ctx.createGain();
      o.connect(g);g.connect(this.ctx.destination);
      o.type='sine';o.frequency.value=captured?200:460;
      g.gain.setValueAtTime(0.07,this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+0.12);
      o.start();o.stop(this.ctx.currentTime+0.13);
    }catch(e){}
  },
  toggle:function(){
    this.on=!this.on;
    try{localStorage.setItem('kgm_sfx',this.on?'on':'off');}catch(e){}
    return this.on;
  }
};

function coach(sel,html){$(sel).innerHTML=html;}

/* ---------- tabs ---------- */
document.querySelectorAll('.tab').forEach(function(b){
  b.addEventListener('click',function(){
    document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active');});
    b.classList.add('active');
    stopAllModes();
    S.mode=b.getAttribute('data-tab');
    document.querySelectorAll('.panel').forEach(function(p){p.classList.add('hidden');});
    $('#panel-'+S.mode).classList.remove('hidden');
    if(S.mode==='belajar')Learn.enter();
    else if(S.mode==='sparring')Sparring.enter();
    else if(S.mode==='puzzle')Puzzle.enter();
    else if(S.mode==='kuis')Quiz.enter();
  });
});
function stopAllModes(){S.gen++;Learn.stop();Sparring.stop();}

/* ================= BELAJAR (teori) ================= */
var Learn={
  line:LINES[0],ply:0,guess:false,attempts:0,autoTimer:null,
  enter:function(){
    var sel=$('#selLine');sel.innerHTML='';
    LINES.forEach(function(L){var o=document.createElement('option');o.value=L.id;o.textContent=L.name;sel.appendChild(o);});
    sel.value=this.line.id;
    sel.onchange=function(){Learn.line=lineById(sel.value);Learn.reset(false);};
    $('#btnPrev').onclick=function(){Learn.step(-1);};
    $('#btnNext').onclick=function(){Learn.step(1);};
    $('#btnAuto').onclick=function(){Learn.toggleAuto();};
    $('#btnGuess').onclick=function(){Learn.startGuess();};
    this.reset(false);
  },
  stop:function(){if(this.autoTimer){clearInterval(this.autoTimer);this.autoTimer=null;$('#btnAuto').textContent='▶ Otomatis';}},
  reset:function(guess){
    this.stop();this.ply=0;this.guess=!!guess;this.attempts=0;
    this.render();
    coach('#coachLearn',guess?'Mode tebak langkah: mainkan langkah teori berikutnya di papan.':'Pilih lini, lalu telusuri langkahnya atau uji ingatanmu dengan "Tebak Langkah".');
  },
  posAt:function(ply){
    var g=new Chess();
    for(var i=0;i<ply&&i<this.line.moves.length;i++)g.move(this.line.moves[i]);
    return g;
  },
  expected:function(){
    if(this.ply>=this.line.moves.length)return null;
    var g=this.posAt(this.ply);
    return g.move(this.line.moves[this.ply],{verbose:true});
  },
  render:function(){
    game=this.posAt(this.ply);
    board.orientation('white');board.position(game.fen(),false);
    clearHl();refresh();
    var L=this.line;
    $('#lineMeta').innerHTML='<b>'+esc(L.name)+'</b><br>'+esc(L.sub)+
      '<br>Rencana Putih: '+esc(L.planW)+'<br>Rencana Hitam: '+esc(L.planB);
    var ol=$('#moveList');ol.innerHTML='';
    var g=new Chess();
    L.moves.forEach(function(san,i){
      var mv=g.move(san);
      var li=document.createElement('li');
      if(i===this.ply-1)li.className='cur';
      li.innerHTML='<b>'+(Math.floor(i/2)+1)+'. '+(i%2===0?'':'…')+esc(mv.san)+'</b><span class="note">'+esc(L.notes[i]||'')+'</span>';
      (function(idx){li.addEventListener('click',function(){Learn.ply=idx+1;Learn.guess=false;Learn.render();});})(i);
      ol.appendChild(li);
    },this);
    if(this.guess&&this.ply<this.line.moves.length){
      var e=this.expected();
      coach('#coachLearn','Tebak langkah '+(Math.floor(this.ply/2)+1)+' untuk '+(e.color==='w'?'Putih':'Hitam')+'.');
      if(e)hl(e.from);
    }
  },
  step:function(d){
    this.guess=false;
    this.ply=Math.max(0,Math.min(this.line.moves.length,this.ply+d));
    this.render();
  },
  toggleAuto:function(){
    if(this.autoTimer){this.stop();return;}
    this.guess=false;
    if(this.ply>=this.line.moves.length)this.ply=0;
    $('#btnAuto').textContent='⏸ Berhenti';
    coach('#coachLearn','Autoplay berjalan…');
    var self=this;
    this.autoTimer=setInterval(function(){
      if(self.ply>=self.line.moves.length){self.stop();coach('#coachLearn','Selesai. Ulangi dengan "Tebak Langkah" untuk menguji ingatan.');return;}
      self.ply++;self.render();
    },1400);
    this.render();
  },
  startGuess:function(){this.reset(true);},
  userMove:function(src,tgt){
    if(!this.guess){coach('#coachLearn','Aktifkan "Tebak Langkah" dulu kalau mau menebak.');return;}
    var e=this.expected();
    if(!e){coach('#coachLearn','Lini selesai. Hebat!');return;}
    if(src===e.from&&tgt===e.to){
      applyUserMove(src,tgt);
      this.ply++;this.attempts=0;
      if(this.ply>=this.line.moves.length){
        this.guess=false;this.render();
        coach('#coachLearn','Sempurna! Kamu hafal seluruh lini <b>'+esc(this.line.name)+'</b>.');
      }else{this.render();coach('#coachLearn','Benar! '+esc(this.line.notes[this.ply-1]||''));}
    }else{
      this.attempts++;
      if(this.attempts>=2){
        coach('#coachLearn','Jawabannya: <b>'+esc(e.san)+'</b> — '+esc(this.line.notes[this.ply]||'')+'<br>Mainkan langkah itu atau tekan › untuk lanjut.');
        hl(e.from);hl(e.to);
      }else coach('#coachLearn','Belum tepat. Coba lagi!');
    }
  }
};

/* ================= SPARRING ================= */
var Sparring={
  active:false,userColor:'w',defenseId:'kg-g5',level:2,free:false,botThinking:false,movesPlayed:0,
  LEVELS:{1:{depth:1,timeMs:350,blunder:0.22},2:{depth:3,timeMs:800,blunder:0.03},3:{depth:5,timeMs:2000,blunder:0}},
  enter:function(){
    var sd=$('#selDefense');sd.innerHTML='';
    DEFENSES.forEach(function(d){var o=document.createElement('option');o.value=d.id;o.textContent=d.label;sd.appendChild(o);});
    sd.value=this.defenseId;
    $('#btnSparStart').onclick=function(){Sparring.start();};
    $('#btnSparStop').onclick=function(){Sparring.stop();};
    $('#btnPgn').onclick=function(){
      var pgn=game.pgn();
      function done(ok){coach('#coachSpar',ok?'PGN tersalin. Tempel di mana saja untuk menyimpan partaimu.':'Gagal menyalin PGN.');}
      if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(pgn).then(function(){done(true);},function(){done(false);});
      else done(false);
    };
    this.showIdle();
  },
  stop:function(){this.active=false;},
  showIdle:function(){
    game=new Chess();board.orientation('white');clearHl();refresh();
    $('#sparMoves').innerHTML='';
    coach('#coachSpar','Bot akan memainkan King\'s Gambit sungguhan: 1.e4 selalu dibalas 1…e5, lalu mengikuti buku teori pertahanan pilihanmu.');
  },
  start:function(){
    S.gen++;var myGen=S.gen;
    this.active=true;this.free=false;this.botThinking=false;this.movesPlayed=0;
    this.userColor=$('#selColor').value;
    this.defenseId=$('#selDefense').value;
    this.level=parseInt($('#selLevel').value,10)||2;
    var defLabel=$('#selDefense').selectedOptions[0].textContent;
    $('#sparMoves').innerHTML='';
    if(this.userColor==='w'){
      game=new Chess();board.orientation('white');
      coach('#coachSpar','Kamu Putih. Mainkan <b>1.e4</b> — bot akan membalas 1…e5 lalu bertahan dengan <b>'+esc(defLabel)+'</b>.');
    }else{
      game=new Chess();
      ['e4','e5','f4'].forEach(function(m){game.move(m);});
      this.movesPlayed=3;
      board.orientation('black');
      coach('#coachSpar','Posisi gambit disiapkan: 1.e4 e5 2.f4. Giliranmu sebagai Hitam — mainkan pertahanan <b>'+esc(defLabel)+'</b> (mis. '+esc(this.bookMoveHint())+').');
    }
    clearHl();refresh();this.renderMoves();
    this.maybeBotMove(myGen);
  },
  bookMoveHint:function(){
    var L=lineById(this.defenseId);
    return L?L.moves[this.movesPlayed]||'—':'—';
  },
  /* langkah buku untuk bot pada posisi saat ini (hanya lini pertahanan terpilih) */
  bookMove:function(){
    var cands=Book.byFen[game.fen()]||[];
    for(var i=0;i<cands.length;i++)
      if(cands[i].line===this.defenseId)return cands[i];
    return null;
  },
  userMove:function(src,tgt){
    if(!this.active){coach('#coachSpar','Tekan "Mulai Sparring" dulu.');return;}
    if(game.turn()!==this.userColor){coach('#coachSpar','Bukan giliranmu.');return;}
    var mv=applyUserMove(src,tgt);
    if(!mv)return;
    this.movesPlayed++;this.renderMoves();
    if(this.checkOver())return;
    var myGen=S.gen;
    // fase pembuka saat user Putih: paksa 1...e5 setelah 1.e4
    if(this.userColor==='w'&&this.movesPlayed===1){
      var firstMove=game.history()[0];
      if(firstMove!=='e4'){
        this.free=true;
        coach('#coachSpar','Kamu membuka dengan '+esc(firstMove||'?')+' — bukan 1.e4, jadi King\'s Gambit batal. Lanjut main bebas ya.');
        this.maybeBotMove(myGen);return;
      }
      var botC=this.botColor();
      if(game.turn()===botC){
        var e2=game.move('e5');
        if(e2){this.movesPlayed++;Sfx.play(false);clearHl();hl(e2.from,'square-last');hl(e2.to,'square-last');refresh();this.renderMoves();
          coach('#coachSpar','1…e5 dimainkan. Sekarang <b>2.f4!</b> — ayo gambitnya.');}
      }
      return;
    }
    if(this.userColor==='w'&&this.movesPlayed===3){
      var last=game.history()[2];
      if(last!=='f4'){
        this.free=true;
        coach('#coachSpar','Kamu tidak memainkan 2.f4 ('+esc(last||'?')+') — jadi ini bukan King\'s Gambit. Lanjut main bebas melawan bot ya.');
      }else{
        coach('#coachSpar','2.f4! Gambit di papan. Bot bertahan dengan <b>'+esc($('#selDefense').selectedOptions[0].textContent)+'</b>.');
      }
    }
    // jika user Hitam menyimpang dari buku pertahanan → bebas
    if(this.userColor==='b'&&!this.free){
      var L=lineById(this.defenseId);
      var g=new Chess();
      var ok=true,h=game.history();
      for(var i=0;i<h.length&&i<L.moves.length;i++){if(h[i]!==new Chess(g.fen()).move(L.moves[i]).san){ok=false;break;}g.move(L.moves[i]);}
      if(!ok){this.free=true;coach('#coachSpar','Kamu keluar dari jalur buku — lanjut main bebas. Bagus, latihan itu soal keberanian juga.');}
    }
    this.maybeBotMove(myGen);
  },
  botColor:function(){return this.userColor==='w'?'b':'w';},
  maybeBotMove:function(myGen){
    var self=this;
    if(!self.active||self.botThinking)return;
    if(game.game_over())return;
    if(game.turn()!==self.botColor())return;
    self.botThinking=true;
    coach('#coachSpar','Bot berpikir…');
    setTimeout(function(){self.doBotMove(myGen);},450);
  },
  doBotMove:function(myGen){
    var self=this;
    self.botThinking=false;
    if(!self.active||myGen!==S.gen||S.mode!=='sparring')return;
    if(game.turn()!==self.botColor())return;
    var L=self.LEVELS[self.level];
    var choice=null,viaBook=false;
    if(!self.free){
      var b=self.bookMove();
      if(b){choice={from:b.from,to:b.to,promotion:'q'};viaBook=true;}
    }
    var done=function(ch){
      if(!ch)return;
      var mv=game.move({from:ch.from,to:ch.to,promotion:ch.promotion||'q'});
      if(!mv)return;
      Sfx.play(!!mv.captured);
      self.movesPlayed++;clearHl();hl(mv.from,'square-last');hl(mv.to,'square-last');
      refresh();self.renderMoves();
      if(self.checkOver())return;
      coach('#coachSpar',viaBook?('Bot (buku teori): <b>'+esc(mv.san)+'</b>. Giliranmu.'):'Giliranmu.');
    };
    if(choice){done(choice);return;}
    // engine (dengan blunder untuk level rendah)
    if(Math.random()<L.blunder){
      var all=game.moves({verbose:true});
      var pick=all[Math.floor(Math.random()*all.length)];
      done({from:pick.from,to:pick.to,promotion:pick.promotion});return;
    }
    Engine.analyze(game.fen(),L.depth,L.timeMs).then(function(d){
      if(!self.active||myGen!==S.gen||S.mode!=='sparring')return;
      if(d.ok&&d.r&&d.r.best)done(d.r.best);
      else{
        var all2=game.moves({verbose:true});
        if(all2.length){var p2=all2[0];done({from:p2.from,to:p2.to,promotion:p2.promotion});}
      }
    });
  },
  renderMoves:function(){
    var h=game.history(),html='';
    for(var i=0;i<h.length;i+=2)
      html+='<li>'+(i/2+1)+'. '+esc(h[i])+(h[i+1]?' '+esc(h[i+1]):'')+'</li>';
    $('#sparMoves').innerHTML=html;
  },
  checkOver:function(){
    if(!game.game_over())return false;
    var msg;
    if(game.in_checkmate())msg=game.turn()!==this.userColor?'Kamu menang — MAT!':'Bot menang — mat. Coba lagi!';
    else if(game.in_stalemate())msg='Remis — stalemate.';
    else if(game.in_threefold_repetition())msg='Remis — repetisi.';
    else if(game.in_insufficient_material())msg='Remis — materi kurang.';
    else msg='Remis.';
    this.active=false;
    coach('#coachSpar','<b>Partai selesai:</b> '+msg);
    return true;
  }
};

/* ================= PUZZLE ================= */
var Puzzle={
  idx:0,step:0,solved:0,streak:0,
  enter:function(){
    $('#btnPuzPrev').onclick=function(){Puzzle.go(Puzzle.idx-1);};
    $('#btnPuzNext').onclick=function(){Puzzle.go(Puzzle.idx+1);};
    $('#btnPuzReset').onclick=function(){Puzzle.load();};
    $('#btnPuzSkip').onclick=function(){Puzzle.go(Puzzle.idx+1);};
    this.go(0);
  },
  go:function(i){
    this.idx=(i+PUZZLES.length)%PUZZLES.length;
    this.load();
  },
  load:function(){
    var pz=PUZZLES[this.idx];
    this.step=0;
    game=new Chess(pz.fen);
    board.orientation(pz.side);clearHl();refresh();
    $('#puzTitle').textContent='Puzzle '+(this.idx+1)+'/'+PUZZLES.length+': '+pz.title+' ('+(pz.side==='w'?'Putih':'Hitam')+' melangkah)';
    this.score();
    coach('#coachPuz','Temukan langkah terbaik'+(pz.solution.length>1?' ('+pz.solution.length+' langkah)':'')+'.');
  },
  score:function(){$('#puzScore').textContent='Benar: '+this.solved+' · Streak: '+this.streak;},
  expected:function(){
    var pz=PUZZLES[this.idx];
    if(this.step>=pz.solution.length)return null;
    var g=new Chess(game.fen());
    return g.move(pz.solution[this.step],{verbose:true});
  },
  userMove:function(src,tgt){
    var e=this.expected();
    if(!e)return;
    if(src===e.from&&tgt===e.to){
      applyUserMove(src,tgt);
      this.step++;
      var pz=PUZZLES[this.idx];
      if(this.step>=pz.solution.length){
        this.solved++;this.streak++;this.score();
        var self=this;
        coach('#coachPuz','Tepat sekali! Lanjut ke puzzle berikutnya…');
        setTimeout(function(){if(S.mode==='puzzle')self.go(self.idx+1);},1400);
      }else{
        // langkah balasan otomatis bila ada
        var reply=this.expected();
        if(reply){
          var self2=this;
          setTimeout(function(){
            if(S.mode!=='puzzle')return;
            var r=game.move({from:reply.from,to:reply.to,promotion:'q'});
            if(r){self2.step++;Sfx.play(!!r.captured);clearHl();hl(r.from,'square-last');hl(r.to,'square-last');refresh();
              if(self2.step>=PUZZLES[self2.idx].solution.length){
                self2.solved++;self2.streak++;self2.score();
                coach('#coachPuz','Tepat sekali! Lanjut…');
                setTimeout(function(){if(S.mode==='puzzle')self2.go(self2.idx+1);},1400);
              }else coach('#coachPuz','Bagus — lanjutkan!');
            }
          },600);
        }else coach('#coachPuz','Bagus — lanjutkan!');
      }
    }else{
      this.streak=0;this.score();
      coach('#coachPuz','Kurang tepat. Posisi dikembalikan — coba lagi.');
      var pz2=PUZZLES[this.idx];
      game=new Chess(pz2.fen);this.step=0;clearHl();refresh();
    }
  }
};

/* ================= KUIS ================= */
var Quiz={
  scoreN:0,answered:true,
  enter:function(){
    var self=this;
    $('#btnQuizNew').onclick=function(){self.newQ();};
    $('#quizScore').textContent='Benar: 0';
    $('#quizQ').textContent='Tekan "Soal baru" untuk mulai.';
    $('#quizOpts').innerHTML='';$('#quizFb').innerHTML='';
  },
  trapQs:function(){
    var out=[];
    Object.keys(Book.byFen).forEach(function(fen){
      var c=Book.byFen[fen];if(c.length<3)return;
      var traps=c.filter(function(x){return /Jebakan|Meragukan|Blunder/.test(x.tag);});
      var good=c.filter(function(x){return /^(Utama|Teori)$/.test(x.tag);});
      if(traps.length&&good.length>=2)out.push({fen:fen,traps:traps,good:good});
    });
    return out;
  },
  newQ:function(){
    this.answered=false;
    $('#quizFb').innerHTML='';
    var traps=this.trapQs();
    if(traps.length&&Math.random()<0.45)this.trapQ(traps[Math.floor(Math.random()*traps.length)]);
    else this.theoryQ();
    $('#quizScore').textContent='Benar: '+this.scoreN;
  },
  setBoard:function(fen){
    game=new Chess(fen);
    board.orientation(game.turn());clearHl();refresh();
  },
  renderOpts:function(opts,explain){
    var box=$('#quizOpts');box.innerHTML='';var self=this;
    opts.forEach(function(o){
      var b=document.createElement('button');b.className='btn';b.innerHTML='<b>'+esc(o.san)+'</b>'+(o.tag?' <span class="meta">'+esc(o.tag)+'</span>':'');
      b.onclick=function(){
        if(self.answered)return;self.answered=true;
        box.querySelectorAll('button').forEach(function(x){x.disabled=true;});
        if(o.ok){b.classList.add('ok');self.scoreN++;$('#quizScore').textContent='Benar: '+self.scoreN;coach('#quizFb','Benar! '+explain);}
        else{b.classList.add('no');coach('#quizFb','Kurang tepat. '+explain);}
      };
      box.appendChild(b);
    });
  },
  theoryQ:function(){
    var L=LINES[Math.floor(Math.random()*LINES.length)];
    var maxPly=Math.min(5,L.moves.length-1);
    var ply=Math.floor(Math.random()*(maxPly+1));
    var g=new Chess();
    for(var i=0;i<ply;i++)g.move(L.moves[i]);
    this.setBoard(g.fen());
    var g2=new Chess(g.fen());
    var correct=g2.move(L.moves[ply],{verbose:true});
    if(!correct){this.newQ();return;}
    var others=g.moves({verbose:true}).filter(function(m){return !(m.from===correct.from&&m.to===correct.to);});
    for(var k=others.length-1;k>0;k--){var j=Math.floor(Math.random()*(k+1));var t=others[k];others[k]=others[j];others[j]=t;}
    var opts=[{san:correct.san,ok:true}];
    others.slice(0,2).forEach(function(m){opts.push({san:m.san,ok:false});});
    for(var k2=opts.length-1;k2>0;k2--){var j2=Math.floor(Math.random()*(k2+1));var t2=opts[k2];opts[k2]=opts[j2];opts[j2]=t2;}
    $('#quizQ').innerHTML='Setelah '+ply+' langkah pada <b>'+esc(L.name)+'</b> — apa langkah teori untuk '+(correct.color==='w'?'Putih':'Hitam')+'?';
    this.renderOpts(opts,'Jawabannya: <b>'+esc(correct.san)+'</b>.'+((L.notes&&L.notes[ply])?' '+esc(L.notes[ply]):''));
  },
  trapQ:function(t){
    this.setBoard(t.fen);
    var g=new Chess(t.fen);
    var good=t.good.slice();
    for(var k=good.length-1;k>0;k--){var j=Math.floor(Math.random()*(k+1));var tmp=good[k];good[k]=good[j];good[j]=tmp;}
    var opts=[{san:t.traps[0].san,ok:true,tag:t.traps[0].tag}];
    good.slice(0,2).forEach(function(x){opts.push({san:x.san,ok:false,tag:x.tag});});
    for(var k2=opts.length-1;k2>0;k2--){var j2=Math.floor(Math.random()*(k2+1));var t2=opts[k2];opts[k2]=opts[j2];opts[j2]=t2;}
    $('#quizQ').innerHTML='Posisi teori — giliran '+(g.turn()==='w'?'Putih':'Hitam')+'. <b>Manakah yang jebakan?</b>';
    this.renderOpts(opts,'Jebakannya: <b>'+esc(t.traps[0].san)+'</b> ('+esc(t.traps[0].tag)+').');
  }
};

/* ---------- init ---------- */
Engine.init();
Sfx.init();
$('#btnFlip').addEventListener('click',function(){board.flip();});
var sfxBtn=$('#btnSfx');
sfxBtn.textContent='Suara: '+(Sfx.on?'on':'off');
sfxBtn.addEventListener('click',function(){sfxBtn.textContent='Suara: '+(Sfx.toggle()?'on':'off');});
Learn.enter();
refresh();

/* hook untuk automated test (diabaikan browser) */
if(typeof window!=='undefined')window.__kgm={Learn:Learn,Sparring:Sparring,Puzzle:Puzzle,Quiz:Quiz,Book:Book,DEFENSES:DEFENSES,S:S,
  getGame:function(){return game;},setGame:function(g){game=g;}};
})();
